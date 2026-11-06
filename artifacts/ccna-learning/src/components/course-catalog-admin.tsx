import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {useQuery} from '@tanstack/react-query';
import {lessonRequest} from '@workspace/api-client-react';
import {useNexusIdentity} from '../lib/nexus';
import {adminQueryKey} from '../lib/admin-session';
import {useI18n} from '../i18n';
import {AdminSessionBoundary,useAdminSession} from './admin-session-boundary';
import {AdminButton,AdminPanel} from './admin-ui';

type Entry={id:string;title:string;slug?:string;versionKey?:string};
type Page={items:Entry[];page:number;pageSize:20};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function catalogPage(raw:unknown,page:number):Page {
  const value=raw as Page|undefined;
  if(!value||value.page!==page||value.pageSize!==20||!Array.isArray(value.items)||value.items.length>20||
    value.items.some(item=>!item||typeof item.id!=='string'||!uuid.test(item.id)||typeof item.title!=='string')||
    new Set(value.items.map(item=>item.id)).size!==value.items.length)throw Error('Catalog response invalid');
  // Do not use uncontracted fields as publication or permission evidence.
  return {page,pageSize:20,items:value.items.map(item=>({id:item.id,title:item.title}))};
}
export function CourseCatalogAdmin(){
  const identity=useNexusIdentity(),{t}=useI18n();
  if(!identity)return <p role="status">{t('Sign in to view the catalog workspace.')}</p>;
  return <AdminSessionBoundary identity={identity}><CatalogGate/></AdminSessionBoundary>;
}
function CatalogGate(){
  const session=useAdminSession(),{t}=useI18n();
  const me=useQuery({queryKey:adminQueryKey(['/api/admin/rbac','me'],session.identity),
    queryFn:({signal})=>lessonRequest<{scope?:string;role?:string}>('/api/admin/rbac/me',{signal}),
    retry:false,gcTime:0});
  return <div className="admin-workspace min-w-0" style={{textAlign:'start'}}>
    <Link href="/admin">{t('Back to administration')}</Link>
    <h1>{t('Multi-course administration')}</h1>
    {me.isPending?<p role="status">{t('Loading')}</p>:me.isError?<p role="alert">{t('Administrative catalog access is unavailable or not activated.')}</p>:
      me.data?.scope!=='GLOBAL'||!['OWNER','ADMIN'].includes(me.data.role??'')?
        <p role="alert">{t('An explicit GLOBAL OWNER or ADMIN assignment is required for this workspace.')}</p>:<CatalogWorkspace/>}
  </div>;
}
function CatalogWorkspace(){
  const {t}=useI18n(),[track,setTrack]=useState<string|null>(null),[course,setCourse]=useState<string|null>(null),[version,setVersion]=useState<string|null>(null);
  return <>
    <AdminPanel title={t('Read-only catalog workspace')}>
      <p>{t('Only active catalog entries are returned. Draft and retired entries are unavailable.')}</p>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <CatalogList title="Tracks" parent="root" path="/api/catalog/tracks" selected={track}
          onSelect={id=>{setTrack(id);setCourse(null);setVersion(null);}}/>
        {track?<CatalogList key={track} title="Courses" parent={track} path={`/api/catalog/tracks/${track}/courses`} selected={course}
          onSelect={id=>{setCourse(id);setVersion(null);}}/>:<p>{t('Select a track to view its courses.')}</p>}
        {course?<CatalogList key={course} title="Course versions" parent={course} path={`/api/catalog/courses/${course}/versions`} selected={version}
          onSelect={setVersion}/>:<p>{t('Select a course to view its versions.')}</p>}
      </div>
    </AdminPanel>
    <AdminPanel title={t('Draft management')}>
      <p id="catalog-write-dependency">{t('Draft writes and publication require reviewed backend capabilities. No edits can be saved here.')}</p>
      <div className="flex flex-wrap gap-2">{(['Create track draft','Create course draft','Create version draft'] as const).map(label=>
        <AdminButton key={label} disabled aria-describedby="catalog-write-dependency">{t(label)}</AdminButton>)}</div>
    </AdminPanel>
    <AdminPanel title={t('Enrollment summaries and learning analytics')}>
      <p role="status">{t('UNKNOWN — not supplied')}</p>
      <p>{t('Administrative enrollment summaries are unavailable. UNKNOWN does not mean zero enrollments.')}</p>
      <p>{t('Learner analytics remain owner-private. No administrative analytics endpoint is available.')}</p>
      <p>{t('COURSE authorization and entitlement management are not available in this workspace.')}</p>
    </AdminPanel>
  </>;
}
function CatalogList({title,parent,path,selected,onSelect}:{title:'Tracks'|'Courses'|'Course versions';parent:string;path:string;selected:string|null;onSelect:(id:string|null)=>void}){
  const [page,setPage]=useState(1),session=useAdminSession(),{t,number}=useI18n();
  const query=useQuery({queryKey:adminQueryKey(['/api/catalog',title,parent,page],session.identity),
    queryFn:async({signal})=>catalogPage(await lessonRequest<unknown>(path+'?page='+page,{signal}),page),
    retry:false,gcTime:0,placeholderData:()=>undefined});
  useEffect(()=>{
    if(selected!==null && (query.isError || (query.isSuccess && !query.data.items.some(item=>item.id===selected))))onSelect(null);
  },[query.isError,query.isSuccess,query.data,selected,onSelect]);
  return <section aria-label={t(title)} className="min-w-0 space-y-2">
    <h3>{t(title)}</h3>
    {query.isPending?<p role="status">{t('Loading')}</p>:query.isError?<p role="alert">{t('Catalog unavailable. No local fallback or activation was attempted.')}</p>:<>
      {!query.data?.items.length?<p>{t('No catalog entries on this page.')}</p>:<ul className="space-y-2">{query.data.items.map(item=><li key={item.id} className="min-w-0 rounded border p-3">
        <AdminButton variant={selected===item.id?'default':'outline'} className="h-auto w-full whitespace-normal break-words" aria-pressed={selected===item.id} onClick={()=>onSelect(item.id)}>
          <bdi dir="auto" className="min-w-0 [overflow-wrap:anywhere]">{item.title}</bdi>
        </AdminButton>
        <p className="break-all text-xs"><bdi dir="ltr">{item.id}</bdi></p>
        <p>{t('Publication state')}: {t('UNKNOWN — not supplied')}</p>
      </li>)}</ul>}
      <p>{t('Publication state is not provided by this API.')}</p>
    </>}
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Catalog pagination')}>
      <AdminButton disabled={page===1||query.isPending} onClick={()=>{onSelect(null);setPage(p=>p-1);}}>{t('Previous')}</AdminButton>
      <span>{number(page)}</span>
      <AdminButton disabled={query.isPending||query.isError||page>=10000||query.data?.items.length!==20} onClick={()=>{onSelect(null);setPage(p=>p+1);}}>{t('Next')}</AdminButton>
      <AdminButton disabled={query.isPending} onClick={()=>void query.refetch()}>{t('Reload')}</AdminButton>
    </div>
  </section>;
}
