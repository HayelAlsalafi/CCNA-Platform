// Read-only inspection of the one failed disposable restore; never connects to port 5432.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {runningPrivate,assertPrivateIdentity,isolated,bin} from '../study-activation/isolated-policy.mjs';
import {assertLessonRevisionGuard} from '../lesson-activation/policy.mjs';
import {assertStudyPolicies} from '../study-activation/proposed-runtime-guard.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {assertLedger} from '../phase6a-local/policy.mjs';
import {readinessPlan} from './readiness.mjs';
const root=process.cwd(),database='ccna_media_0015_8e175714b5874534b9917c42';
const receiptPath=path.join(root,'.local/media-0015-rehearsal',database,'rehearsal.json');
const old=JSON.parse(readFileSync(receiptPath,'utf8'));
assert.equal(old.target.database,database);assert.equal(old.failure.stage,'archive-restoration');
const backup=JSON.parse(readFileSync(path.join(root,old.backup.receipt),'utf8'));
const plan=readinessPlan(root),state=runningPrivate(root);
const changed=Buffer.from([...state.lines.slice(0,3),`host ${database} ${isolated.owner} 127.0.0.1/32 trust`,...state.lines.slice(3)].join('\n')+'\n');
const reload=()=>execFileSync(bin+'pg_ctl.exe',['-D',state.data,'reload'],{env:state.env,stdio:'pipe',windowsHide:true,timeout:10000});
const req=createRequire(path.join(root,'lib/db/package.json'));
const client=new (req('pg').Client)({host:'127.0.0.1',port:55440,database,user:isolated.owner,ssl:false,password:async()=>{throw Error('Credential request refused');},connectionTimeoutMillis:5000,query_timeout:10000});
const result={applicationDatabaseConnections:0,databaseWrites:0,checks:{}};let changedHba=false;
try {
  writeFileSync(state.hba,changed);changedHba=true;reload();await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL TIME ZONE 'UTC'");
  await assertPrivateIdentity(client,database,state.data);result.checks.identity='PASS';
  for(const [name,check] of [
    ['ledger',async()=>assertLedger((await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows,plan.manifest)],
    ['originalRows',async()=>assert.deepEqual(await rowProof(client,Object.keys(backup.rowProof).sort(),JSON.parse(readFileSync('lib/db/drizzle/meta/0014_snapshot.json','utf8'))),backup.rowProof)],
    ['studyPolicies',async()=>assertStudyPolicies(client)],
    ['revisionProtection',async()=>assertLessonRevisionGuard(client,root,isolated.owner)]
  ]) {try {await check();result.checks[name]='PASS';}catch {result.checks[name]='FAIL';}}
  result.functionAcl=(await client.query("SELECT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS extra_acl,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p WHERE p.oid='public.reject_lesson_revision_mutation()'::regprocedure")).rows[0];
  await client.query('ROLLBACK');
} finally {
  await client.end().catch(()=>{});
  if(changedHba){assert(readFileSync(state.hba).equals(changed));writeFileSync(state.hba,state.original);reload();assert(readFileSync(state.hba).equals(state.original));result.hbaRestoredByteForByte=true;}
}
writeFileSync(path.join(path.dirname(receiptPath),'restore-diagnosis.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
