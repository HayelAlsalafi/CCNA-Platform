import { expect,it,vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db",()=>({db:undefined}));
import { courseLearningAnalytics,courseAnalyticsSummary } from "./course-learning-analytics";
const user="11111111-1111-4111-8111-111111111111",course="22222222-2222-4222-8222-222222222222",version="33333333-3333-4333-8333-333333333333";
const unknown={attribution:"UNKNOWN",scoped:null,unattributedOwnerHistory:{lessonProgressRecords:3,practiceAttempts:7,examSessions:2}};
function fixture(owned=true,summary:unknown=unknown) {
  const calls:{sql:string;params:unknown[]}[]=[],options:unknown[]=[];
  const database:any={execute:vi.fn(async(q:any)=>{const query=new PgDialect().sqlToQuery(q);calls.push(query);return {rows:query.sql.includes("SELECT v.id")?(owned?[{id:version}]:[]):query.sql.includes("WITH epochs")?[{value:summary}]:[]};}),transaction:async(fn:any,opt:unknown)=>{options.push(opt);return fn(database);}};
  return {database,calls,options};
}
it("does not expose any history before verifying the caller's exact enrollment/course/version",async()=>{
  const f=fixture(false);await expect(courseLearningAnalytics(user,course,version,f.database)).rejects.toMatchObject({code:"P0002"});
  expect(f.calls).toHaveLength(2);expect(f.calls[1].params).toEqual([user,version,course]);expect(f.calls[1].sql).toContain("en.user_id=");
});
it("returns UNKNOWN without turning unknown history into a zero-score course or assigning it to a version",async()=>{
  const f=fixture(),result=await courseLearningAnalytics(user,course,version,f.database);
  expect(result).toEqual({courseId:course,versionId:version,...unknown});expect(result.scoped).toBeNull();
  expect(f.options).toEqual([{accessMode:"read only",isolationLevel:"repeatable read"}]);
  expect(f.calls[0].params).toContain(user);expect(f.calls[0].sql).toContain("set_config('app.study_user'");
});
it("requires matching immutable epoch, captured IDs, complete single-version exams and explicit owner filters",async()=>{
  const f=fixture();await courseLearningAnalytics(user,course,version,f.database);const q=f.calls[2];
  for(const proof of ["e.binding_hash=", "r.created_at>=e.valid_from", "d.delivered_at>=e.valid_from", "p.submitted_at>=e.valid_from", "s.started_at>=e.valid_from", "count(i.attributed)=s.question_count", "count(DISTINCT i.attributed)=1", "i.mapping_snapshot->'chapter'->>'id'=r.snapshot->'topic'->>'id'"])
    expect(q.sql).toContain(proof);
  expect(q.sql.match(/(?:p|s)\.user_id=/g)).toHaveLength(4);expect(q.params.filter(p=>p===user)).toHaveLength(4);
  expect(q.sql).not.toMatch(/JOIN public\.questions|lesson_annotations|selected_keys|graded_result|\b(?:UPDATE|INSERT|DELETE)\b/);
  expect(q.sql).toContain("WHERE attributed IS NULL");expect(q.sql).toContain("WHERE attributed=");
});
it("preserves proven aggregate evidence and mean stored results rather than regrading",async()=>{
  const summary={attribution:"EPOCH_BOUND",scoped:{lessonProgressRecords:2,completedProgressRecords:1,practiceAttempts:4,correctPracticeAttempts:3,examSessions:1,finalizedExamSessions:1,meanStoredExamPercentage:20},unattributedOwnerHistory:{lessonProgressRecords:3,practiceAttempts:0,examSessions:2}};
  const f=fixture(true,summary);expect(await courseLearningAnalytics(user,course,version,f.database)).toEqual({courseId:course,versionId:version,...summary});
  expect(f.calls[2].sql).toContain("result->>'percentage'");expect(f.calls[2].sql).not.toContain("is_correct)=");
});
it("fails closed for malformed/inconsistent evidence instead of fabricating analytics",async()=>{
  for(const summary of [{...unknown,scoped:{}},{...unknown,unattributedOwnerHistory:{lessonProgressRecords:-1,practiceAttempts:0,examSessions:0}},{...unknown,notes:"private text"}]){
    expect(courseAnalyticsSummary.safeParse(summary).success).toBe(false);
    await expect(courseLearningAnalytics(user,course,version,fixture(true,summary).database)).rejects.toMatchObject({code:"55000"});
  }
});
