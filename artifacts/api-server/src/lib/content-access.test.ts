import { readFileSync } from "node:fs";
import { expect, it, vi, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", () => ({ db: { execute: () => { throw Error("Live DB forbidden"); } } }));
import { evaluateAccess, type AccessContext, type AccessAction, type AccessResource } from "./content-access-policy";
import { createContentAccess } from "./content-access";
import { requireContentAccessReadiness } from "../middlewares/content-access-readiness";

const user = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002";
const revision = "00000000-0000-4000-8000-000000000003", other = "00000000-0000-4000-8000-000000000004";
const actor = { id:user,status:"ACTIVE" }, resource: AccessResource = {kind:"LESSON",id};
const now = new Date("2026-11-06T10:00:00Z");
function context(): AccessContext { return { actorActive:true,resource:{...resource,available:true,policy:"ENTITLED",freeActions:[],previewActions:[],publishedRevisionId:revision,previewRevisionId:null},grants:[] }; }
const grant = () => ({userId:user,resourceId:id,actions:["lesson.read"] as AccessAction[],startsAt:"2026-11-06T09:00:00Z",endsAt:"2026-11-06T11:00:00Z",revokedAt:null});
const decide = (c: unknown, action:AccessAction="lesson.read") => evaluateAccess(actor,resource,action,c,now);
afterEach(() => vi.unstubAllEnvs());

it.each(["OWNER","ADMIN","CONTENT_MANAGER","STUDENT","USER"])("%s never implies a paid-content grant", role => {
  expect(evaluateAccess({...actor,role},resource,"lesson.read",context(),now)).toBe(false);
});
it("denies anonymous, disabled, missing, malformed, unmapped and unpublished context", () => {
  expect(evaluateAccess(null,resource,"lesson.read",context(),now)).toBe(false);
  expect(evaluateAccess({...actor,status:"DISABLED"},resource,"lesson.read",context(),now)).toBe(false);
  for(const c of [null,{}, {...context(),actorActive:false}, {...context(),resource:{...context().resource,available:false}}, {...context(),resource:{...context().resource,id:other}}]) expect(decide(c)).toBe(false);
  expect(evaluateAccess(actor,resource,"lesson.read",context(),new Date("invalid"))).toBe(false);
});
it("permits only explicitly free actions, without inheriting a course policy", () => {
  const c=context();c.resource.policy="FREE_OPEN";c.resource.freeActions=["metadata.read"];
  expect(decide(c,"metadata.read")).toBe(true);expect(decide(c)).toBe(false);
  c.resource.freeActions.push("lesson.read");expect(decide(c)).toBe(true);
  c.resource.kind="COURSE";expect(decide(c)).toBe(false);
});
it("requires exact current published revision for full-lesson/media preview", () => {
  const c=context();c.resource.policy="FREE_PREVIEW";c.resource.previewActions=["metadata.read"];
  expect(decide(c,"metadata.read")).toBe(true);expect(decide(c)).toBe(false);
  c.resource.previewActions.push("lesson.read","media.read");expect(decide(c)).toBe(false);
  c.resource.previewRevisionId=revision;expect(decide(c)).toBe(true);expect(decide(c,"media.read")).toBe(true);
  c.resource.publishedRevisionId=other;expect(decide(c)).toBe(false);expect(decide(c,"media.read")).toBe(false);
  c.resource.publishedRevisionId=null;expect(decide(c)).toBe(false);
});
it("never treats course/version preview as an exam/practice or lesson preview", () => {
  for(const kind of ["COURSE","VERSION"] as const) {
    const r={kind,id}, c=context(); c.resource={...c.resource,kind,policy:"FREE_PREVIEW",previewActions:["metadata.read","lesson.read","media.read","exam.start","practice.start"]};
    for(const action of ["lesson.read","media.read","exam.start","practice.start"] as const)
      expect(evaluateAccess(actor,r,action,c,now)).toBe(false);
  }
});
it("supports explicit course/version direct grants without descendant/future-edition inheritance", () => {
  for(const kind of ["COURSE","VERSION"] as const) {
    const c=context(),r={kind,id};c.resource.kind=kind;c.grants=[{...grant(),actions:["metadata.read"]}];
    expect(evaluateAccess(actor,r,"metadata.read",c,now)).toBe(true);
    expect(evaluateAccess(actor,{kind,id:other},"metadata.read",c,now)).toBe(false);
    expect(decide(c)).toBe(false);
  }
});
it("accepts valid direct grants and rejects expired, future, revoked, wrong-user/resource/action grants", () => {
  const c=context();c.grants=[grant()];expect(decide(c)).toBe(true);
  for(const patch of [{endsAt:now.toISOString()}, {startsAt:"2026-11-06T10:00:01Z"}, {revokedAt:now.toISOString()}, {userId:other}, {resourceId:other}, {actions:["media.read"]}, {endsAt:"2026-11-06T08:00:00Z"}]) {
    expect(decide({...c,grants:[{...grant(),...patch}]})).toBe(false);
  }
  c.grants[0].startsAt=now.toISOString();expect(decide(c)).toBe(true);
});
it("preserves authenticated legacy compatibility without a DB read; no anonymous fallback", async () => {
  const read=vi.fn(),canAccess=createContentAccess(read,()=>false,()=>now);
  expect(await canAccess(actor,resource,"lesson.read")).toBe(true);
  expect(await canAccess(null,resource,"lesson.read")).toBe(false);
  expect(await canAccess({...actor,status:"DISABLED"},resource,"lesson.read")).toBe(false);
  expect(read).not.toHaveBeenCalled();
});
it("uses only server actor and typed resource; missing schema/permissions never bypass protection", async () => {
  const c=context();c.grants=[grant()];const read=vi.fn().mockResolvedValue({rows:[{value:c}]});
  const canAccess=createContentAccess(read,()=>true,()=>now);expect(await canAccess(actor,resource,"lesson.read")).toBe(true);
  const q=new PgDialect().sqlToQuery(read.mock.calls[0][0]);expect(q.params).toEqual([user,"LESSON",id]);
  read.mockRejectedValue(new Error("private connection detail"));expect(await canAccess(actor,resource,"lesson.read")).toBe(false);
});
it("keeps the activation barrier inert by default and blocks all alternate reads when requested", () => {
  const next=vi.fn(),res:any={set:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
  vi.stubEnv("CONTENT_ACCESS_ENABLED","");requireContentAccessReadiness({} as any,res,next);expect(next).toHaveBeenCalledTimes(1);expect(res.status).not.toHaveBeenCalled();
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");requireContentAccessReadiness({} as any,res,next);
  expect(next).toHaveBeenCalledTimes(1);expect(res.status).toHaveBeenCalledWith(503);
  const index=readFileSync(new URL("../routes/index.ts",import.meta.url),"utf8");
  const barrier=index.indexOf("router.use(requireContentAccessReadiness)");
  expect(barrier).toBeGreaterThan(index.indexOf("router.use(healthRouter)"));
  for(const router of ["learningRouter","questionsRouter","practiceRouter","examsRouter","lessonsRouter","studyRouter","lessonMediaRouter","adminContentRouter"])
    expect(index.indexOf(`router.use(${router})`)).toBeGreaterThan(barrier);
});
it("prepares relational bindings, narrow read execution and no automatic grants/seeds or RLS bypass", () => {
  const sql=readFileSync(new URL("../../../../lib/db/drizzle/proposed/0021_content_access.sql",import.meta.url),"utf8");
  expect(sql).toContain("REFERENCES public.lessons(id) ON DELETE RESTRICT");
  expect(sql).toContain("REFERENCES public.lesson_revisions(id,lesson_id) ON DELETE RESTRICT");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.content_access_context(uuid,text,uuid) TO ccna_phase6a_app");
  expect(sql).toContain("SET search_path=pg_catalog");
  expect(sql).toContain("resource_id=p.id AND user_id=actor");
  expect(sql).not.toMatch(/INSERT INTO|GRANT (INSERT|UPDATE|DELETE|ALL)|ALTER POLICY|DISABLE TRIGGER|BYPASSRLS/);
});
