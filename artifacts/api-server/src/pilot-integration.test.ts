// Actual app/router/auth/security stack. Clerk, database and storage boundaries
// are isolated fixtures; no tokens, live services or real data are used.
import type {AddressInfo} from "node:net";
import {beforeAll,afterAll,beforeEach,it,expect,vi} from "vitest";
// Module collection loads the actual application outside the server-lifecycle hook.
// Only non-secret test environment settings are supplied before imports evaluate.
vi.hoisted(()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("ALLOWED_ORIGINS","http://localhost:8080");});
const state=vi.hoisted(()=>({auth:vi.fn(),user:{id:"11111111-1111-4111-8111-111111111111",clerkUserId:"fixture",email:"fixture@example.invalid",displayName:"Fixture",role:"ADMIN",status:"ACTIVE",createdAt:new Date(),updatedAt:new Date(),lastLoginAt:new Date()},
  question:null as any,options:[] as any[],transaction:vi.fn(),execute:vi.fn(),revision:vi.fn(),media:vi.fn(),exam:vi.fn(),practice:vi.fn()}));
vi.mock("@clerk/express",()=>({getAuth:state.auth,clerkMiddleware:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock("./lib/logger",async()=>({logger:(await import("pino")).default({enabled:false})}));
vi.mock("./middlewares/clerkProxyMiddleware",()=>({CLERK_PROXY_PATH:"/api/__clerk",getClerkProxyHost:()=>undefined,clerkProxyMiddleware:()=> (_req:any,res:any)=>res.json({proxyFixture:true})}));
vi.mock("./lib/question-revisions",async original=>({...await original<typeof import("./lib/question-revisions")>(),captureQuestionRevision:state.revision}));
vi.mock("./lib/lesson-media",async original=>({...await original<typeof import("./lib/lesson-media")>(),readLessonMedia:state.media}));
vi.mock("./lib/exams",async original=>({...await original<typeof import("./lib/exams")>(),examStart:state.exam}));
vi.mock("./lib/practice-batch",async original=>({...await original<typeof import("./lib/practice-batch")>(),startPracticeBatch:state.practice}));
vi.mock("@workspace/db",async()=>{
  const schema=await import("@workspace/db/schema");
  const db:any={transaction:state.transaction,execute:state.execute};
  db.select=()=>{let table:unknown;const chain:any={from:(t:unknown)=>{table=t;return chain;},where:()=>chain,limit:()=>chain,orderBy:()=>chain,for:()=>chain,
    then:(resolve:any,reject:any)=>Promise.resolve(table===schema.usersTable?[state.user]:table===schema.questionOptionsTable?state.options:table===schema.questionsTable?[state.question]:[{id:"chapter",status:"ACTIVE"}]).then(resolve,reject)};return chain;};
  db.update=(table:unknown)=>{let patch:any;const chain:any={set:(value:any)=>{patch=value;return chain;},where:()=>chain,returning:async()=>table===schema.usersTable?[state.user]:[state.question={...state.question,...patch}]};return chain;};
  db.delete=()=>({where:async()=>{state.options=[];}});
  db.insert=(table:unknown)=>({values:(value:any)=>({returning:async()=>{
    if(table===schema.questionsTable)return[state.question={id:"22222222-2222-4222-8222-222222222222",questionCode:"CCNA-Q-999999",createdAt:new Date(),updatedAt:new Date(),...value}];
    return state.options=value;
  }})});
  state.transaction.mockImplementation(async(fn:any)=>fn(db));return {...schema,db};
});
import app from "./app";
import {PgDialect} from "drizzle-orm/pg-core";
import {ccnaBookChapters} from "../../../lib/ccna-book-chapters";
let server:ReturnType<import("express").Express["listen"]>|undefined,base:string;
const id="22222222-2222-4222-8222-222222222222",session="fixture-session",token="a".repeat(64);
const question={topicId:ccnaBookChapters[0].topicId,text:"Which protocol delivers reliable transport?",type:"MULTIPLE_CHOICE_SINGLE",difficulty:"EASY",explanation:"TCP delivers reliable ordered transport.",status:"ACTIVE",
  options:[{optionKey:"A",text:"TCP",isCorrect:true},{optionKey:"B",text:"UDP",isCorrect:false}]};
const post=(body:unknown)=>({method:"POST",headers:{"Content-Type":"application/json","X-Admin-Session":session,"X-Practice-Session":session,Origin:"http://localhost:8080"},body:JSON.stringify(body)});
beforeAll(async()=>{
  const fixture=app.listen(0,"127.0.0.1");server=fixture;
  await new Promise<void>((resolve,reject)=>{fixture.once("listening",resolve);fixture.once("error",reject);});
  base=`http://127.0.0.1:${(fixture.address() as AddressInfo).port}/api`;
});
afterAll(async()=>{
  try{const fixture=server;if(fixture?.listening)await new Promise<void>((resolve,reject)=>fixture.close(error=>error?reject(error):resolve()));}
  finally{server=undefined;vi.unstubAllEnvs();}
});
beforeEach(()=>{
  state.user.role="ADMIN";state.user.status="ACTIVE";state.auth.mockReturnValue({userId:"fixture",sessionId:session,sessionClaims:{email:"fixture@example.invalid",role:"ADMIN"}});
  state.revision.mockResolvedValue({id:"revision"});state.execute.mockReset();
});
it("health/proxy and JSON 404 remain accessible while private routes enforce real auth middleware",async()=>{
  state.auth.mockReturnValue({userId:null});
  expect((await fetch(base+"/healthz")).status).toBe(200);
  expect(await (await fetch(base+"/__clerk")).json()).toEqual({proxyFixture:true});
  for(const p of ["/admin/learners","/exams","/lesson-media/"+id])expect((await fetch(base+p)).status).toBe(401);
  const missing=await fetch(base+"/unknown");expect(missing.status).toBe(404);expect(await missing.json()).toMatchObject({error:{code:"NOT_FOUND"}});
});
it("creates non-live through the actual admin route and explicitly publishes through Studio",async()=>{
  const created=await fetch(base+"/admin/questions",post(question));expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({id,status:"DISABLED"});expect(state.question.status).toBe("DISABLED");
  const bypass=await fetch(base+"/admin/questions/"+id,{...post({status:"ACTIVE"}),method:"PATCH"});expect(bypass.status).toBe(400);
  state.execute.mockImplementation(async(statement:any)=>{const text=new PgDialect().sqlToQuery(statement).sql;
    return {rows:text.includes('AS "editToken"')?[{editToken:token}]:text.includes("SELECT status FROM public.topics")?[{status:"ACTIVE"}]:text.includes("FOR UPDATE")?[{id}]:[]};});
  const published=await fetch(base+"/admin/questions/studio/"+id,{...post({question,assignments:[],expectedToken:token}),method:"PATCH"});
  expect(published.status).toBe(200);expect(await published.json()).toMatchObject({question:{id,status:"ACTIVE"},editToken:token});
  expect(state.revision).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({id,status:"ACTIVE"}));
});
it("DB role overrides claimed ADMIN; monitoring is read-only and never reads lesson-private records",async()=>{
  state.user.role="USER";state.execute.mockClear();expect((await fetch(base+"/admin/learners")).status).toBe(403);expect(state.execute).not.toHaveBeenCalled();
  state.user.role="ADMIN";const sqls:string[]=[];
  state.execute.mockImplementation(async(q:any)=>{const text=new PgDialect().sqlToQuery(q).sql;sqls.push(text);return {rows:text.includes("has_table_privilege")?[{allowed:true}]:text.includes("AS total")?[{total:1}]:text.includes("FROM public.users u")?[{id:state.user.id,role:"ADMIN",practiceAttempts:2,examSessions:1}]:[]};});
  const res=await fetch(base+"/admin/learners?pageSize=10");expect(res.status).toBe(200);expect(res.headers.get("cache-control")).toBe("no-store");expect(await res.json()).toMatchObject({total:1,lessonActivity:null});
  expect(sqls[0]).toContain("READ ONLY");expect(sqls.join(" ")).not.toMatch(/lesson_progress|lesson_annotations|\b(?:INSERT|UPDATE|DELETE|GRANT)\b/);
});
it("authorized image bytes/cache validation and exam/practice intent headers survive the middleware",async()=>{
  state.media.mockResolvedValue({bytes:Buffer.from([137,80,78,71]),mime:"image/png",sha256:"a".repeat(64)});
  const image=await fetch(base+"/lesson-media/"+id+"?variant=thumbnail",{headers:{Origin:"http://localhost:8080"}});expect(image.status).toBe(200);expect(image.headers.get("content-type")).toContain("image/png");expect((await image.arrayBuffer()).byteLength).toBe(4);
  for(const vary of ["origin","authorization","cookie"])expect(image.headers.get("vary")?.toLowerCase()).toContain(vary);
  expect((await fetch(base+"/lesson-media/"+id,{headers:{"If-None-Match":'"'+"a".repeat(64)+'"'}})).status).toBe(304);
  state.exam.mockResolvedValue({id,status:"ACTIVE"});const exam=await fetch(base+"/exams",post({requestId:id,questionCount:10,durationMinutes:12}));expect(exam.status).toBe(200);expect(state.exam).toHaveBeenCalledWith(expect.anything(),state.user.id,session);
  const conflict=await fetch(base+"/exams",{...post({}),headers:{"Content-Type":"application/json"}});expect(conflict.status).toBe(409);
  state.practice.mockResolvedValue({questions:[]});expect((await fetch(base+"/practice/sessions",post({topicId:question.topicId,count:1}))).status).toBe(201);
  state.user.status="DISABLED";expect((await fetch(base+"/exams")).status).toBe(403);
});
