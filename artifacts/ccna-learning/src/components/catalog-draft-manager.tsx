import {useCallback,useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useI18n} from '../i18n';
import {adminQueryKey,invalidateAdminQueries} from '../lib/admin-session';
import {draftBase,listDrafts,prepareDraftOperation,sendDraftOperation,classifyDraftError,type DraftRecord,type DraftKind,type DraftFields,type DraftOperation,type DraftClientError} from '../lib/catalog-drafts-client';
import {useAdminSession} from './admin-session-boundary';
import {AdminButton} from './admin-ui';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from './ui/alert-dialog';

type EditorSpec={kind:DraftKind;record:DraftRecord|null;parentId:string|null;page:number};
const errors={
  validation:'Review the draft fields. No request was retried.',
  forbidden:'Draft authority was denied. Writes are disabled; your input is retained.',
  missing:'The draft or parent is unavailable. Your input is retained.',
  conflict:'Draft conflict or protected resource. Review the server version before another save.',
  session:'The verified session changed. No request will be replayed.',
  unavailable:'Draft management is unavailable or not activated.',
  unresolved:'Outcome unresolved. Preserve this request for manual review. Do not start a replacement request.',
} as const;
const headings={tracks:'Draft tracks',courses:'Draft courses',versions:'Draft versions'} as const;

export function CatalogDraftManager({activeTrackId,activeCourseId}:{activeTrackId:string|null;activeCourseId:string|null}){
  const {t}=useI18n(),session=useAdminSession(),client=useQueryClient();
  const [track,setTrack]=useState<string|null>(null),[course,setCourse]=useState<string|null>(null),[editor,setEditor]=useState<EditorSpec|null>(null);
  const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[notice,setNotice]=useState(false);
  const [ready,setReady]=useState({tracks:false,courses:false,versions:false});
  const readiness=useCallback((kind:DraftKind,value:boolean)=>setReady(old=>old[kind]===value?old:{...old,[kind]:value}),[]);
  const block=useCallback(()=>setBlocked(true),[]);
  const locked=busy||blocked||editor!==null;
  const open=(spec:EditorSpec)=>{if(!locked&&ready.tracks&&ready[spec.kind]&&session.isCurrent()){setNotice(false);setEditor(spec);}};
  return <div className="min-w-0 space-y-4" aria-label={t('Draft management')}>
    <p>{t('A DRAFT can still be protected by bindings or enrollment. The server decides.')}</p>
    <div className="flex flex-wrap gap-2">
      <AdminButton disabled={locked||!activeTrackId} onClick={()=>{setTrack(activeTrackId);setCourse(null);}}>{t('Use selected active track')}</AdminButton>
      <AdminButton disabled={locked||!activeTrackId||!activeCourseId} onClick={()=>{setTrack(activeTrackId);setCourse(activeCourseId);}}>{t('Use selected active course')}</AdminButton>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <DraftList kind="tracks" parentId={null} selected={track} locked={locked} onReady={readiness} onBlocked={block} onEdit={open}
        onSelect={id=>{setTrack(id);setCourse(null);}}/>
      {track?<DraftList key={'courses:'+track} kind="courses" parentId={track} selected={course} locked={locked} onReady={readiness} onBlocked={block} onEdit={open}
        onSelect={setCourse}/>:<p>{t('Select a track to view its courses.')}</p>}
      {course?<DraftList key={'versions:'+course} kind="versions" parentId={course} selected={null} locked={locked} onReady={readiness} onBlocked={block} onEdit={open}/>:<p>{t('Select a course to view its versions.')}</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <AdminButton disabled={locked||!ready.tracks} onClick={()=>open({kind:'tracks',record:null,parentId:null,page:1})}>{t('Create track draft')}</AdminButton>
      <AdminButton disabled={locked||!ready.tracks||!track||!ready.courses} onClick={()=>open({kind:'courses',record:null,parentId:track,page:1})}>{t('Create course draft')}</AdminButton>
      <AdminButton disabled aria-describedby="draft-blueprint-dependency">{t('Create version draft')}</AdminButton>
    </div>
    <p id="draft-blueprint-dependency">{t('Version creation requires an approved DRAFT blueprint picker and remains disabled.')}</p>
    {blocked&&<p role="alert">{t(errors.forbidden)}</p>}
    {notice&&<p role="status">{t('Draft saved and verified.')}</p>}
    {editor&&<DraftEditor key={`${editor.kind}:${editor.parentId}:${editor.record?.id??'new'}`} spec={editor} canSave={ready.tracks&&ready[editor.kind]&&!blocked} onBusy={setBusy} onBlocked={block} onClose={()=>setEditor(null)} onSaved={record=>{
      setNotice(true);setEditor(null);
      if(!editor.record&&editor.kind==='tracks'){setTrack(record.id);setCourse(null);}
      if(!editor.record&&editor.kind==='courses'){setTrack(editor.parentId);setCourse(record.id);}
      void invalidateAdminQueries(client,[draftBase],session.identity).catch(()=>{});
    }}/>}
  </div>;
}

function DraftList({kind,parentId,selected,locked,onSelect,onEdit,onReady,onBlocked}:{kind:DraftKind;parentId:string|null;selected:string|null;locked:boolean;
  onSelect?:(id:string)=>void;onEdit:(spec:EditorSpec)=>void;onReady:(kind:DraftKind,ready:boolean)=>void;onBlocked:()=>void}){
  const [page,setPage]=useState(1),{t,number}=useI18n(),session=useAdminSession();
  const query=useQuery({queryKey:adminQueryKey([draftBase,kind,parentId,page],session.identity),
    queryFn:({signal})=>listDrafts(kind,parentId,page,signal),retry:false,gcTime:0,placeholderData:()=>undefined});
  useEffect(()=>{onReady(kind,query.isSuccess&&!query.isFetching);return()=>onReady(kind,false);},[kind,query.isSuccess,query.isFetching,onReady]);
  useEffect(()=>{if(query.isError&&['forbidden','session'].includes(classifyDraftError(query.error).category))onBlocked();},[query.isError,query.error,onBlocked]);
  return <section aria-label={t(headings[kind])} className="min-w-0 space-y-2">
    <h3>{t(headings[kind])}</h3>
    {query.isPending?<p role="status">{t('Loading')}</p>:query.isError?<p role="alert">{t(errors[classifyDraftError(query.error).category])}</p>:<>
      {!query.data.items.length&&<p>{t('No catalog entries on this page.')}</p>}
      <ul className="space-y-2">{query.data.items.map(record=><li key={record.id} className="min-w-0 rounded border p-3">
        <bdi dir="auto" className="[overflow-wrap:anywhere]">{record.title}</bdi><p>{t('DRAFT')}</p>
        <p className="break-all"><bdi dir="ltr">{record.id}</bdi></p>
        <div className="flex flex-wrap gap-2">
          {onSelect&&<AdminButton disabled={locked} aria-pressed={selected===record.id} onClick={()=>onSelect(record.id)}>{t(kind==='tracks'?'Select a draft track':'Select a draft course')}</AdminButton>}
          <AdminButton disabled={locked} onClick={()=>onEdit({kind,record:{...record},parentId,page})}>{t('Edit draft metadata')}</AdminButton>
        </div>
      </li>)}</ul>
    </>}
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('Catalog pagination')}>
      <AdminButton disabled={locked||query.isFetching||page===1} onClick={()=>setPage(v=>v-1)}>{t('Previous')}</AdminButton><span>{number(page)}</span>
      <AdminButton disabled={locked||query.isFetching||query.isError||!query.data||page*20>=query.data.total||page>=10000} onClick={()=>setPage(v=>v+1)}>{t('Next')}</AdminButton>
      <AdminButton disabled={locked||query.isFetching} onClick={()=>void query.refetch()}>{t('Reload')}</AdminButton>
    </div>
  </section>;
}

