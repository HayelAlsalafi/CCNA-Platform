import { readFileSync } from "node:fs";
import { expect,it,vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
vi.mock("@workspace/db",()=>({db:undefined,pool:{query:()=>{throw Error("Live DB forbidden");}}}));
import { courseEnrollmentsTable,courseAttributionEpochsTable } from "@workspace/db/schema";
import { createEnrollmentService,enrollmentChangeInput,validEnrollmentTransition } from "./course-enrollments";
const user="11111111-1111-4111-8111-111111111111",course="22222222-2222-4222-8222-222222222222",version="33333333-3333-4333-8333-333333333333",id="44444444-4444-4444-8444-444444444444";
const input={courseId:course,versionId:version,status:"ACTIVE",expectedVersion:0,requestId:id};
const result={id,courseId:course,versionId:version,status:"ACTIVE",version:1};
const listing={items:[],total:0,page:1,pageSize:20};
it("never queries or changes enrollment while disabled",async()=>{
  const query=vi.fn(),access=vi.fn(),analytics=vi.fn(),s=createEnrollmentService(query,access,analytics,()=>false);
  for(const run of [()=>s.list(user,{}),()=>s.change(user,input),()=>s.analytics(user,{courseId:course,versionId:version})])
    await expect(run()).rejects.toMatchObject({code:"ENROLLMENT_NOT_READY"});
  expect(query).not.toHaveBeenCalled();expect(access).not.toHaveBeenCalled();expect(analytics).not.toHaveBeenCalled();
});
it("defines an explicit lifecycle without self-asserted completion, purchases or role changes",()=>{
  expect(validEnrollmentTransition(null,"ACTIVE")).toBe(true);
  for(const [before,after,valid] of [[null,"PAUSED",false],[null,"WITHDRAWN",false],["ACTIVE","PAUSED",true],["PAUSED","ACTIVE",true],["WITHDRAWN","ACTIVE",true],["WITHDRAWN","PAUSED",false],["ACTIVE","ACTIVE",false],["PAUSED","WITHDRAWN",true]] as const)
    expect(validEnrollmentTransition(before,after)).toBe(valid);
  for(const patch of [{status:"COMPLETED"},{userId:user},{actorId:user},{role:"OWNER"},{entitled:true},{courseId:"ccna"}])
    expect(enrollmentChangeInput.safeParse({...input,...patch}).success).toBe(false);
});
it("requires metadata discovery for starting/resuming, never treats enrollment as an entitlement",async()=>{
  const query=vi.fn(),access=vi.fn().mockResolvedValue(false),s=createEnrollmentService(query,access,vi.fn(),()=>true);
  await expect(s.change(user,input)).rejects.toMatchObject({status:403});
  expect(access).toHaveBeenCalledWith(user,version);expect(query).not.toHaveBeenCalled();
});
it("permits only explicit self-service inputs and passes the verified actor separately",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{value:result}]}),s=createEnrollmentService(query,vi.fn().mockResolvedValue(true),vi.fn(),()=>true);
  expect(await s.change(user,input)).toEqual(result);
  expect(query.mock.calls[0][1]).toEqual([user,course,version,"ACTIVE",0,id]);
  expect(query.mock.calls[0][0]).toContain("course_enrollment_change");
  for(const patch of [{userId:id},{versionId:"bad"},{expectedVersion:-1}])await expect(s.change(user,{...input,...patch})).rejects.toMatchObject({status:400});
  expect(query).toHaveBeenCalledTimes(1);
});
it("allows withdrawal after access expiry and retirement without granting access or retrying conflicts",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{value:{...result,status:"WITHDRAWN",version:3}}]}),access=vi.fn(),s=createEnrollmentService(query,access,vi.fn(),()=>true);
  expect(await s.change(user,{...input,status:"WITHDRAWN",expectedVersion:2})).toMatchObject({status:"WITHDRAWN"});
  expect(access).not.toHaveBeenCalled();query.mockRejectedValue({code:"40001"});
  await expect(s.change(user,{...input,status:"PAUSED",expectedVersion:2})).rejects.toMatchObject({code:"40001"});
  expect(query).toHaveBeenCalledTimes(2);
});
it("bounds owner-only reads and refuses actor injection and malformed or cross-course outcomes",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{value:listing}]}),s=createEnrollmentService(query,vi.fn().mockResolvedValue(true),vi.fn(),()=>true);
  expect(await s.list(user,{})).toEqual(listing);expect(query.mock.calls[0][1]).toEqual([user,1]);
  for(const q of [{page:0},{page:10001},{userId:id}])await expect(s.list(user,q)).rejects.toMatchObject({status:400});
  query.mockResolvedValue({rows:[{value:{...result,courseId:id}}]});
  await expect(s.change(user,input)).rejects.toMatchObject({code:"ENROLLMENT_RESULT_UNVERIFIED"});
});
it("validates exact analytics context and never accepts a learner ID from the request",async()=>{
  const analytics=vi.fn().mockResolvedValue({attribution:"UNKNOWN"}),s=createEnrollmentService(vi.fn(),vi.fn(),analytics,()=>true);
  await s.analytics(user,{courseId:course,versionId:version});expect(analytics).toHaveBeenCalledWith(user,course,version);
  await expect(s.analytics(user,{courseId:course,versionId:version,userId:id})).rejects.toMatchObject({status:400});
  expect(analytics).toHaveBeenCalledTimes(1);
});
it("prepares unique owner/version bindings, RLS, narrow atomic operations, and no seeded history",()=>{
  const schema=getTableConfig(courseEnrollmentsTable);
  expect(schema.enableRLS).toBe(true);expect(schema.uniqueConstraints.find(c=>c.name==="course_enrollments_owner_version_uq")?.columns.map(c=>c.name)).toEqual(["user_id","course_version_id"]);
  expect(getTableConfig(courseAttributionEpochsTable).columns.find(c=>c.name==="course_version_id")?.primary).toBe(true);
  const sql=readFileSync(new URL("../../../../lib/db/drizzle/proposed/0022_course_enrollment_analytics.sql",import.meta.url),"utf8");
  expect(sql).toContain("WHERE user_id=actor AND request_id=request");expect(sql).toContain("prior.request_hash<>digest");expect(sql).toContain("RETURN prior.result");
  expect(sql).toContain("before_row.version<>expected_version");expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql.indexOf("UPDATE public.course_enrollments SET")).toBeLessThan(sql.indexOf("INSERT INTO public.course_enrollment_events"));
  expect(sql).toContain("NEW.valid_from:=clock_timestamp()");expect(sql).toContain("NEW.binding_hash");
  expect(sql.indexOf("IF NOT has_enrollment AND next_status<>'ACTIVE'")).toBeLessThan(sql.indexOf("-- Exact belonging context"));
  expect(sql).toContain("GRANT SELECT(course_version_id,valid_from,binding_hash)");
  expect(sql).toContain("user_id=nullif(current_setting('app.study_user',true),'')::uuid");
  expect(sql).not.toMatch(/UPDATE public\.(?:users|lessons|questions|exam_sessions)|INSERT INTO public\.course_attribution_epochs|GRANT (?:INSERT|UPDATE|ALL)|ALTER TABLE public\.lesson_/);
});
