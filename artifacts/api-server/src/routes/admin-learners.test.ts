import express from "express";
import type { AddressInfo } from "node:net";
import { beforeAll,afterAll,it,expect,vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state=vi.hoisted(()=>({role:"ADMIN",authenticated:true,execute:vi.fn(),transaction:vi.fn()}));
vi.mock("@workspace/db",()=>({db:{transaction:state.transaction}}));
vi.mock("../middlewares/auth",()=>({
  requireAuthenticatedUser:(_req:any,res:any,next:any)=>state.authenticated?next():res.status(401).json({error:{code:"UNAUTHENTICATED"}}),
  requireAdmin:(_req:any,res:any,next:any)=>state.role==="ADMIN"?next():res.status(403).json({error:{code:"FORBIDDEN"}})
}));
import router,{learnerSummarySql,learnerPage} from "./admin-learners";
let server:ReturnType<ReturnType<typeof express>["listen"]>,base:string;
beforeAll(async()=>{const app=express();app.use("/api",router);server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/learners`;});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
it("bounds pagination and parameterizes queries without learner-private content",()=>{
  expect(learnerPage.safeParse({pageSize:51}).success).toBe(false);
  expect(learnerPage.safeParse({page:0}).success).toBe(false);
  const query=new PgDialect().sqlToQuery(learnerSummarySql(20,40));expect(query.params).toEqual([20,40]);
  expect(query.sql).not.toMatch(/lesson_progress|lesson_annotations|selected_keys|result|email|clerk/i);
});
it("rejects signed-out and non-admin callers before database work",async()=>{
  state.transaction.mockClear();state.authenticated=false;expect((await fetch(base)).status).toBe(401);
  state.authenticated=true;state.role="USER";expect((await fetch(base)).status).toBe(403);
  expect(state.transaction).not.toHaveBeenCalled();state.role="ADMIN";
});
it("returns bounded summaries with no-store through a read-only transaction",async()=>{
  const queries:string[]=[];state.execute.mockImplementation(async(q:any)=>{const text=new PgDialect().sqlToQuery(q).sql;queries.push(text);
    return {rows:text.includes("has_table_privilege")?[{allowed:true}]:text.includes("AS total")?[{total:1}]:text.includes("FROM public.users u")?[{id:"fixture",role:"USER",practiceAttempts:2,examSessions:1}]:[]};});
  state.transaction.mockImplementation(async(fn:any)=>fn({execute:state.execute}));
  const r=await fetch(base);expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.json()).toMatchObject({total:1,lessonActivity:null,items:[{id:"fixture",practiceAttempts:2}]});
  expect(queries[0]).toContain("READ ONLY");expect(queries.join(" ")).not.toMatch(/\b(UPDATE|INSERT|DELETE|GRANT)\b/);
});
it("fails closed when privileges are not confirmed",async()=>{
  state.execute.mockResolvedValue({rows:[{allowed:false}]});expect((await fetch(base)).status).toBe(503);
});