function DraftEditor({spec,canSave,onBusy,onBlocked,onClose,onSaved}:{spec:EditorSpec;canSave:boolean;onBusy:(busy:boolean)=>void;onBlocked:()=>void;onClose:()=>void;onSaved:(record:DraftRecord)=>void}){
  const {t}=useI18n(),session=useAdminSession(),live=useRef(true),lock=useRef(false),attempt=useRef<DraftOperation|null>(null);
  const [base,setBase]=useState(spec.record),[fields,setFields]=useState<DraftFields>({title:spec.record?.title??'',description:spec.record?.description??'',displayOrder:String(spec.record?.displayOrder??0),reason:'',slug:''});
  const [pending,setPending]=useState(false),[error,setError]=useState<DraftClientError|null>(null),[refreshed,setRefreshed]=useState<DraftRecord|null>(null),[notOnPage,setNotOnPage]=useState(false);
  const uncertain=error?.category==='unresolved',denied=error?.category==='forbidden'||error?.category==='session',missing=error?.category==='missing';
  const frozen=pending||uncertain||denied||missing;
  const cannotClose=pending||uncertain;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{
    if(!pending&&!uncertain)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[pending,uncertain]);
  const set=(key:keyof DraftFields,value:string)=>setFields(old=>({...old,[key]:value}));
  async function save(){
    if(lock.current||frozen||!canSave||error?.category==='conflict'||error?.category==='unavailable'||!session.isCurrent())return;
    let operation:DraftOperation;
    try{
      // Reuse the ID for an unchanged logical intent; validation never sends SQL.
      operation=prepareDraftOperation(spec.kind,base,spec.parentId,fields,attempt.current?.requestId??crypto.randomUUID());
      if(attempt.current&&JSON.stringify(operation.body)!==JSON.stringify(attempt.current.body))operation=prepareDraftOperation(spec.kind,base,spec.parentId,fields,crypto.randomUUID());
    }catch(e){setError(classifyDraftError(e));return;}
    attempt.current=operation;lock.current=true;setPending(true);onBusy(true);setError(null);
    const captured=session.capture(),current=()=>live.current&&captured();let unresolvedOutcome=false;
    try{const record=await sendDraftOperation(operation,session.identity);if(current()){attempt.current=null;onSaved(record);}}
    catch(e){if(current()){const failure=classifyDraftError(e,true);unresolvedOutcome=failure.category==='unresolved';setError(failure);if(['forbidden','session'].includes(failure.category))onBlocked();}}
    finally{lock.current=false;if(current()){setPending(false);onBusy(unresolvedOutcome);}}
  }
  // Keep parent controls locked through an unresolved outcome, including after
  // the rejected promise completes. No "retry" or replacement mutation exists.
  useEffect(()=>{if(uncertain)onBusy(true);},[uncertain,onBusy]);
  async function refresh(){
    if(lock.current||!base||uncertain||!session.isCurrent())return;
    lock.current=true;setPending(true);onBusy(true);const captured=session.capture();
    try{
      const page=await listDrafts(spec.kind,spec.parentId,spec.page);
      if(live.current&&captured()){const found=page.items.find(r=>r.id===base.id);setRefreshed(found??null);setNotOnPage(!found);}
    }catch(e){if(live.current&&captured()){const failure=classifyDraftError(e);setError(failure);if(['forbidden','session'].includes(failure.category))onBlocked();}}
    finally{lock.current=false;if(live.current&&captured()){setPending(false);onBusy(false);}}
  }
  return <AlertDialog open onOpenChange={open=>{if(!open&&!cannotClose){onBusy(false);onClose();}}}>
    <AlertDialogContent className="max-h-[90dvh] overflow-y-auto text-start" onEscapeKeyDown={event=>{if(cannotClose)event.preventDefault();}}>
      <AlertDialogHeader><AlertDialogTitle>{t('Draft editor')}</AlertDialogTitle><AlertDialogDescription>{t('Only display metadata is editable. Identities and parents remain fixed.')}</AlertDialogDescription></AlertDialogHeader>
      {spec.record&&<p>{t('Draft target')}: <bdi dir="ltr">{spec.record.id}</bdi></p>}
      {spec.parentId&&<p>{t('Fixed parent')}: <bdi dir="ltr">{spec.parentId}</bdi></p>}
      {base&&<p>{t('Original version token')}: <bdi dir="ltr">{base.version}</bdi></p>}
      <fieldset disabled={frozen} className="grid min-w-0 gap-3">
        <label>{t('Draft title')}<input className="w-full" dir="auto" value={fields.title} maxLength={180} onChange={e=>set('title',e.target.value)}/></label>
        <label>{t('Draft description')}<textarea className="w-full" dir="auto" value={fields.description} maxLength={4000} onChange={e=>set('description',e.target.value)}/></label>
        <label>{t('Draft order')}<input className="w-full" dir="ltr" inputMode="numeric" value={fields.displayOrder} onChange={e=>set('displayOrder',e.target.value)}/></label>
        {!base&&<label>{t('Draft slug')}<input className="w-full" dir="ltr" value={fields.slug} maxLength={100} onChange={e=>set('slug',e.target.value)}/></label>}
        <label>{t('Draft change reason')}<textarea className="w-full" dir="auto" value={fields.reason} maxLength={500} onChange={e=>set('reason',e.target.value)}/></label>
      </fieldset>
      {error&&<p role="alert">{t(errors[error.category])}</p>}
      {(error?.category==='conflict'||error?.category==='unavailable')&&base&&<AdminButton disabled={pending} onClick={()=>void refresh()}>{t('Review refreshed version')}</AdminButton>}
      {error?.category==='conflict'&&!base&&<AdminButton disabled={pending} onClick={()=>{attempt.current=null;setError(null);}}>{t('Review the draft fields. No request was retried.')}</AdminButton>}
      {notOnPage&&<p role="status">{t('Draft not found on the refreshed page. No target was replaced.')}</p>}
      {refreshed&&<section aria-label={t('Refreshed server values')}>
        <h3>{t('Refreshed server values')}</h3><pre dir="auto" className="max-w-full overflow-auto whitespace-pre-wrap">{JSON.stringify(refreshed,null,2)}</pre>
        <AdminButton disabled={pending||denied||uncertain||missing||refreshed.version<=base!.version} onClick={()=>{setBase(refreshed);setRefreshed(null);setError(null);attempt.current=null;}}>{t('Use reviewed version token')}</AdminButton>
      </section>}
      {uncertain&&attempt.current&&<section aria-label={t('Original request for manual review')}>
        <p>{t('Keep this page open and record the request before leaving. No automatic retry is available.')}</p>
        <pre dir="ltr" className="max-w-full overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({kind:attempt.current.kind,targetId:attempt.current.targetId,parentId:attempt.current.parentId,body:attempt.current.body},null,2)}</pre>
      </section>}
      <AlertDialogFooter>
        <AdminButton disabled={cannotClose} onClick={()=>{onBusy(false);onClose();}}>{t('Cancel')}</AdminButton>
        <AdminButton disabled={frozen||!canSave||error?.category==='conflict'||error?.category==='unavailable'} onClick={()=>void save()}>{t('Save draft')}</AdminButton>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
