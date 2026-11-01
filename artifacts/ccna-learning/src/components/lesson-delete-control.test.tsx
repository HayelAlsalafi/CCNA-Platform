// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@workspace/api-client-react',()=>({lessonRequest:request}));
vi.mock('./admin-session-boundary',()=>({useAdminSession:()=>({identity:{userId:'fixture',sessionId:'fixture-session'},isCurrent:()=>true,capture:()=>()=>true})}));
vi.mock('../pages/lesson-reader',()=>({lessonError:(e:Error)=>e.message}));
import {LessonDeleteControl} from './lesson-delete-control';
const lesson={id:'11111111-1111-4111-8111-111111111111',title:'Disposable lesson',version:3,status:'DRAFT'};
let root:Root,container:HTMLDivElement;const refresh=vi.fn(async()=>{});
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;request.mockReset();refresh.mockClear();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());document.body.innerHTML='';});
const button=(text:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;
async function render(status='DRAFT'){await act(async()=>root.render(<LessonDeleteControl lesson={{...lesson,status}} onDeleted={refresh}/>));await act(async()=>button('Delete').click());}
async function confirm(){const input=document.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,lesson.title);input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('requires explicit exact-title confirmation; Cancel sends no request',async()=>{
 await render();expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(lesson.title);expect(button('Delete permanently').disabled).toBe(true);await act(async()=>button('Cancel').click());expect(request).not.toHaveBeenCalled();
});
it('sends one versioned Admin deletion and refreshes after verified success',async()=>{
 let resolve!:(x:unknown)=>void;request.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await confirm();expect(button('Delete permanently').disabled).toBe(false);
 await act(async()=>{button('Delete permanently').click();button('Delete permanently')?.click();});expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1]).toMatchObject({method:'DELETE',body:JSON.stringify({version:3,confirmationTitle:lesson.title})});
 await act(async()=>resolve({id:lesson.id,deleted:true}));expect(refresh).toHaveBeenCalledTimes(1);expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});
it('keeps blocked errors and confirmation available without claiming success',async()=>{
 request.mockRejectedValue(Error('Learner progress protects this lesson.'));await render();await confirm();await act(async()=>button('Delete permanently').click());expect(document.querySelector('[role="alert"]')?.textContent).toContain('Learner progress');expect(refresh).not.toHaveBeenCalled();
});
it('explains published protection and never offers a destructive submission',async()=>{
 await render('PUBLISHED');expect(button('Delete permanently').disabled).toBe(true);expect(document.querySelector('[role="alert"]')?.textContent).toContain('Published lesson');expect(request).not.toHaveBeenCalled();
});
