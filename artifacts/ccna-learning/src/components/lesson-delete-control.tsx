import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import {useRef,useState} from 'react';
import {lessonRequest} from '@workspace/api-client-react';
import {useAdminSession} from './admin-session-boundary';
import {adminMutationOptions} from '../lib/admin-session';
import {lessonError} from '../pages/lesson-reader';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from './ui/alert-dialog';
type Target={id:string;title:string;version:number;status:string};
export function LessonDeleteControl({lesson,disabled=false,onDeleted}:{lesson:Target;disabled?:boolean;onDeleted:()=>Promise<void>}){
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const session=useAdminSession(),lock=useRef(false),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function remove(){
    if(lock.current||!session.isCurrent()||confirmation!==lesson.title||lesson.status==='PUBLISHED')return;
    lock.current=true;setPending(true);setError('');const current=session.capture();
    try {
      const result=await lessonRequest<{id:string;deleted:boolean}>(`/api/admin/lessons/${lesson.id}`,{...adminMutationOptions('lesson-delete',session.identity).request,method:'DELETE',body:JSON.stringify({version:lesson.version,confirmationTitle:confirmation})});
      if(!current())return;
      if(result?.deleted!==true||result.id!==lesson.id)throw Error('Deletion result could not be verified. Reload the library before taking further action.');
      setDone(true);setOpen(false);
      try{await onDeleted();}catch{if(current())setError('Lesson deleted, but the library could not refresh. Reload the page. Do not submit deletion again.');}
    }catch(e){if(current())setError(lessonError(e,'admin'));}
    finally{lock.current=false;if(current())setPending(false);}
  }
  return <>
    <button ref={trigger} type="button" disabled={disabled||pending||done} aria-label={translateUi("Delete {value0}", {value0: String(lesson.title)})} onClick={()=>{setOpen(true);setConfirmation('');setError('');}}>{translateUi("Delete")}</button>
    {done&&<span role="status">{translateUi("Lesson deleted.")}</span>}
    {!open&&error&&<p role="alert"><UiMessage text={error}/></p>}
    <AlertDialog open={open} onOpenChange={value=>{if(!lock.current)setOpen(value);}}>
      <AlertDialogContent aria-busy={pending} onCloseAutoFocus={event=>{event.preventDefault();if(trigger.current&&!trigger.current.disabled)trigger.current.focus();else document.getElementById('lesson-library-title')?.focus();}}>
        <AlertDialogHeader><AlertDialogTitle>{translateUi("Delete lesson permanently?")}</AlertDialogTitle><AlertDialogDescription>
          “{lesson.title}{translateUi("” can be deleted only if it has never been published and has no protected dependencies. Published revisions, learner history and shared images will never be removed.")}</AlertDialogDescription></AlertDialogHeader>
        {lesson.status==='PUBLISHED'?<p role="alert">{translateUi("Published lesson: deletion is blocked. This action does not unpublish it.")}</p>:<label>{translateUi("Type the exact lesson title to confirm")}<input aria-label={translateUi("Confirm lesson title")} autoComplete="off" value={confirmation} disabled={pending} onChange={e=>setConfirmation(e.target.value)}/></label>}
        {error&&<p role="alert"><UiMessage text={error}/></p>}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>{translateUi("Cancel")}</AlertDialogCancel><button type="button" disabled={pending||done||lesson.status==='PUBLISHED'||confirmation!==lesson.title} onClick={()=>void remove()}>{pending?translateUi("Deleting…"):translateUi("Delete permanently")}</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
