import { beforeEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({routes:new Map<string,Function[]>(),middleware:[] as Function[],authenticated:true,role:'OWNER' as string|null,read:vi.fn(),change:vi.fn()}));
vi.mock('express',()=>({Router:()=>({
  use:(_path:string,...handlers:Function[])=>{fixture.middleware=handlers;},
  get:(path:string,...handlers:Function[])=>fixture.routes.set('GET '+path,handlers),
  post:(path:string,...handlers:Function[])=>fixture.routes.set('POST '+path,handlers),
})}));
vi.mock('@workspace/db',()=>({pool:{query:()=>{throw Error('No real DB permitted');}}}));
vi.mock('../middlewares/auth',()=>({requireAuthenticatedUser:(_req:any,res:any,next:Function)=>fixture.authenticated?next():res.status(401).json({error:{code:'UNAUTHENTICATED'}})}));
vi.mock('../lib/global-rbac',async original=>{
 const actual=await original<typeof import('../lib/global-rbac')>();
 return {...actual,globalRbac:actual.createGlobalRbacService((text,values)=>fixture.read(text,values),(text,values)=>fixture.change(text,values),()=>true)};
});
import './global-rbac';
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
const body={scope:'GLOBAL',targetId:target,role:'STUDENT',expectedVersion:0,requestId:'00000000-0000-4000-8000-000000000003',reason:'Explicitly reviewed change'};
beforeEach(()=>{
 fixture.authenticated=true;fixture.role='OWNER';fixture.read.mockReset();fixture.change.mockReset();
 fixture.read.mockImplementation(async(text:string)=>({rows:[{value:text.includes('context')?{role:fixture.role,scope:'GLOBAL'}:{items:[],total:0}}]}));
 fixture.change.mockResolvedValue({rows:[{value:{eventId:body.requestId}}]});
});
async function request(method='GET',path='/admin/rbac/users',patch:Record<string,unknown>={}){
 const req:any={method,headers:{'x-admin-session':'verified-session'},dbUser:{id:actor,role:'USER'},verifiedAuth:{userId:actor,sessionId:'verified-session'},query:{},body,...patch};
 const res:any={statusCode:200,headers:{},body:undefined,status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;return this;},set(name:string,value:string){this.headers[name]=value;return this;},setHeader(name:string,value:string){this.headers[name]=value;}};
 const handlers=[...fixture.middleware,...fixture.routes.get(method+' '+path)!];
 async function run(i:number):Promise<void>{if(i>=handlers.length)return;let next:Promise<void>|undefined;await handlers[i](req,res,()=>{next=run(i+1);});await next;}
 await run(0);return res;
}
it('rejects unsigned requests before RBAC queries',async()=>{
 fixture.authenticated=false;expect((await request()).statusCode).toBe(401);expect(fixture.read).not.toHaveBeenCalled();
});
it('does not promote a legacy ADMIN or trust claimed token roles',async()=>{
 fixture.role=null;expect((await request('GET','/admin/rbac/users',{dbUser:{id:actor,role:'ADMIN'},sessionClaims:{role:'OWNER'}})).statusCode).toBe(403);
 expect(fixture.change).not.toHaveBeenCalled();
});
it('allows explicit database authority with legacy USER and verifies no-store',async()=>{
 const result=await request();expect(result.statusCode).toBe(200);expect(result.headers['Cache-Control']).toBe('no-store');expect(result.body.items).toEqual([]);
});
it('rejects missing intent session, COURSE scope and actor injection',async()=>{
 expect((await request('POST','/admin/rbac/assignments',{headers:{}})).statusCode).toBe(409);
 for(const patch of [{scope:'COURSE',courseId:target},{actorId:target}])expect((await request('POST','/admin/rbac/assignments',{body:{...body,...patch}})).statusCode).toBe(400);
 expect(fixture.change).not.toHaveBeenCalled();
});
it('uses verified actor identity and reports SQL conflicts without raw driver output',async()=>{
 expect((await request('POST','/admin/rbac/assignments')).statusCode).toBe(200);expect(fixture.change.mock.calls[0][1][0]).toBe(actor);
 fixture.change.mockRejectedValue({code:'23514',detail:'private driver information'});
 const result=await request('POST','/admin/rbac/assignments');expect(result.statusCode).toBe(409);expect(JSON.stringify(result.body)).not.toContain('private driver');
});
