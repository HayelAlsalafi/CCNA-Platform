import {check} from './diagnostics.mjs';
import assert from 'node:assert/strict';
import {checkTree} from '../media-activation/runtime.mjs';

// Preserve AND/OR grouping. Only normalize redundant atom parentheses and casts
// on columns whose exact types are independently pinned by the catalog check.
export function examExpression(value) {
  let s=String(value).replace(/"?exam_(?:sessions|session_items)"?\./g,'').replaceAll('"','');
  s=s.replace(/::(?:character varying|text)(?:\[\])?/gi,'');
  s=s.replace(/\b(question_count|position) BETWEEN (\d+) AND (\d+)/gi,'(($1 >= $2) AND ($1 <= $3))');
  s=s.replace(/deadline_at BETWEEN started_at\s*\+\s*interval '5 minutes' AND started_at\s*\+\s*interval '180 minutes'/gi,"((deadline_at >= (started_at + '00:05:00'::interval)) AND (deadline_at <= (started_at + '03:00:00'::interval)))");
  s=s.replace(/\bIN\s*\(([^)]+)\)/gi,'= ANY (ARRAY[$1])');
  const normalize=t=>Array.isArray(t)?[t[0],...t.slice(1).map(normalize)]:t.replace(/[()\s]/g,'');
  return normalize(checkTree(s));
}
export async function assertExamDetails(client,snapshot) {
  const tables=['exam_sessions','exam_session_items'];
  const sort=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const tableAcl=(await client.query("SELECT c.relname AS table,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[])",[tables])).rows;
  check('metadata.exam.table-acl',()=>assert.deepEqual(sort(tableAcl),sort(tables.flatMap(table=>[['ccna_phase6a_migrator',['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']],['ccna_phase6a_app',['SELECT','INSERT']]].flatMap(([role,privileges])=>privileges.map(privilege=>({table,role,privilege,grantable:false}))))),'Unexpected exam table ACL'));
  const columnAcl=(await client.query("SELECT c.relname AS table,col.attname AS column,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_class c JOIN pg_attribute col ON col.attrelid=c.oid CROSS JOIN LATERAL aclexplode(col.attacl) a WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) AND col.attnum>0 AND NOT col.attisdropped",[tables])).rows;
  check('metadata.exam.column-acl',()=>assert.deepEqual(sort(columnAcl),sort(Object.entries({exam_sessions:['status','finalized_at','result'],exam_session_items:['selected_keys','flagged','answer_version','graded_result']}).flatMap(([table,columns])=>columns.map(column=>({table,column,role:'ccna_phase6a_app',privilege:'UPDATE',grantable:false})))),'Unexpected exam column ACL'));
  const functions=['guard_exam_state','execute_question_deletion','execute_question_deletion_pre_exam','delete_question_with_history','delete_question_without_learner_history'];
  const functionAcl=(await client.query("SELECT p.proname AS name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1::text[])",[functions])).rows;
  check('metadata.exam.function-acl',()=>assert.deepEqual(sort(functionAcl),sort(functions.flatMap(name=>['ccna_phase6a_migrator',...(name.startsWith('delete_question_')?['ccna_phase6a_app']:[])].map(role=>({name,role,privilege:'EXECUTE',grantable:false})))),'Unexpected exam/deletion function ACL'));
  const rls=(await client.query("SELECT relname AS name,relrowsecurity AS enabled,relforcerowsecurity AS forced,(SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname",[tables])).rows;
  check('metadata.exam.rls',()=>assert.deepEqual(rls,[...tables].sort().map(name=>({name,enabled:false,forced:false,policies:0})),'Exam owner isolation is enforced by existing API predicates, not new RLS'));
  const rows=(await client.query("SELECT c.relname AS table,k.conname AS name,pg_get_expr(k.conbin,k.conrelid) AS expression,k.convalidated AS validated FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relname=ANY($1::text[]) AND c.relnamespace='public'::regnamespace AND k.contype='c' ORDER BY c.relname,k.conname",[tables])).rows;
  const expected=tables.flatMap(table=>Object.entries(snapshot.tables['public.'+table].checkConstraints).map(([name,c])=>({table,name,expression:examExpression(c.value),validated:true}))).sort((a,b)=>(a.table+'/'+a.name).localeCompare(b.table+'/'+b.name));
  check('metadata.exam.constraints',()=>assert.deepEqual(rows.map(r=>({...r,expression:examExpression(r.expression)})),expected,'Exam constraint expression/validation drift'));
  const defaults=(await client.query("SELECT c.relname AS table,a.attname AS name,pg_get_expr(d.adbin,d.adrelid) AS value FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relname=ANY($1::text[]) AND c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname",[tables])).rows;
  const wanted=tables.flatMap(table=>Object.values(snapshot.tables['public.'+table].columns).map(c=>({table,name:c.name,value:c.default===undefined?null:examExpression(c.default)}))).sort((a,b)=>(a.table+'/'+a.name).localeCompare(b.table+'/'+b.name));
  check('metadata.exam.defaults',()=>assert.deepEqual(defaults.map(r=>({...r,value:r.value===null?null:examExpression(r.value)})),wanted,'Exam defaults drift'));
  const indexes=(await client.query("SELECT c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid AS valid,i.indisready AS ready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname",[['exam_sessions_history_idx','exam_sessions_deadline_idx','exam_items_question_idx','exam_items_user_idx']])).rows;
  const definitions={exam_items_question_idx:'exam_session_items USING btree (question_id, revision_id)',exam_items_user_idx:'exam_session_items USING btree (user_id, session_id, "position")',exam_sessions_deadline_idx:'exam_sessions USING btree (status, deadline_at)',exam_sessions_history_idx:'exam_sessions USING btree (user_id, started_at DESC NULLS LAST, id)'};
  const normalized=s=>s.replaceAll('"','');
  check('metadata.exam.indexes',()=>assert.deepEqual(indexes.map(i=>({...i,definition:normalized(i.definition)})),Object.entries(definitions).sort(([a],[b])=>a.localeCompare(b)).map(([name,tail])=>({name,definition:normalized('CREATE INDEX '+name+' ON public.'+tail),valid:true,ready:true})),'Exam index definition/order drift'));
}
