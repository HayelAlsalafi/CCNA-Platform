// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 auth:{isLoaded:true,isSignedIn:true,userId:'learner-a' as string|null,sessionId:'session-a' as string|null},
 role:'USER',roleError:false,rolePending:false,adminAllowed:true,
}));
vi.mock('@clerk/react',()=>({useAuth:()=>state.auth,useUser:()=>({user:null}),
 useClerk:()=>({signOut:vi.fn(),openUserProfile:vi.fn()}),
 ClerkProvider:({children}:any)=>children,SignIn:()=> <h1>Sign in</h1>,SignUp:()=> <h1>Sign up</h1>}));
vi.mock('@workspace/api-client-react',async original=>({
 ...await original<typeof import('@workspace/api-client-react')>(),
 useGetCurrentUser:()=>({data:{user:{role:state.role,displayName:'Test learner'}},isPending:state.rolePending,isLoading:state.rolePending,isError:state.roleError}),
 useGetAdminAccess:()=>({data:{allowed:state.adminAllowed},isPending:false,isError:false}),
 useHealthCheck:()=>({isSuccess:true,isPending:false}),
}));
vi.mock('./admin-session-boundary',()=>({AdminSessionBoundary:({children}:any)=>children,AdminCacheGuard:()=>null}));
vi.mock('../pages/nexus-overview',()=>({NexusOverview:()=> <h1>Overview content</h1>}));
vi.mock('../pages/nexus-practice',()=>({NexusPractice:()=> <h1>Practice content</h1>}));
vi.mock('../pages/nexus-history',()=>({NexusHistory:()=> <h1>History content</h1>}));
vi.mock('../pages/learner-profile',()=>({LearnerProfile:()=> <h1>Profile content</h1>}));
vi.mock('../pages/learning-progress',()=>({Dashboard:()=>null,TopicsPage:()=> <h1>Curriculum content</h1>}));
vi.mock('../pages/exam-simulator',()=>({ExamSimulatorPage:()=> <h1>Exam content</h1>}));
vi.mock('./admin-topics',()=>({AdminTopicManager:()=> <h2>Topic manager content</h2>}));
vi.mock('./admin-questions',()=>({AdminQuestionManager:()=> <h2>Question manager content</h2>}));
vi.mock('./admin-taxonomy',()=>({AdminTaxonomyManager:()=> <h2>Taxonomy manager content</h2>}));
vi.mock('./admin-question-import',()=>({AdminQuestionImport:()=> <h2>Import manager content</h2>}));
vi.mock('./admin-overview',()=>({AdminOverview:()=> <h2>Admin overview content</h2>}));
import {ApplicationRoutes} from '../App';
import {isNavigationCurrent} from './nexus-shell';
let host:HTMLDivElement,root:Root,client:QueryClient;
beforeEach(()=>{
 Object.assign(state,{role:'USER',roleError:false,rolePending:false,adminAllowed:true});
 Object.assign(state.auth,{isLoaded:true,isSignedIn:true,userId:'learner-a',sessionId:'session-a'});
 window.history.replaceState({},'','/');
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 if(!window.PointerEvent)window.PointerEvent=MouseEvent as typeof PointerEvent;
 HTMLElement.prototype.hasPointerCapture??=()=>false;
 HTMLElement.prototype.setPointerCapture??=()=>{};
 HTMLElement.prototype.releasePointerCapture??=()=>{};
 HTMLElement.prototype.scrollIntoView??=()=>{};
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();});
async function render(){await act(async()=>root.render(<QueryClientProvider client={client}><ApplicationRoutes/></QueryClientProvider>));}
async function click(el:Element|null){expect(el).not.toBeNull();await act(async()=>{(el as HTMLElement).click();});}
async function navigate(path:string){await act(async()=>{window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));});}
const learnerLinks=['Command Center','Learning Curriculum','Challenge Arena','Learning Intelligence','Learner Profile','Exam Simulator'];
for(const [url,label,content] of [
 ['/','Command Center','Overview content'],['/topics','Learning Curriculum','Curriculum content'],
 ['/practice','Challenge Arena','Practice content'],['/practice/history','Learning Intelligence','History content'],
 ['/profile','Learner Profile','Profile content'],['/exam','Exam Simulator','Exam content'],
 ['/admin','Administration','Admin overview content'],['/admin/topics','Topics','Topic manager content'],
 ['/admin/questions','Questions','Question manager content'],['/admin/taxonomy','Taxonomy','Taxonomy manager content'],
 ['/admin/import','Bulk import','Import manager content'],
])it('direct navigation retains one NEXUS shell and correct destination for '+url,async()=>{
 state.role='ADMIN';window.history.replaceState({},'',url);await render();
 expect(host.querySelectorAll('.nexus-sidebar')).toHaveLength(1);
 expect(host.querySelectorAll('main')).toHaveLength(1);
 expect(host.querySelector('.nexus-brand')?.textContent).toContain('NEXUS');
 expect(host.textContent).not.toContain('CCNA Platform');
 expect([...host.querySelectorAll('[aria-label="Learner navigation"] a')].map(a=>a.textContent)).toEqual(learnerLinks);
 expect(host.querySelectorAll('nav a[aria-current=page]')).toHaveLength(1);
 expect(host.querySelector('nav a[aria-current=page]')?.textContent).toBe(label);
 expect(host.querySelector('main')?.textContent).toContain(content);
 expect(host.querySelector('[aria-label="Administration modules"]')).toBeNull();
});
it('sidebar state and DOM persist through links and browser back/forward',async()=>{
 await render();const sidebar=host.querySelector('.nexus-sidebar');
 await click(host.querySelector('[aria-label="Collapse sidebar"]'));
 await click(host.querySelector('a[href="/topics"][aria-label]'));
 expect(host.querySelector('.nexus-sidebar')).toBe(sidebar);
 expect(host.querySelector('.nexus-app.nexus-compact')).not.toBeNull();
 expect(host.textContent).toContain('Curriculum content');
 await act(async()=>{window.history.back();await new Promise(r=>setTimeout(r,50));});
 expect(host.textContent).toContain('Overview content');
 await act(async()=>{window.history.forward();await new Promise(r=>setTimeout(r,50));});
 expect(host.textContent).toContain('Curriculum content');
 expect(host.querySelector('.nexus-sidebar')).toBe(sidebar);
 expect(host.querySelector('.nexus-app.nexus-compact')).not.toBeNull();
});
it('refresh remount at an Admin deep link retains URL and guarded destination',async()=>{
 state.role='ADMIN';await navigate('/admin/import?template=xlsx');await render();
 await act(async()=>root.unmount());root=createRoot(host);await render();
 expect(window.location.search).toBe('?template=xlsx');
 expect(host.textContent).toContain('Import manager content');
 expect(host.querySelector('a[aria-current=page]')?.getAttribute('href')).toBe('/admin/import');
});
for(const mode of ['learner','signed-out','loading','error'])it('hides all administrative navigation for '+mode,async()=>{
 state.role='ADMIN';
 if(mode==='learner')state.role='USER';
 if(mode==='signed-out')Object.assign(state.auth,{isSignedIn:false,userId:null,sessionId:null});
 if(mode==='loading')state.rolePending=true;
 if(mode==='error')state.roleError=true;
 await render();expect(host.querySelector('[aria-label="Administration navigation"]')).toBeNull();
});
it('a direct Admin URL still enforces the existing server-derived role check',async()=>{
 await navigate('/admin/questions');await render();
 expect(host.textContent).toContain('Access denied.');
 expect(host.textContent).not.toContain('Question manager content');
});
it('revokes sidebar Admin destinations on sign-out without remounting the shell',async()=>{
 state.role='ADMIN';await render();const sidebar=host.querySelector('.nexus-sidebar');
 expect(host.querySelector('[aria-label="Administration navigation"]')).not.toBeNull();
 Object.assign(state.auth,{isSignedIn:false,userId:null,sessionId:null});await render();
 expect(host.querySelector('[aria-label="Administration navigation"]')).toBeNull();
 expect(host.querySelector('.nexus-sidebar')).toBe(sidebar);
});
it('unknown workspace deep links retain navigation and the existing not-found recovery',async()=>{
 await navigate('/unknown-workspace');await render();
 expect(host.querySelector('.nexus-sidebar')).not.toBeNull();
 expect(host.textContent).toContain('That path is not in the map.');
 expect(host.querySelectorAll('nav a[aria-current=page]')).toHaveLength(0);
});
it('a denied Admin policy cannot render management content even for an ADMIN role',async()=>{
 state.role='ADMIN';state.adminAllowed=false;await navigate('/admin/questions');await render();
 expect(host.textContent).toContain('The server did not grant admin access.');
 expect(host.textContent).not.toContain('Question manager content');
});
it('mobile navigation has the same links, closes on navigation, and preserves shell state',async()=>{
 state.role='ADMIN';await render();
 const trigger=host.querySelector('[aria-label="Open learning navigation"]');
 await click(trigger);const dialog=document.querySelector('[role=dialog]');expect(dialog).not.toBeNull();
 expect([...dialog!.querySelectorAll('[aria-label="Learner navigation"] a')].map(a=>a.textContent)).toEqual(learnerLinks);
 expect(dialog!.querySelectorAll('[aria-label="Administration navigation"] a')).toHaveLength(6);
 expect(dialog!.querySelector('a[href="/admin/lessons"]')?.textContent).toContain('Lessons');
 await click(dialog!.querySelector('a[href="/admin/questions"]'));
 expect(document.querySelector('[role=dialog]')).toBeNull();
 expect(host.textContent).toContain('Question manager content');
 expect(trigger?.getAttribute('aria-expanded')).toBe('false');
});
it('mobile Escape closes the dialog and restores keyboard focus to its trigger',async()=>{
 await render();const trigger=host.querySelector<HTMLElement>('[aria-label="Open learning navigation"]')!;
 await click(trigger);
 await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,30));});
 expect(document.querySelector('[role=dialog]')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
it('collapsed links remain named and skip navigation targets the only main landmark',async()=>{
 await render();await click(host.querySelector('[aria-label="Collapse sidebar"]'));
 expect(host.querySelectorAll('[aria-label="Learner navigation"] a[aria-label]')).toHaveLength(6);
 expect(host.querySelector('.nexus-skip')?.getAttribute('href')).toBe('#nexus-content');
 expect(host.querySelector('main')?.id).toBe('nexus-content');
});
it('sign-in and sign-up keep their dedicated authentication pages without workspace navigation',async()=>{
 await navigate('/sign-in');await render();expect(host.textContent).toBe('Sign in');expect(host.querySelector('aside')).toBeNull();
 await navigate('/sign-up');expect(host.textContent).toBe('Sign up');expect(host.querySelector('aside')).toBeNull();
});
it('active matching excludes prefix collisions and marks nested destination paths',()=>{
 expect(isNavigationCurrent('/admin/questions?status=ACTIVE','/admin/questions')).toBe(true);
 expect(isNavigationCurrent('/admin/questions/abc','/admin/questions')).toBe(true);
 expect(isNavigationCurrent('/admin/questions-other','/admin/questions')).toBe(false);
 expect(isNavigationCurrent('/practice/history','/practice')).toBe(false);
 expect(isNavigationCurrent('/admin/import','/admin')).toBe(false);
 expect(isNavigationCurrent('/exam','/exam')).toBe(true);
});
