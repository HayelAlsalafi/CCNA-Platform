import { expect,it,vi,afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db",async()=>({...await import("@workspace/db/schema"),db:undefined}));
import { privateStudyProjection,privateStudyWorkspace,privateStudyProgress } from "./private-study-access";
import { evaluateAccess,type AccessContext } from "./content-access-policy";
import { studyWorkspace,studyProgress,lessonStudy } from "./study";
import { workspaceResult,progressOverview,studyLessonResult } from "./study-validation";
const actor="11111111-1111-4111-8111-111111111111",lesson="22222222-2222-4222-8222-222222222222",revision="33333333-3333-4333-8333-333333333333",block="44444444-4444-4444-8444-444444444444";
const row={id:block,lessonId:lesson,revisionId:revision,kind:"NOTE",anchor:{blockId:block,start:0,end:12,quote:"SECRET QUOTE"},body:"My original reasoning",category:"My category",color:null,version:1,createdAt:"2026-11-01T00:00:00Z",updatedAt:"2026-11-01T00:00:00Z",lessonTitle:"SECRET TITLE",chapterTitle:"SECRET CHAPTER",domainName:"SECRET DOMAIN",domainCode:"1.0",chapterId:block,currentRevisionId:revision,snapshot:{blocks:[{text:"SECRET SNAPSHOT"}]}};
afterEach(()=>vi.unstubAllEnvs());
const dialect=new PgDialect();
function fake(reply:(sql:string,params:unknown[])=>Record<string,unknown>[]) {
  const queries:{sql:string;params:unknown[]}[]=[];
  const db:any={execute:vi.fn(async(q:any)=>{const query=dialect.sqlToQuery(q);queries.push(query);return {rows:reply(query.sql,query.params)};}),transaction:vi.fn(async(fn:any,options:any)=>{expect(options).toMatchObject({accessMode:"read only"});return fn(db);})};
  return {db,queries};
}
it("retains original notes and reference identities, redacts quotations/snapshots, never changes the stored object",()=>{
  const before=JSON.stringify(row),view=privateStudyProjection(row,false);
  expect(view.body).toBe(row.body);expect(view.category).toBe(row.category);expect(view.id).toBe(row.id);
  expect(view.anchor).toBeNull();expect(JSON.stringify(view)).not.toContain("SECRET");
  expect(JSON.stringify(row)).toBe(before);expect(view).not.toHaveProperty("snapshot");
  expect(privateStudyProjection(row,true).anchor).toEqual(row.anchor);
});
it("does not release an old saved quote through a different FREE_PREVIEW revision",()=>{
  const other="55555555-5555-4555-8555-555555555555",resource={kind:"LESSON" as const,id:lesson};
  const c:AccessContext={actorActive:true,resource:{...resource,available:true,policy:"FREE_PREVIEW",freeActions:[],previewActions:["lesson.read"],publishedRevisionId:other,previewRevisionId:other},grants:[]};
  expect(evaluateAccess({id:actor,status:"ACTIVE"},resource,"lesson.read",c,new Date(),revision)).toBe(false);
  expect(evaluateAccess({id:actor,status:"ACTIVE"},resource,"lesson.read",c,new Date(),other)).toBe(true);
});
it("keeps expired/unpublished personal workspace available under owner RLS with no excerpt-search oracle",async()=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");
  const f=fake(q=>q.includes("to_regclass")?[{ready:true}]:q.includes("content_access_context")?[{value:null}]:q.includes("count(*)")?[{total:1}]:q.includes('ar.snapshot')?[row]:[]);
  const result=workspaceResult.parse(await studyWorkspace(actor,{q:"my reasoning"},f.db));
  expect(workspaceResult.safeParse(result).success).toBe(true);
  expect(result.items[0].body).toBe(row.body);expect(result.items[0].anchor).toBeNull();expect(result.total).toBe(1);
  const count=f.queries.find(q=>q.sql.includes("count(*)"))!;
  expect(count.params).toContain(actor);expect(count.sql).toContain("a.user_id=");
  expect(count.sql).toContain("concat_ws(' ',a.body,a.category)");
  expect(count.sql).not.toMatch(/anchor.*quote|snapshot|published_revision_id|status='ACTIVE'/);
  expect(f.queries.find(q=>q.sql.includes("set_config('app.study_user'"))?.params).toContain(actor);
  expect(f.queries.every(q=>!/^\s*(UPDATE|INSERT|DELETE)/.test(q.sql))).toBe(true);
});
it("returns only actual personal progress, without inaccessible lesson titles or invented course totals",async()=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");
  const f=fake(q=>q.includes("to_regclass")?[{ready:true}]:q.includes("count(*)::int AS total FROM own")?[{total:1}]:q.includes("GROUP BY chapter_id")?[{chapterId:block,chapterTitle:"",domainName:"",domainCode:"",total:1,completed:1,inProgress:0}]:q.includes("lesson_id AS id")?[{id:lesson,title:"",chapterId:block,revisionId:revision,state:"COMPLETED",blockId:block}]:[]);
  const result=await studyProgress(actor,{},f.db);
  expect(progressOverview.safeParse(result).success).toBe(true);expect(result.lessons[0].state).toBe("COMPLETED");
  expect(result.chapters[0].total).toBe(1);expect(JSON.stringify(result)).not.toContain("SECRET");
  const q=f.queries.find(q=>q.sql.includes("FROM public.lesson_progress"))!;
  expect(q.params).toContain(actor);expect(q.sql).toContain("p.user_id=");expect(q.sql).not.toContain("snapshot");
});
it("single-lesson personal data keeps saved annotations/progress and strips paid excerpts",async()=>{
  vi.stubEnv("CONTENT_ACCESS_ENABLED","true");
  const f=fake(q=>q.includes("to_regclass")?[{ready:true}]:q.includes("content_access_context")?[{value:null}]:q.includes("FROM public.lesson_annotations")?[row]:q.includes("FROM public.lesson_progress")?[{revisionId:revision,state:"COMPLETED",blockId:block,version:2}]:[]);
  const result=studyLessonResult.parse(await lessonStudy(actor,lesson,f.db));
  expect(result.annotations[0].body).toBe(row.body);expect(result.annotations[0].anchor).toBeNull();expect(result.progress.state).toBe("COMPLETED");
  expect(f.queries.some(q=>q.sql.includes("SELECT l.id,r.id AS"))).toBe(false);
});
it("standalone privacy readers use only parameterized owner filters and no writes",async()=>{
  const f=fake(q=>q.includes("count(*)")?[{total:0}]:[]);
  await privateStudyWorkspace(actor,{},f.db);await privateStudyProgress(actor,{},f.db);
  for(const q of f.queries){expect(q.params).toContain(actor);expect(q.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/);}
});
