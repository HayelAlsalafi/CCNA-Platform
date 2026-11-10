import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@workspace/api-client-react',()=>({lessonRequest:(...args:unknown[])=>f.request(...args)}));
import {listDrafts,prepareDraftOperation,sendDraftOperation,parseDraft,classifyDraftError} from './catalog-drafts-client';
const id='11111111-1111-4111-8111-111111111111',parent='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333';
const old='2026-11-10T00:00:00.123456Z',fresh='2026-11-10T00:00:00.123457Z';
const record={id,title:'Draft',description:'Notes',displayOrder:2,status:'DRAFT' as const,version:old};
const fields={title:' Draft ',description:' Notes ',displayOrder:'2',reason:' Reviewed draft ',slug:'new-track'};
const identity={userId:'verified-clerk-fixture',sessionId:'session-fixture'};
beforeEach(()=>{f.request.mockReset();});
it('uses exact GET contracts, validates bounded pages, consumes abort, and never invents a parent',async()=>{
  f.request.mockResolvedValue({items:[record],total:1,page:2,pageSize:20});const abort=new AbortController();
  expect((await listDrafts('courses',parent,2,abort.signal)).items[0].version).toBe(old);
  expect(f.request).toHaveBeenCalledWith(`/api/admin/catalog/courses?page=2&parentId=${parent}`,{signal:abort.signal});
  for(const run of [()=>listDrafts('courses',null,1),()=>listDrafts('tracks',null,10001)])await expect(run()).rejects.toMatchObject({category:'validation'});
  expect(f.request).toHaveBeenCalledTimes(1);
});
it('preserves all microseconds as opaque strings and rejects rounded/published/malformed records',()=>{
  const operation=prepareDraftOperation('versions',record,parent,fields,request);
  expect(operation.expectedVersion).toBe(old);expect(operation.body.expectedVersion).toBe(old);
  for(const patch of [{version:'2026-11-10T00:00:00.123Z'},{status:'ACTIVE'},{id:'arbitrary-id'},{displayOrder:1.2}])expect(()=>parseDraft({...record,...patch})).toThrow();
});
it('sends only allowed fields, exact token and verified session header for PATCH',async()=>{
  f.request.mockResolvedValue({...record,version:fresh});const op=prepareDraftOperation('courses',record,parent,fields,request);
  await sendDraftOperation(op,identity);const [url,options]=f.request.mock.calls[0];
  expect(url).toBe('/api/admin/catalog/courses/'+id);expect(options.method).toBe('PATCH');
  expect(options.headers['X-Admin-Session']).toBe(identity.sessionId);expect(options.cache).toBe('no-store');
  expect(JSON.parse(options.body)).toEqual({requestId:request,title:'Draft',description:'Notes',displayOrder:2,reason:'Reviewed draft',expectedVersion:old});
  expect(options.signal).toBeUndefined();
});
it('creates only tracks/courses and retains the immutable operation snapshot and request ID',async()=>{
  const op=prepareDraftOperation('courses',null,parent,fields,request);f.request.mockResolvedValue({...record,version:fresh});
  expect(Object.isFrozen(op)).toBe(true);expect(Object.isFrozen(op.body)).toBe(true);fields.title=' Draft ';
  await sendDraftOperation(op,identity);expect(f.request.mock.calls[0][1].method).toBe('POST');expect(op.body.trackId).toBe(parent);
  expect(op.body.requestId).toBe(request);expect(op.body).not.toHaveProperty('status');
  expect(()=>prepareDraftOperation('versions',null,parent,fields,request)).toThrow();
});
it('rejects empty or fractional order, invalid slugs, short reasons and missing course parents before a write',()=>{
  for(const patch of [{displayOrder:''},{displayOrder:'1.5'},{displayOrder:'100001'},{title:' '},{reason:'x'},{slug:'../x'}])
    expect(()=>prepareDraftOperation('tracks',null,null,{...fields,...patch},request)).toThrow();
  expect(()=>prepareDraftOperation('courses',null,null,fields,request)).toThrow();expect(f.request).not.toHaveBeenCalled();
});
it.each([[400,'validation'],[403,'forbidden'],[404,'missing'],[409,'conflict'],[503,'unresolved']] as const)('classifies mutation %s without retrying or exposing driver text',async(status,category)=>{
  f.request.mockRejectedValue({status,data:{error:{code:'CATALOG_DRAFT_CONFLICT',message:'private detail'}}});
  const op=prepareDraftOperation('tracks',null,null,fields,request);
  await expect(sendDraftOperation(op,identity)).rejects.toMatchObject({category});expect(f.request).toHaveBeenCalledTimes(1);
  expect(op.body.requestId).toBe(request);
});
it('distinguishes session conflict and read unavailability from an uncertain write',()=>{
  expect(classifyDraftError({status:409,data:{error:{code:'ADMIN_SESSION_CHANGED'}}},true).category).toBe('session');
  expect(classifyDraftError({status:503}).category).toBe('unavailable');expect(classifyDraftError(new Error('Network failed'),true).category).toBe('unresolved');
});
it('treats malformed, wrong-resource, wrong-content and non-advancing mutation receipts as unresolved',async()=>{
  const op=prepareDraftOperation('tracks',record,null,fields,request);
  for(const response of [{...record,id:parent,version:fresh},{...record,title:'Other',version:fresh},record,null]){
    f.request.mockResolvedValue(response);await expect(sendDraftOperation(op,identity)).rejects.toMatchObject({category:'unresolved'});
  }
});
