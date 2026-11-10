import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('@workspace/db',()=>({pool:{query:()=>{throw Error('Offline tests: no live DB');}}}));
vi.mock('./global-rbac',()=>({globalRbac:{context:vi.fn()},catalogDraftManagement:vi.fn()}));
import {createCatalogDraftService,draftCreateSchemas,draftEditSchema} from './catalog-drafts';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333';
const old='2026-11-10T01:00:00.123456Z',fresh='2026-11-10T01:00:00.123457Z';
const metadata={title:'Draft title',description:'Description',displayOrder:2,reason:'Reviewed catalog draft'};
const create={...metadata,slug:'networking-draft',requestId:request};
const receipt={id,status:'DRAFT',version:fresh,title:metadata.title,description:metadata.description,displayOrder:2};
function fixture(role:unknown='OWNER',scope='GLOBAL',enabled=true){
  const read=vi.fn().mockResolvedValue({rows:[{value:{items:[receipt],page:1,pageSize:20,total:1}}]}),
    change=vi.fn().mockResolvedValue({rows:[{value:receipt}]}),context=vi.fn().mockResolvedValue({role,scope});
  return {read,change,context,service:createCatalogDraftService(read,change,context,()=>enabled)};
}
it('is inert while disabled, before role, read or management queries',async()=>{
  const f=fixture('OWNER','GLOBAL',false);
  await expect(f.service.list(actor,'tracks',{})).rejects.toMatchObject({code:'CATALOG_DRAFT_NOT_READY'});
  await expect(f.service.change(actor,'tracks',null,create)).rejects.toMatchObject({code:'CATALOG_DRAFT_NOT_READY'});
  for(const fn of [f.read,f.change,f.context])expect(fn).not.toHaveBeenCalled();
});
it.each([null,'USER','CONTENT_MANAGER','STUDENT',{toString:()=> 'OWNER'}])('denies legacy/non-admin/malformed authority %s',async role=>{
  const f=fixture(role);await expect(f.service.change(actor,'tracks',null,create)).rejects.toMatchObject({status:403});expect(f.change).not.toHaveBeenCalled();
});
it('rejects COURSE scope and inactive or unverifiable RBAC without a manager fallback',async()=>{
  const f=fixture('OWNER','COURSE');await expect(f.service.list(actor,'tracks',{})).rejects.toMatchObject({status:403});
  f.context.mockRejectedValue({code:'42501'});await expect(f.service.change(actor,'tracks',null,create)).rejects.toMatchObject({code:'42501'});
  expect(f.read).not.toHaveBeenCalled();expect(f.change).not.toHaveBeenCalled();
});
it.each(['OWNER','ADMIN'])('allows explicit GLOBAL %s and binds only the server actor to the dedicated operation',async role=>{
  const f=fixture(role);expect(await f.service.change(actor,'tracks',null,create)).toEqual(receipt);
  expect(f.change.mock.calls[0][0]).toEqual([actor,'tracks',null,null,request,JSON.stringify(metadataWithSlug())]);
  expect(f.read).not.toHaveBeenCalled();
});
function metadataWithSlug(){return {...metadata,slug:create.slug};}
it('validates each parent and creation identity without allowing status or actor injection',()=>{
  expect(draftCreateSchemas.tracks.safeParse(create).success).toBe(true);
  expect(draftCreateSchemas.courses.safeParse({...create,trackId:id}).success).toBe(true);
  expect(draftCreateSchemas.versions.safeParse({...metadata,requestId:request,courseId:id,blueprintId:actor,versionKey:'1.1',catalogKey:'course-draft-v1'}).success).toBe(true);
  for(const patch of [{actorId:id},{status:'ACTIVE'},{id},{title:' '},{displayOrder:1.2},{slug:'../escape'},{reason:'x'}])expect(draftCreateSchemas.tracks.safeParse({...create,...patch}).success).toBe(false);
  expect(draftCreateSchemas.courses.safeParse(create).success).toBe(false);
  expect(draftCreateSchemas.versions.safeParse({...metadata,requestId:request,courseId:id,versionKey:'1.1',catalogKey:'x'}).success).toBe(false);
});
it('accepts only microsecond optimistic tokens and metadata edits, never reparenting or publication',async()=>{
  const edit={...metadata,requestId:request,expectedVersion:old},f=fixture();
  expect(await f.service.change(actor,'tracks',id,edit)).toEqual(receipt);
  expect(f.change.mock.calls[0][0]).toEqual([actor,'tracks',id,old,request,JSON.stringify(metadata)]);
  for(const patch of [{expectedVersion:old.replace('123456','123')},{trackId:actor},{slug:'changed'},{blueprintId:actor},{status:'DRAFT'},{courseId:actor}])
    expect(draftEditSchema.safeParse({...edit,...patch}).success).toBe(false);
});
it('preserves exact retry identity and forwards conflicting outcomes without automatic retry',async()=>{
  const f=fixture();expect(await f.service.change(actor,'tracks',null,create)).toEqual(await f.service.change(actor,'tracks',null,create));
  expect(f.change.mock.calls[0]).toEqual(f.change.mock.calls[1]);f.change.mockRejectedValue({code:'40001'});
  await expect(f.service.change(actor,'tracks',id,{...metadata,requestId:request,expectedVersion:old})).rejects.toMatchObject({code:'40001'});
  expect(f.change).toHaveBeenCalledTimes(3);
});
it('propagates one stale writer conflict for simultaneous requests, retaining original tokens and request IDs',async()=>{
  const f=fixture(),resolvers:{resolve:(v:any)=>void;reject:(v:any)=>void}[]=[];
  f.change.mockImplementation(()=>new Promise((resolve,reject)=>resolvers.push({resolve,reject})));
  const a=f.service.change(actor,'tracks',id,{...metadata,requestId:request,expectedVersion:old});
  const b=f.service.change(actor,'tracks',id,{...metadata,requestId:actor,expectedVersion:old});
  const settled=Promise.allSettled([a,b]);await Promise.resolve();await Promise.resolve();
  expect(resolvers).toHaveLength(2);resolvers[0].resolve({rows:[{value:receipt}]});resolvers[1].reject({code:'40001'});
  expect((await settled).map(r=>r.status)).toEqual(['fulfilled','rejected']);
  expect(f.change.mock.calls.map(c=>c[0][3])).toEqual([old,old]);expect(f.change).toHaveBeenCalledTimes(2);
});
it('bounds lists with exact parent contexts and rejects published or mismatched responses',async()=>{
  const f=fixture();await f.service.list(actor,'courses',{parentId:id});expect(f.read.mock.calls[0][1]).toEqual([actor,'courses',id,1]);
  for(const input of [{page:10001},{parentId:'x'},{parentId:id,userId:actor}])await expect(f.service.list(actor,'courses',input)).rejects.toMatchObject({status:400});
  for(const patch of [{status:'ACTIVE'},{id:actor},{version:old},{title:'Unexpected title'}]){
    f.change.mockResolvedValue({rows:[{value:{...receipt,...patch}}]});
    await expect(f.service.change(actor,'tracks',id,{...metadata,requestId:request,expectedVersion:old})).rejects.toMatchObject({code:'CATALOG_DRAFT_UNVERIFIED'});
  }
});
it('pins source-level serialization, idempotency, draft/protected checks, atomic audit and narrow grants',()=>{
  const sql=readFileSync(new URL('../../../../lib/db/drizzle/proposed/0023_catalog_draft_management.sql',import.meta.url),'utf8');
  expect(sql.indexOf('UPDATE public.global_rbac_guard')).toBeLessThan(sql.indexOf('SELECT * INTO prior'));
  expect(sql).toContain("assigned NOT IN ('OWNER','ADMIN')");expect(sql).toContain('prior.request_hash<>digest');expect(sql).toContain('RETURN prior.result');
  expect(sql).toContain('FOR UPDATE');expect(sql).toContain("before_row->>'status'<>'DRAFT'");expect(sql).toContain("interval '1 microsecond'");
  expect(sql).toContain('IN SHARE MODE');for(const table of ['curriculum_chapters','course_enrollments','course_attribution_epochs'])expect(sql).toContain('public.'+table);
  expect(sql.lastIndexOf('INSERT INTO public.catalog_draft_events')).toBeGreaterThan(sql.lastIndexOf('UPDATE public.course_versions SET'));
  expect(sql).toContain("OLD.status<>'DRAFT'");expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.catalog_draft_events');
  expect(sql).toContain('TO ccna_rbac_manager');expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)|DISABLE TRIGGER|CREATE OR REPLACE|DELETE FROM|UPDATE public\.(?:questions|lessons|users|exam_sessions)/);
});
