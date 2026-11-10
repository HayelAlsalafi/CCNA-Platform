import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({routes:new Map<string,Function[]>(),middleware:[] as Function[],authenticated:true,role:'OWNER' as string|null,scope:'GLOBAL',enabled:true,read:vi.fn(),change:vi.fn()}));
vi.mock('express',()=>({default:{json:()=> (_req:any,_res:any,next:Function)=>next()},Router:()=>({
  use:(_path:string,...handlers:Function[])=>{f.middleware=handlers;},
  get:(p:string,...handlers:Function[])=>f.routes.set('GET '+p,handlers),
  post:(p:string,...handlers:Function[])=>f.routes.set('POST '+p,handlers),
  patch:(p:string,...handlers:Function[])=>f.routes.set('PATCH '+p,handlers),
})}));
vi.mock('@workspace/db',()=>({pool:{query:()=>{throw Error('Real DB forbidden');}}}));
vi.mock('../lib/global-rbac',()=>({globalRbac:{context:vi.fn()},catalogDraftManagement:vi.fn()}));
vi.mock('../middlewares/auth',()=>({requireAuthenticatedUser:(_req:any,res:any,next:Function)=>f.authenticated?next():res.status(401).json({error:{code:'UNAUTHENTICATED'}})}));
vi.mock('../lib/catalog-drafts',async original=>{const actual=await original<typeof import('../lib/catalog-drafts')>();return {...actual,catalogDrafts:actual.createCatalogDraftService((...args)=>f.read(...args),values=>f.change(values),async()=>({role:f.role,scope:f.scope}),()=>f.enabled)};});
import './catalog-drafts';
const actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
const body={title:'Draft',description:'',displayOrder:0,reason:'Reviewed draft',requestId:'33333333-3333-4333-8333-333333333333',slug:'draft'};
const receipt={id:target,title:'Draft',description:'',displayOrder:0,status:'DRAFT',version:'2026-11-10T00:00:00.123457Z'};
beforeEach(()=>{f.authenticated=true;f.role='OWNER';f.scope='GLOBAL';f.enabled=true;f.change.mockReset().mockResolvedValue({rows:[{value:receipt}]});f.read.mockReset().mockResolvedValue({rows:[{value:{items:[],page:1,pageSize:20,total:0}}]});});
async function request(path='POST /admin/catalog/tracks',patch:Record<string,unknown>={}){
  const method=path.split(' ')[0],headers={'x-admin-session':'verified-session'};
  const req:any={method,headers,dbUser:{id:actor,status:'ACTIVE',role:'USER'},verifiedAuth:{userId:actor,sessionId:'verified-session'},params:{id:target},query:{},body,get(name:string){return this.headers[name.toLowerCase()];},...patch};
  const res:any={code:200,headers:{},status(n:number){this.code=n;return this;},set(k:string,v:string){this.headers[k]=v;return this;},setHeader(k:string,v:string){this.headers[k]=v;},json(value:unknown){this.body=value;return this;}};
  const handlers=[...f.middleware,...f.routes.get(path)!];
  async function run(i:number):Promise<void>{if(i===handlers.length)return;let next:Promise<void>|undefined;await handlers[i](req,res,()=>{next=run(i+1);});await next;}
  await run(0);return res;
}
it('requires authentication and no-store on all nine routes',async()=>{
  f.authenticated=false;expect(f.routes.size).toBe(9);
  for(const path of f.routes.keys()){const res=await request(path);expect(res.code).toBe(401);expect(res.headers['Cache-Control']).toBe('private, no-store');}
  expect(f.read).not.toHaveBeenCalled();expect(f.change).not.toHaveBeenCalled();
});
it('denies disabled identities, mismatched identity and missing/changed session headers',async()=>{
  for(const patch of [{dbUser:{id:actor,status:'DISABLED',role:'ADMIN'}},{verifiedAuth:{userId:target,sessionId:'verified-session'}},{headers:{}},{headers:{'x-admin-session':'other-session'}}])
    expect((await request(undefined,patch)).code).toBeGreaterThanOrEqual(400);
  expect(f.change).not.toHaveBeenCalled();
});
it('never falls back to legacy ADMIN or COURSE authority, and remains disabled without the flag',async()=>{
  f.role=null;expect((await request(undefined,{dbUser:{id:actor,status:'ACTIVE',role:'ADMIN'},sessionClaims:{role:'OWNER'}})).code).toBe(403);
  f.role='OWNER';f.scope='COURSE';expect((await request()).code).toBe(403);
  f.scope='GLOBAL';f.enabled=false;expect((await request()).code).toBe(503);expect(f.change).not.toHaveBeenCalled();
});
it('creates only through fixed operation kinds and rejects publication, actor and parent-edit injection',async()=>{
  expect((await request()).code).toBe(200);expect(f.change.mock.calls[0][0].slice(0,3)).toEqual([actor,'tracks',null]);
  for(const patch of [{status:'ACTIVE'},{actorId:target},{scope:'COURSE'}])expect((await request(undefined,{body:{...body,...patch}})).code).toBe(400);
  expect((await request('PATCH /admin/catalog/tracks/:id',{body:{...body,slug:undefined,expectedVersion:'2026-11-10T00:00:00.123456Z',trackId:actor}})).code).toBe(400);
  expect(f.change).toHaveBeenCalledTimes(1);
});
it('returns sanitized conflicts and does not retry a stale writer or expose driver diagnostics',async()=>{
  f.change.mockRejectedValue({code:'40001',detail:'Private SQL output'});
  const res=await request();expect(res.code).toBe(409);expect(JSON.stringify(res.body)).not.toContain('Private SQL');expect(f.change).toHaveBeenCalledTimes(1);
});
