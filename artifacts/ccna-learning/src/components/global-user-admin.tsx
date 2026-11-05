import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { lessonRequest } from '@workspace/api-client-react';
import { useNexusIdentity } from '../lib/nexus';
import { useI18n } from '../i18n';
import { AdminSessionBoundary, useAdminSession } from './admin-session-boundary';
import { adminMutationOptions, adminQueryKey } from '../lib/admin-session';
import { AdminPanel } from './admin-ui';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog';

type Role = 'OWNER' | 'ADMIN' | 'CONTENT_MANAGER' | 'STUDENT';
type Context = {actorId: string; role: Role | null; canReadUsers: boolean; canManageRoles: boolean; canReadAudit: boolean};
type User = {id: string; displayName: string; status: string; legacyRole: string; role: Role | null; version: number};
type Audit = {id: string; actorId: string | null; targetId: string; action: string; reason: string; occurredAt: string; beforeState: {role: Role | null} | null; afterState: {role: Role | null}};
type Page<T> = {items: T[]; total: number; pageSize: number};
const base = '/api/admin/rbac';
export function GlobalUserAdmin() {
  const identity = useNexusIdentity(), { t } = useI18n();
  if (!identity) return <p role="status">{t('Sign in to manage GLOBAL roles.')}</p>;
  return <AdminSessionBoundary identity={identity}><GlobalUserAdminPanel /></AdminSessionBoundary>;
}
function GlobalUserAdminPanel() {
  const {t, message, date} = useI18n(), session = useAdminSession();
  const [page,setPage] = useState(1),[auditPage,setAuditPage] = useState(1),[showAudit,setShowAudit] = useState(false);
  const [target,setTarget] = useState<User | null>(null),[role,setRole] = useState<Role | ''>('STUDENT'),[reason,setReason] = useState('');
  const [pending,setPending] = useState(false),[notice,setNotice] = useState(''),[failed,setFailed] = useState(false);
  const lock = useRef(false), attempt = useRef<{key: string; id: string} | null>(null);
  const me = useQuery({queryKey: adminQueryKey([base,'me'], session.identity),
    queryFn: ({signal}) => lessonRequest<Context>(base+'/me',{signal}), retry:false,gcTime:0});
  const users = useQuery({queryKey:adminQueryKey([base,'users',page],session.identity), enabled:me.data?.canReadUsers===true,
    queryFn:({signal})=>lessonRequest<Page<User>>(
      base+'/users?page='+page,{signal}),retry:false,gcTime:0});
  const audit = useQuery({queryKey:adminQueryKey([base,'audit',auditPage],session.identity), enabled:showAudit&&me.data?.canReadAudit===true,
    queryFn:({signal})=>lessonRequest<Page<Audit>>(base+'/audit?page='+auditPage,{signal}),retry:false,gcTime:0});
  async function change() {
    if (lock.current || !session.isCurrent() || !target || reason.trim().length<5 || !me.data?.canManageRoles) return;
    const data = {scope:'GLOBAL',targetId:target.id,role:role||null,expectedVersion:target.version,reason:reason.trim()};
    const key=JSON.stringify(data);
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
    lock.current=true;setPending(true);setNotice('');setFailed(false);const current=session.capture();
    try {
      await lessonRequest(base+'/assignments',{...adminMutationOptions('global-role-change',session.identity).request,
        method:'POST',body:JSON.stringify({...data,requestId:attempt.current!.id})});
      if(!current())return;
      setNotice('GLOBAL role updated.');setTarget(null);attempt.current=null;
      await Promise.all([users.refetch(),me.refetch()]);
      if(showAudit)await audit.refetch();
    } catch { if(current()){setFailed(true);setNotice('Role change blocked or unconfirmed. Reload before another change; no success is assumed.');} }
    finally {lock.current=false;if(current())setPending(false);}
  }
  const canEdit = (user: User) => me.data?.canManageRoles && me.data.actorId!==user.id &&
    (me.data.role==='OWNER'||!['OWNER','ADMIN'].includes(user.role??''));
  const roles: Role[] = me.data?.role==='OWNER'?['OWNER','ADMIN','CONTENT_MANAGER','STUDENT']:['CONTENT_MANAGER','STUDENT'];
  return <div className="admin-workspace">
    <Link href="/admin">{t('Back to administration')}</Link>
    <AdminPanel title={t('GLOBAL user and role administration')}>
      <p>{t('COURSE assignments are disabled. Legacy USER/ADMIN permissions remain separate; revoking a GLOBAL role does not remove legacy access.')}</p>
      {me.isPending?<p role="status">{t('Loading…')}</p>:me.isError?<p role="alert">{t('GLOBAL role management is not activated or is unavailable.')}</p>:
        !me.data.canReadUsers?<p role="alert">{t('An explicit GLOBAL OWNER or ADMIN assignment is required. Legacy ADMIN is not automatically an OWNER.')}</p>:<>
          <button type="button" onClick={()=>void users.refetch()}>{t('Reload')}</button>
          {me.data.canReadAudit&&<button type="button" aria-pressed={showAudit} onClick={()=>setShowAudit(v=>!v)}>{t('Administrative audit history')}</button>}
          {users.isPending?<p role="status">{t('Loading…')}</p>:users.isError?<p role="alert">{t('Users unavailable.')}</p>:<>
            <ul>{users.data?.items.map(user=><li key={user.id}>
              <bdi>{user.displayName}</bdi> — {message(user.status)} / {message(user.role??'No GLOBAL assignment')}
              {' '}<small>{t('Legacy role:')} <bdi>{user.legacyRole}</bdi></small>{' '}
              <button type="button" disabled={!canEdit(user)||pending} onClick={()=>{setTarget(user);setRole(user.role??'STUDENT');setReason('');setNotice('');setFailed(false);attempt.current=null;}}>{t('Change GLOBAL role')}</button>
            </li>)}</ul>
            {!users.data?.items.length&&<p>{t('No accounts on this page.')}</p>}
            <nav aria-label={t('Learner pages')}><button type="button" disabled={page===1||pending} onClick={()=>setPage(p=>p-1)}>{t('Previous')}</button>{' '}{page}{' '}
              <button type="button" disabled={!users.data||page*20>=users.data.total||pending} onClick={()=>setPage(p=>p+1)}>{t('Next')}</button></nav>
          </>}
          {showAudit&&<section aria-label={t('Administrative audit history')}>
            {audit.isPending?<p role="status">{t('Loading…')}</p>:audit.isError?<p role="alert">{t('Audit unavailable.')}</p>:<>
              <ul>{audit.data?.items.map(event=><li key={event.id}>{message(event.action)} — <bdi>{event.actorId??t('Database operator')}</bdi> / <bdi>{event.targetId}</bdi> — {date(event.occurredAt)}
                <p>{message(event.beforeState?.role??'No GLOBAL assignment')} → {message(event.afterState.role??'No GLOBAL assignment')}</p><p dir="auto">{event.reason}</p></li>)}</ul>
              {!audit.data?.items.length&&<p>{t('No audit events.')}</p>}
              <button type="button" disabled={auditPage===1} onClick={()=>setAuditPage(p=>p-1)}>{t('Previous')}</button>{' '}{auditPage}{' '}
              <button type="button" disabled={!audit.data||auditPage*20>=audit.data.total} onClick={()=>setAuditPage(p=>p+1)}>{t('Next')}</button>
            </>}
          </section>}
        </>}
      {notice&&<p role={failed?'alert':'status'}>{message(notice)}</p>}
    </AdminPanel>
    <AlertDialog open={!!target} onOpenChange={open=>{if(!open&&!pending)setTarget(null);}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('Confirm GLOBAL role change')}</AlertDialogTitle>
        <AlertDialogDescription>{t('This changes only the GLOBAL assignment and records an audit event. Legacy roles and content are unchanged.')}{' '}<bdi>{target?.displayName}</bdi></AlertDialogDescription>
      </AlertDialogHeader>
        <label>{t('GLOBAL role')}<select value={role} disabled={pending} onChange={e=>setRole(e.target.value as Role|'')}>
          {roles.map(value=><option key={value} value={value}>{message(value)}</option>)}
          {target?.role&&<option value="">{t('Revoke GLOBAL assignment')}</option>}
        </select></label>
        <label>{t('Reason (5–500 characters; no secrets)')}<textarea value={reason} maxLength={500} disabled={pending} onChange={e=>setReason(e.target.value)} /></label>
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('Cancel')}</AlertDialogCancel>
          <button type="button" disabled={pending||failed||reason.trim().length<5} onClick={()=>void change()}>{pending?t('Saving…'):t('Confirm role change')}</button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
