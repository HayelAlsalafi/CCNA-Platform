import { beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({routes:new Map<string,Function[]>(),middleware:[] as Function[],authenticated:true,list:vi.fn(),change:vi.fn(),analytics:vi.fn()}));
vi.mock("express",()=>({default:{json:()=> (_req:any,_res:any,next:Function)=>next()},Router:()=>({
  use:(_path:string,...handlers:Function[])=>{f.middleware=handlers;},
  get:(path:string,...handlers:Function[])=>f.routes.set("GET "+path,handlers),
  post:(path:string,...handlers:Function[])=>f.routes.set("POST "+path,handlers),
})}));
vi.mock("../middlewares/auth",()=>({requireAuthenticatedUser:(_req:any,res:any,next:Function)=>f.authenticated?next():res.status(401).json({error:{code:"UNAUTHENTICATED"}})}));
vi.mock("../lib/course-enrollments",()=>({courseEnrollments:{list:f.list,change:f.change,analytics:f.analytics},EnrollmentError:class extends Error{constructor(public status:number,public code:string,message:string){super(message);}}}));
import "./course-enrollments";
const actor="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{f.authenticated=true;for(const fn of [f.list,f.change,f.analytics])fn.mockReset().mockResolvedValue({});});
async function request(path="GET /enrollments",patch:Record<string,unknown>={}) {
  const req:any={dbUser:{id:actor,role:"USER"},verifiedAuth:{sessionId:"verified-session"},query:{},params:{courseId:"course",versionId:"version"},body:{},get:()=>"verified-session",...patch};
  const res:any={code:200,headers:{},status(n:number){this.code=n;return this;},set(k:string,v:string){this.headers[k]=v;return this;},json(value:unknown){this.body=value;return this;}};
  const handlers=[...f.middleware,...f.routes.get(path)!];
  async function run(i:number):Promise<void>{if(i===handlers.length)return;let next:Promise<void>|undefined;await handlers[i](req,res,()=>{next=run(i+1);});await next;}
  await run(0);return res;
}
it("requires verified authentication and no-store for all enrollment endpoints",async()=>{
  f.authenticated=false;
  for(const path of f.routes.keys()){const res=await request(path);expect(res.code).toBe(401);expect(res.headers["Cache-Control"]).toBe("private, no-store");}
  expect(f.list).not.toHaveBeenCalled();expect(f.change).not.toHaveBeenCalled();expect(f.analytics).not.toHaveBeenCalled();
});
it("takes learner identity only from auth, never body, query, role or token claims",async()=>{
  await request("POST /enrollments",{body:{userId:"injected"},sessionClaims:{role:"OWNER"}});
  expect(f.change).toHaveBeenCalledWith(actor,{userId:"injected"});
  await request("GET /enrollments/:courseId/versions/:versionId/analytics");
  expect(f.analytics).toHaveBeenCalledWith(actor,{courseId:"course",versionId:"version"});
});
it("rejects absent or mismatched mutation session preconditions before the workflow",async()=>{
  for(const patch of [{verifiedAuth:undefined},{get:()=>"another-session"}])expect((await request("POST /enrollments",patch)).code).toBe(409);
  expect(f.change).not.toHaveBeenCalled();
});
it("hides driver details, reports conflicts, and performs no automatic retry",async()=>{
  f.change.mockRejectedValue({code:"40001",detail:"private SQL information"});
  const res=await request("POST /enrollments");expect(res.code).toBe(409);expect(JSON.stringify(res.body)).not.toContain("private SQL");expect(f.change).toHaveBeenCalledTimes(1);
  f.analytics.mockRejectedValue({code:"P0002"});expect((await request("GET /enrollments/:courseId/versions/:versionId/analytics")).code).toBe(404);
});
