// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({request:vi.fn(),role:'OWNER' as string|null,scope:'GLOBAL',identity:{userId:'clerk-fixture',sessionId:'session-fixture'} as {userId:string;sessionId:string}|null,unavailable:false,broken:false}));
vi.mock('../lib/nexus',()=>({useNexusIdentity:()=>f.identity}));
vi.mock('@workspace/api-client-react',async original=>({...await original<typeof import('@workspace/api-client-react')>(),lessonRequest:(...args:unknown[])=>f.request(...args)}));
import {CourseCatalogAdmin} from './course-catalog-admin';
import {LocaleProvider,languagePreferenceKey,useI18n} from '../i18n';
import {adminQueryKey,removeAdminSessionData} from '../lib/admin-session';
import {catalogAdminArabic} from '../i18n/catalog-admin-messages';
const track='11111111-1111-4111-8111-111111111111',course='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
let root:Root,host:HTMLDivElement,client:QueryClient;
function SwitchLocale(){const {setLocale}=useI18n();return <button onClick={()=>setLocale('ar')}>Arabic test switch</button>;}
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.removeItem(languagePreferenceKey);
  f.role='OWNER';f.scope='GLOBAL';f.identity={userId:'clerk-fixture',sessionId:'session-fixture'};f.unavailable=false;f.broken=false;
  f.request.mockReset().mockImplementation(async(url:string)=>{
    if(url==='/api/admin/rbac/me'){if(f.unavailable)throw Error('Disabled');return {scope:f.scope,role:f.role};}
    if(f.unavailable)throw Error('Disabled');
    const page=Number(new URL(url,'http://fixture').searchParams.get('page'));
    if(f.broken)return {items:[{id:'arbitrary-course-uuid',title:'Invalid'}],page,pageSize:20};
    if(url.includes('/tracks?page='))return {items:page===1?[{id:track,title:'Network Track'}]:[],page,pageSize:20};
    if(url.includes(`/tracks/${track}/courses`))return {items:[{id:course,title:'English Course TCP/IP'}],page,pageSize:20};
    if(url.includes(`/courses/${course}/versions`))return {items:[{id:version,title:'Version 1.1'}],page,pageSize:20};
    throw Error('Unexpected endpoint');
  });
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();localStorage.removeItem(languagePreferenceKey);document.documentElement.lang='en';document.documentElement.dir='ltr';vi.restoreAllMocks();});
async function settle(){await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function render(){await act(async()=>root.render(<LocaleProvider><QueryClientProvider client={client}><SwitchLocale/><CourseCatalogAdmin/></QueryClientProvider></LocaleProvider>));await settle();await settle();}
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;expect(button).toBeDefined();await act(async()=>button.click());await settle();await settle();}
it('does not query signed-out users',async()=>{
  f.identity=null;await render();expect(host.textContent).toContain('Sign in');expect(f.request).not.toHaveBeenCalled();
});
it.each([null,'STUDENT','CONTENT_MANAGER','USER'])('requires explicit GLOBAL admin assignment instead of %s or claimed authority',async role=>{
  f.role=role;await render();expect(host.textContent).toContain('An explicit GLOBAL OWNER or ADMIN');
  expect(f.request.mock.calls.every(([url])=>url==='/api/admin/rbac/me')).toBe(true);
});
it('rejects COURSE authority and does not query the catalog when RBAC is unavailable',async()=>{
  f.scope='COURSE';await render();expect(host.textContent).toContain('An explicit GLOBAL OWNER or ADMIN');
  f.scope='GLOBAL';f.unavailable=true;await act(async()=>client.invalidateQueries());await settle();
  expect(host.textContent).toContain('unavailable or not activated');expect(f.request.mock.calls.every(([url])=>url==='/api/admin/rbac/me')).toBe(true);
});
it('browses only existing hierarchical GET contracts; writes and private analytics remain unavailable, not zero',async()=>{
  await render();await click('Network Track');await click('English Course TCP/IP');await click('Version 1.1');
  expect(host.textContent).toContain('UNKNOWN');expect(host.textContent).toContain('does not mean zero enrollments');
  for(const label of ['Create track draft','Create course draft','Create version draft'])expect([...host.querySelectorAll('button')].find(b=>b.textContent===label)?.disabled).toBe(true);
  expect(f.request.mock.calls.some(([url])=>url.includes(`/courses/${course}/versions`))).toBe(true);
  for(const [url,options] of f.request.mock.calls){expect(options?.method??'GET').toBe('GET');expect(url).not.toMatch(/enrollments|analytics|assignments|entitlement|draft|publish/);expect(options?.signal).toBeInstanceOf(AbortSignal);}
});
it('retains selections through Arabic switching and isolates authored titles and technical IDs',async()=>{
  await render();await click('Network Track');await click('English Course TCP/IP');const requests=f.request.mock.calls.length;
  await click('Arabic test switch');expect(document.documentElement.dir).toBe('rtl');expect(document.documentElement.lang).toBe('ar');
  expect(host.textContent).toContain('إدارة الدورات المتعددة');expect(host.textContent).toContain('English Course TCP/IP');
  expect(host.querySelector('bdi[dir="ltr"]')?.textContent).toBe(track);
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='English Course TCP/IP')?.getAttribute('aria-pressed')).toBe('true');
  expect(f.request).toHaveBeenCalledTimes(requests);
});
it('fails closed for malformed/disabled catalog responses without a local catalog fallback',async()=>{
  f.broken=true;await render();expect(host.textContent).toContain('Catalog unavailable. No local fallback');expect(host.textContent).not.toContain('Invalid');
  expect(f.request.mock.calls.some(([url])=>url.includes('/courses/'))).toBe(false);
});
it('partitions and removes catalog cache by authenticated session',()=>{
  const identity={userId:'clerk-fixture',sessionId:'session-fixture'},other={...identity,sessionId:'other'};
  const a=adminQueryKey(['/api/catalog','Tracks','root',1],identity),b=adminQueryKey(['/api/catalog','Tracks','root',1],other);
  client.setQueryData(a,{items:[{id:track}]});client.setQueryData(b,{items:[]});removeAdminSessionData(client,identity);
  expect(client.getQueryData(a)).toBeUndefined();expect(client.getQueryData(b)).toEqual({items:[]});
});
it('hides stale child selections when the parent catalog becomes unavailable',async()=>{
  await render();await click('Network Track');await click('English Course TCP/IP');expect(host.textContent).toContain('Version 1.1');
  f.unavailable=true;
  await act(async()=>client.invalidateQueries({queryKey:['/api/catalog']}));await settle();await settle();
  expect(host.textContent).toContain('Catalog unavailable');expect(host.textContent).not.toContain('English Course TCP/IP');expect(host.textContent).not.toContain('Version 1.1');
});
it('supplies Arabic text for every new interface key without translating authored content',()=>{
  for(const [key,value] of Object.entries(catalogAdminArabic)){expect(value.length).toBeGreaterThan(0);expect(value).not.toBe(key);expect(value).toMatch(/[\u0600-\u06ff]/);}
});
