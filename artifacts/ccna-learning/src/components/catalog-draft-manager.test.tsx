// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({request:vi.fn(),mutate:null as null|((url:string,options:any)=>Promise<unknown>),readVersion:'2026-11-10T00:00:00.123456Z',readTitle:'Stored track',disabled:false}));
vi.mock('@workspace/api-client-react',async original=>({...await original<typeof import('@workspace/api-client-react')>(),lessonRequest:(...args:unknown[])=>f.request(...args)}));
import {CatalogDraftManager} from './catalog-draft-manager';
import {AdminSessionBoundary} from './admin-session-boundary';
import {LocaleProvider,useI18n,languagePreferenceKey} from '../i18n';
import {adminQueryKey,removeAdminSessionData} from '../lib/admin-session';
const track='11111111-1111-4111-8111-111111111111',course='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333',created='44444444-4444-4444-8444-444444444444';
const old='2026-11-10T00:00:00.123456Z',fresh='2026-11-10T00:00:00.123457Z',newer='2026-11-10T00:00:00.123458Z';
let root:Root,host:HTMLDivElement,client:QueryClient;
let identity={userId:'clerk-user',sessionId:'session-one'};
function SwitchLocale(){const {setLocale}=useI18n();return <button onClick={()=>setLocale('ar')}>Switch test Arabic</button>;}
function record(id:string,title:string){return {id,title,description:'Stored description',displayOrder:1,status:'DRAFT',version:f.readVersion};}
function receipt(url:string,options:any,token=fresh){const body=JSON.parse(options.body);return {id:options.method==='PATCH'?url.split('/').at(-1):created,title:body.title,description:body.description,displayOrder:body.displayOrder,status:'DRAFT',version:token};}
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;identity={userId:'clerk-user',sessionId:'session-one'};
  localStorage.removeItem(languagePreferenceKey);f.disabled=false;f.readVersion=old;f.readTitle='Stored track';f.mutate=null;
  f.request.mockReset().mockImplementation(async(url:string,options:any={})=>{
    if(options.method==='POST'||options.method==='PATCH')return f.mutate?f.mutate(url,options):receipt(url,options);
    if(f.disabled)throw {status:503,data:{error:{code:'CATALOG_DRAFT_NOT_READY'}}};
    const page=Number(new URL(url,'http://fixture').searchParams.get('page'));
    const items=url.includes('/tracks?')?[record(track,f.readTitle)]:url.includes('/courses?')?[record(course,'Stored course')]:[record(version,'Stored version')];
    return {items,total:items.length,page,pageSize:20};
  });
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);
  HTMLElement.prototype.hasPointerCapture??=()=>false;HTMLElement.prototype.setPointerCapture??=()=>{};HTMLElement.prototype.releasePointerCapture??=()=>{};
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();localStorage.removeItem(languagePreferenceKey);document.documentElement.dir='ltr';document.documentElement.lang='en';vi.restoreAllMocks();});
async function settle(){await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function render(){await act(async()=>root.render(<LocaleProvider><QueryClientProvider client={client}><SwitchLocale/><AdminSessionBoundary identity={identity}><CatalogDraftManager activeTrackId={track} activeCourseId={course}/></AdminSessionBoundary></QueryClientProvider></LocaleProvider>));await settle();await settle();}
const dialog=()=>document.querySelector<HTMLElement>('[role=alertdialog]')!;
function button(text:string,scope:ParentNode=document){const value=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);expect(value).toBeDefined();return value!;}
async function click(text:string,scope:ParentNode=document){await act(async()=>button(text,scope).click());await settle();await settle();}
async function input(label:string,value:string){const field=[...dialog().querySelectorAll('label')].find(l=>l.textContent?.startsWith(label))!.querySelector('input,textarea')! as HTMLInputElement|HTMLTextAreaElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
function value(label:string){return ([...dialog().querySelectorAll('label')].find(l=>l.textContent?.startsWith(label))!.querySelector('input,textarea')! as HTMLInputElement).value;}
const writes=()=>f.request.mock.calls.filter(([,options])=>['POST','PATCH'].includes(options?.method));
async function createForm(){await click('Create track draft',host);await input('Draft title','Original English title');await input('Draft slug','new-track');await input('Draft change reason','Reviewed new draft');}
async function editTrack(){const section=host.querySelector('[aria-label="Draft tracks"]')!;await click('Edit draft metadata',section);await input('Draft title','Local edited title');await input('Draft change reason','Reviewed existing draft');}
it('keeps writes unavailable when GET readiness is 503 and never attempts activation',async()=>{
  f.disabled=true;await render();expect(host.textContent).toContain('not activated');expect(button('Create track draft',host).disabled).toBe(true);expect(button('Create version draft',host).disabled).toBe(true);expect(writes()).toHaveLength(0);
});
it('creates once on double click, retains one UUID/header and invalidates only the current session catalog',async()=>{
  await render();await createForm();const before=f.request.mock.calls.filter(([url])=>url.includes('/tracks?')).length;
  const other={...identity,sessionId:'another-session'},key=adminQueryKey(['/api/admin/catalog','tracks',null,1],other);client.setQueryData(key,{privateOtherSession:true});
  await act(async()=>{button('Save draft',dialog()).click();button('Save draft',dialog()).click();});await settle();await settle();
  expect(writes()).toHaveLength(1);const [url,options]=writes()[0],body=JSON.parse(options.body);
  expect(url).toBe('/api/admin/catalog/tracks');expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(options.headers['X-Admin-Session']).toBe('session-one');
  expect(document.querySelector('[role=alertdialog]')).toBeNull();expect(host.textContent).toContain('saved and verified');
  expect(f.request.mock.calls.filter(([url])=>url.includes('/tracks?')).length).toBeGreaterThan(before);expect(client.getQueryData(key)).toEqual({privateOtherSession:true});
});
it('creates a course only under the selected known parent, never accepting a typed parent UUID',async()=>{
  await render();await click('Use selected active track',host);await click('Create course draft',host);
  await input('Draft title','Course draft');await input('Draft slug','course-draft');await input('Draft change reason','Reviewed course');await click('Save draft',dialog());
  expect(JSON.parse(writes()[0][1].body)).toMatchObject({trackId:track,slug:'course-draft'});expect(JSON.parse(writes()[0][1].body)).not.toHaveProperty('actorId');
});
it('lists and edits versions through existing contracts with exact microseconds; creation stays disabled',async()=>{
  await render();await click('Use selected active course',host);const section=host.querySelector('[aria-label="Draft versions"]')!;
  expect(section.textContent).toContain('Stored version');expect(button('Create version draft',host).disabled).toBe(true);
  await click('Edit draft metadata',section);await input('Draft change reason','Reviewed version edit');await click('Save draft',dialog());
  const [url,options]=writes()[0];expect(url).toBe('/api/admin/catalog/versions/'+version);expect(options.method).toBe('PATCH');expect(JSON.parse(options.body).expectedVersion).toBe(old);expect(JSON.parse(options.body)).not.toHaveProperty('courseId');
});
it('rejects invalid local fields before sending and retains entered values',async()=>{
  await render();await click('Create track draft',host);await input('Draft title','Retain this title');await click('Save draft',dialog());
  expect(writes()).toHaveLength(0);expect(value('Draft title')).toBe('Retain this title');expect(dialog().textContent).toContain('Review the draft fields');
});
it.each([400,403,404])('preserves inputs after %s without retry or raw backend details',async status=>{
  f.mutate=async()=>{throw {status,data:{error:{code:'CATALOG_DRAFT_FORBIDDEN',message:'private SQL details'}}};};
  await render();await createForm();await click('Save draft',dialog());
  expect(writes()).toHaveLength(1);expect(value('Draft title')).toBe('Original English title');expect(dialog().textContent).not.toContain('private SQL');
  expect(button('Save draft',dialog()).disabled).toBe(status!==400);expect(button('Cancel',dialog()).disabled).toBe(false);
});
it.each([503,'network'])('locks an uncertain %s outcome and preserves the original request without a replacement',async failure=>{
  f.mutate=async()=>{throw failure===503?{status:503}:Error('No response');};await render();await createForm();await click('Save draft',dialog());
  expect(dialog().textContent).toContain('Outcome unresolved');const original=JSON.parse(writes()[0][1].body);
  expect(dialog().querySelector('pre')?.textContent).toContain(original.requestId);expect(dialog().querySelector('pre')?.textContent).toContain(original.title);
  expect(button('Save draft',dialog()).disabled).toBe(true);expect(button('Cancel',dialog()).disabled).toBe(true);expect(button('Create track draft',host).disabled).toBe(true);
  await click('Save draft',dialog());expect(writes()).toHaveLength(1);
});
it('requires explicit conflict review before adopting a fresh token, preserving local fields and changing logical request ID',async()=>{
  f.mutate=async()=>{throw {status:409};};await render();await editTrack();await click('Save draft',dialog());const original=JSON.parse(writes()[0][1].body);
  expect(button('Save draft',dialog()).disabled).toBe(true);expect(value('Draft title')).toBe('Local edited title');
  f.readVersion=fresh;f.readTitle='Server edited title';await click('Review refreshed version',dialog());
  expect(dialog().textContent).toContain('Server edited title');expect(value('Draft title')).toBe('Local edited title');expect(button('Save draft',dialog()).disabled).toBe(true);
  await click('Use reviewed version token',dialog());f.mutate=async(url,options)=>receipt(url,options,newer);await click('Save draft',dialog());
  expect(writes()).toHaveLength(2);const next=JSON.parse(writes()[1][1].body);expect(next.expectedVersion).toBe(fresh);expect(next.title).toBe('Local edited title');expect(next.requestId).not.toBe(original.requestId);
});
it('ignores a late mutation response after a user/session change',async()=>{
  let resolve!:(value:unknown)=>void;let pendingUrl='',pendingOptions:any;
  f.mutate=(url,options)=>{pendingUrl=url;pendingOptions=options;return new Promise(r=>{resolve=r;});};
  await render();await createForm();await click('Save draft',dialog());expect(writes()).toHaveLength(1);
  identity={userId:'another-user',sessionId:'session-two'};await render();
  await act(async()=>resolve(receipt(pendingUrl,pendingOptions)));await settle();
  expect(host.textContent).not.toContain('Draft saved and verified');expect(document.querySelector('[role=alertdialog]')).toBeNull();
  expect(writes()[0][1].headers['X-Admin-Session']).toBe('session-one');
});
it('preserves unsaved fields and the opaque token across Arabic/RTL switching',async()=>{
  await render();await editTrack();await click('Switch test Arabic',host);
  expect(document.documentElement.dir).toBe('rtl');expect(document.documentElement.lang).toBe('ar');
  expect(dialog().querySelector('input[dir="auto"]')?.getAttribute('value')).toBe('Local edited title');expect(dialog().textContent).toContain(old);expect(writes()).toHaveLength(0);
});
it('cleans draft cache for only the departing authenticated session',()=>{
  const a=adminQueryKey(['/api/admin/catalog','tracks',null,1],identity),other={...identity,sessionId:'another'},b=adminQueryKey(['/api/admin/catalog','tracks',null,1],other);
  client.setQueryData(a,{items:['sensitive draft metadata']});client.setQueryData(b,{items:[]});removeAdminSessionData(client,identity);
  expect(client.getQueryData(a)).toBeUndefined();expect(client.getQueryData(b)).toEqual({items:[]});
});
it('keeps an unchanged known-rejected logical request ID stable until the user changes intent',async()=>{
  f.mutate=async()=>{throw {status:400};};await render();await createForm();await click('Save draft',dialog());await click('Save draft',dialog());
  expect(writes()).toHaveLength(2);expect(JSON.parse(writes()[0][1].body).requestId).toBe(JSON.parse(writes()[1][1].body).requestId);
  await input('Draft title','Changed logical request');await click('Save draft',dialog());expect(JSON.parse(writes()[2][1].body).requestId).not.toBe(JSON.parse(writes()[0][1].body).requestId);
});
it('locks scope selection during editing and shows the captured target and parent',async()=>{
  await render();await click('Use selected active course',host);await click('Edit draft metadata',host.querySelector('[aria-label="Draft versions"]')!);
  expect(dialog().textContent).toContain(version);expect(dialog().textContent).toContain(course);
  expect(button('Use selected active track',host).disabled).toBe(true);expect(button('Use selected active course',host).disabled).toBe(true);
  expect(writes()).toHaveLength(0);
});
it('does not unlock a conflicted save when refreshing its server version fails',async()=>{
  f.mutate=async()=>{throw {status:409};};await render();await editTrack();await click('Save draft',dialog());
  f.disabled=true;await click('Review refreshed version',dialog());expect(button('Save draft',dialog()).disabled).toBe(true);
  expect(value('Draft title')).toBe('Local edited title');expect(writes()).toHaveLength(1);
});
