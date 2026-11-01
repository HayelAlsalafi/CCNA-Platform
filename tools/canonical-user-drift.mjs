// SELECT-only comparison. No account IDs, email/name/Clerk values leave PostgreSQL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {decodeArchiveTables} from './phase8a-cleanup/final-planner.mjs';
export function userArchiveArgs(archive) {
  // pg_restore -t takes a relation name, not pg_dump's schema-qualified pattern.
  // --file=- emits text only. Never add --dbname, --clean or executable SQL.
  return ['--data-only','--schema=public','--table=users','--no-owner','--no-privileges','--file=-',archive];
}
export function readArchivedUsers(archive,env,run=execFileSync) {
  const text=run('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',userArchiveArgs(archive),{env,encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:8*1024*1024});
  const decoded=decodeArchiveTables(text);
  assert.deepEqual(Object.keys(decoded),['users'],'Expected exact public.users COPY data from verified archive');
  return decoded.users;
}
export const userDriftSql = `WITH expected AS (
 SELECT * FROM jsonb_populate_recordset(NULL::public.users,$1::jsonb)
), pairs AS (
 SELECT coalesce(e.id,a.id) AS id,to_jsonb(e) AS expected,to_jsonb(a) AS actual,
 CASE WHEN e.id IS NULL THEN 'ADDED' WHEN a.id IS NULL THEN 'REMOVED' ELSE 'CHANGED' END AS kind
 FROM expected e FULL JOIN public.users a ON a.id=e.id
), fields AS (
 SELECT p.*,k.field FROM pairs p CROSS JOIN LATERAL (
 SELECT jsonb_object_keys(coalesce(p.expected,'{}'::jsonb)||coalesce(p.actual,'{}'::jsonb)) AS field
 ) k WHERE (p.expected->k.field) IS DISTINCT FROM (p.actual->k.field)
)
SELECT encode(sha256(convert_to(id::text,'UTF8')),'hex') AS "accountReference",kind,field,
 CASE WHEN field IN ('updated_at','last_login_at','created_at','role','status') THEN expected->>field
 ELSE CASE WHEN expected->field IS NULL THEN NULL ELSE encode(sha256(convert_to((expected->field)::text,'UTF8')),'hex') END END AS expected,
 CASE WHEN field IN ('updated_at','last_login_at','created_at','role','status') THEN actual->>field
 ELSE CASE WHEN actual->field IS NULL THEN NULL ELSE encode(sha256(convert_to((actual->field)::text,'UTF8')),'hex') END END AS actual
 FROM fields ORDER BY id,field`;
export function summarizeUserDrift(rows) {
  const safeFields=new Set(['id','clerk_user_id','email','display_name','role','status','created_at','updated_at','last_login_at']);
  assert(Array.isArray(rows));
  for(const row of rows){
    assert(/^[a-f0-9]{64}$/.test(row.accountReference));
    assert(['ADDED','REMOVED','CHANGED'].includes(row.kind));assert(safeFields.has(row.field));
    for(const value of [row.expected,row.actual])
      if(!['updated_at','last_login_at','created_at','role','status'].includes(row.field))assert(value===null||/^[a-f0-9]{64}$/.test(value));
  }
  return {changedAccounts:new Set(rows.map(r=>r.accountReference)).size,differenceCount:rows.length,
    routineTimestampFieldsOnly:rows.length>0&&rows.every(r=>r.kind==='CHANGED'&&['updated_at','last_login_at'].includes(r.field)),
    differences:rows};
}
export async function compareUsersToBackup(client,users,expectedProof) {
  assert(Array.isArray(users));
  const keys=['clerk_user_id','created_at','display_name','email','id','last_login_at','role','status','updated_at'];
  for(const row of users)assert.deepEqual(Object.keys(row).sort(),keys,'Unexpected archived user column inventory');
  const proof=(await client.query(`SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM jsonb_populate_recordset(NULL::public.users,$1::jsonb) t`,[JSON.stringify(users)])).rows[0];
  assert.deepEqual(proof,expectedProof,'Archived users do not match the verified backup fingerprint');
  return summarizeUserDrift((await client.query(userDriftSql,[JSON.stringify(users)])).rows);
}
