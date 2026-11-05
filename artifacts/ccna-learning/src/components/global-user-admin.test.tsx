// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({request:vi.fn(),mode:'OWNER',identity:{userId:'clerk-fixture',sessionId:'session-fixture'}}));
vi.mock('../lib/nexus',()=>({useNexusIdentity:()=>fixture.identity}));
vi.mock('@workspace/api-client-react',async original=>({...await original<typeof import('@workspace/api-client-react')>(),lessonRequest:(...args:unknown[])=>fixture.request(...args)}));
import { GlobalUserAdmin } from './global-user-admin';
import { LocaleProvider, languagePreferenceKey } from '../i18n';
import { adminQueryKey, removeAdminSessionData } from '../lib/admin-session';
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
let root:Root,host:HTMLDivElement,client:QueryClient;
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.removeItem(languagePreferenceKey);
 fixture.mode='OWNER';fixture.request.mockReset();
 fixture.request.mockImplementation(async(url:string)=>{
  if(url.endsWith('/me')){
   if(fixture.mode==='UNAVAILABLE')throw new Error('Unavailable');
   return {actorId:actor,role:fixture.mode==='DENIED'?null:fixture.mode,canReadUsers:fixture.mode!=='DENIED',canManageRoles:fixture.mode!=='DENIED',canReadAudit:fixture.mode!=='DENIED'};
  }
  if(url.includes('/users'))return {items:[{id:actor,displayName:'Current owner',status:'ACTIVE',legacyRole:'USER',role:'OWNER',version:1},{id:target,displayName:'Target learner',status:'ACTIVE',legacyRole:'USER',role:'STUDENT',version:3}],total:2,pageSize:20};
  if(url.includes('/audit'))return {items:[],total:0,pageSize:20};
  return {eventId:'fixture'};
 });
 client=new QueryClient({defaultOptions:{queries:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);
 HTMLElement.prototype.hasPointerCapture??=()=>false;HTMLElement.prototype.setPointerCapture??=()=>{};HTMLElement.prototype.releasePointerCapture??=()=>{};
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();localStorage.removeItem(languagePreferenceKey);vi.restoreAllMocks();});
async function settle(){await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function render(){await act(async()=>root.render(<LocaleProvider><QueryClientProvider client={client}><GlobalUserAdmin/></QueryClientProvider></LocaleProvider>));await settle();await settle();}
it('shows honest inactive and denied states without loading privileged user/audit lists',async()=>{
 fixture.mode='UNAVAILABLE';await render();expect(host.querySelector('[role=alert]')?.textContent).toContain('not activated');
 expect(fixture.request.mock.calls.every(([url])=>url.endsWith('/me'))).toBe(true);
});
it('requires explicit assignment and never presents a role mutation for legacy-only access',async()=>{
 fixture.mode='DENIED';await render();expect(host.textContent).toContain('not automatically an OWNER');expect(host.querySelector('select')).toBeNull();
 expect(fixture.request.mock.calls.some(([url])=>url.includes('/users'))).toBe(false);
});
it('confirms a versioned GLOBAL change once, prevents self change and refreshes the users',async()=>{
 await render();
 const buttons=[...host.querySelectorAll('button')].filter(b=>b.textContent==='Change GLOBAL role');
 expect(buttons).toHaveLength(2);expect(buttons[0].disabled).toBe(true);
 await act(async()=>buttons[1].click());
 const dialog=document.querySelector('[role=alertdialog]')!;expect(dialog.textContent).toContain('Target learner');
 expect(dialog.textContent).not.toContain('COURSE');
 const select=dialog.querySelector('select')!;
 await act(async()=>{select.value='ADMIN';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const reason=dialog.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Reviewed by owner');reason.dispatchEvent(new Event('input',{bubbles:true}));});
 const confirm=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Confirm role change')!;expect(confirm.disabled).toBe(false);
 await act(async()=>{confirm.click();confirm.click();});await settle();
 const writes=fixture.request.mock.calls.filter(([url])=>url.endsWith('/assignments'));
 expect(writes).toHaveLength(1);const payload=JSON.parse(writes[0][1].body);
 expect(payload).toMatchObject({scope:'GLOBAL',targetId:target,role:'ADMIN',expectedVersion:3,reason:'Reviewed by owner'});
 expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(writes[0][1].headers['X-Admin-Session']).toBe('session-fixture');
 expect(fixture.request.mock.calls.filter(([url])=>url.includes('/users')).length).toBeGreaterThanOrEqual(2);
 expect(host.textContent).toContain('GLOBAL role updated.');expect(document.querySelector('[role=alertdialog]')).toBeNull();
});
it('uses the existing audit panel with a real empty state and COURSE disabled notice',async()=>{
 await render();expect(host.textContent).toContain('COURSE assignments are disabled');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Administrative audit history')!.click());await settle();
 expect(host.textContent).toContain('No audit events.');
});
it('removes GLOBAL user and audit caches for the departing session only',()=>{
 const other={...fixture.identity,sessionId:'another-session'};
 const ownUsers=adminQueryKey(['/api/admin/rbac','users',1],fixture.identity);
 const ownAudit=adminQueryKey(['/api/admin/rbac','audit',1],fixture.identity);
 const otherUsers=adminQueryKey(['/api/admin/rbac','users',1],other);
 client.setQueryData(ownUsers,{items:[{id:target}]});client.setQueryData(ownAudit,{items:[{id:'audit'}]});client.setQueryData(otherUsers,{items:[]});
 removeAdminSessionData(client,fixture.identity);
 expect(client.getQueryData(ownUsers)).toBeUndefined();expect(client.getQueryData(ownAudit)).toBeUndefined();expect(client.getQueryData(otherUsers)).toEqual({items:[]});
});
