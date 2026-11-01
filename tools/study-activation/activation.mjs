import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
// Inert 0014-only activation helpers. No connection, promotion or SQL on import.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync,mkdirSync,renameSync,realpathSync} from "node:fs";
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readinessPlan } from './readiness.mjs';
import { verifyBackup } from './verify-backup.mjs';
import { assertStudyProposal, studyMigration, studyTables } from './proposal.mjs';
import { assertStudyRuntimeCatalog, assertStudyPolicies, assertStudyPrivileges } from './proposed-runtime-guard.mjs';
import { policy, assertLedger, assertIdentity, assertRuntimePrivileges } from '../phase6a-local/policy.mjs';
import { readSchemaCatalog, assertSchemaCatalog, taxonomyPrivileges } from '../phase6a-local/upgrade.mjs';
import { assertLessonPrivileges, assertLessonRevisionGuard } from '../lesson-activation/policy.mjs';
import { assertCanonicalPrivileges } from '../canonical-chapters-policy.mjs';
import { assertQuestionBankFunctions } from '../question-bank-policy.mjs';
import { assertNexusFunction, assertNexusPrivileges } from '../nexus-policy.mjs';
import { assertLearningPrivileges } from '../learning-policy.mjs';
import { rowProof } from '../question-bank-upgrade-core.mjs';
export const approvedBackup = Object.freeze({
  receipt: '.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/study-backup.json',
  receiptHash: '90a802ca839cef92bfcaeffe709f15ea182a0e01052e96cbcfb61cf4ff042000',
  archiveHash: '2029f3409f2f89ff6227eb6a6a491fef56419c9938d15c983606cd135ece679d',
});
export const rehearsalReceipt = '.local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5/rehearsal.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function executionIntent(args) {
  assert.deepEqual(args,['--apply','--confirm-reviewed-study'],'Use the explicit approved 0014-only operation');
}
export function preparedActivation(root, now=Date.now()) {
  const plan=readinessPlan(root), proposal=assertStudyProposal(root);
  const receipt=path.join(root,approvedBackup.receipt), bytes=readFileSync(receipt);
  assert.equal(digest(bytes),approvedBackup.receiptHash,'Fresh backup receipt changed');
  const report=JSON.parse(bytes), age=now-Date.parse(report.createdAt);
  assert(Number.isFinite(age)&&age>=0&&age<=6*60*60*1000,'Fresh backup is outside the six-hour execution window');
  const verified=verifyBackup(root,receipt);
  assert.equal(verified.sha256,approvedBackup.archiveHash);
  const evidence=JSON.parse(readFileSync(path.join(root,rehearsalReceipt),'utf8'));
  for(const flag of ['completed','originalRecordsPreserved','hbaRestoredByteForByte','finalReadOnlyVerification']) assert.equal(evidence[flag],true,'Rehearsal gate: '+flag);
  assert.equal(evidence.stage,'complete');
  assert.equal(evidence.applicationDatabaseConnections,0);
  assert.equal(evidence.applicationWrites,0);
  assert.deepEqual(evidence.proposal,plan.proposal,'Rehearsed SQL differs from approval');
  assert.equal(evidence.target.host,'127.0.0.1');
  assert.equal(evidence.target.port,55440);
  assert.equal(evidence.target.systemIdentifier,'7695735287099484548');
  for(const flag of ['restorationVerified','rehearsalVerified']) assert.equal(evidence.backup[flag],true);
  for(const name of ['migration0014AndExistingDataPreserved','repeatMigratorNoChanges','notesHighlightsBookmarksAndResumeAcrossConnections','realRlsForeignKeysChecksRestrictAndHistoryGuards','finalOriginalDataAndSequencePreservation']) assert.equal(evidence.outcomes[name],true,'Rehearsal assertion missing: '+name);
  assert.equal(evidence.backup.sha256,'adbf25e98a8f9473251a86d1c8e2e5fcd2b1ad77c345b6d0c26e92458193eaf8');
  const base=path.join(root,'lib/db/drizzle');
  for(const name of ['0014_interactive_study.sql','meta/0014_snapshot.json','meta/_journal.json.study-promotion-pending']) assert(!existsSync(path.join(base,name)),'Promotion destination exists; diagnose instead of retrying');
  return {...plan,...proposal,report,folder:path.dirname(realpathSync(receipt)),officialJournal:readFileSync(path.join(base,'meta/_journal.json')),
    manifest:[...plan.manifest,{tag:studyMigration[0],when:studyMigration[1],hash:studyMigration[2]}]};
}
export function stageStudy(root, folder, plan) {
  assert(!existsSync(folder),'Staging destination already exists');
  mkdirSync(path.join(folder,'meta'),{recursive:true});
  assert.equal(plan.manifest.length,14);
  assert.deepEqual(plan.journal,assertStudyProposal(root).journal,'Unexpected staged migration journal');
  for(const [i,m] of plan.manifest.entries()) {
    const bytes=readFileSync(path.join(root,'lib/db/drizzle',i===13?'proposed':'',m.tag+'.sql'));
    assert.equal(digest(bytes),m.hash,'Staged SQL checksum mismatch');
    writeFileSync(path.join(folder,m.tag+'.sql'),bytes,{flag:'wx'});
  }
  writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify(plan.journal,null,2)+'\n',{flag:'wx'});
}
export function promoteStudy(root, plan) {
  const base=path.join(root,'lib/db/drizzle');
  assertStudyProposal(root);
  assert.deepEqual(readFileSync(path.join(base,'meta/_journal.json')),plan.officialJournal,'Official journal changed');
  for(const [src,dest] of [['0014_interactive_study.sql','0014_interactive_study.sql'],['meta/0014_snapshot.json','meta/0014_snapshot.json']])
    writeFileSync(path.join(base,dest),readFileSync(path.join(base,'proposed',src)),{flag:'wx'});
  const temp=path.join(base,'meta/_journal.json.study-promotion-pending');
  writeFileSync(temp,readFileSync(path.join(base,'proposed/meta/0014_journal.json')),{flag:'wx'});
  assert.deepEqual(readFileSync(path.join(base,'meta/_journal.json')),plan.officialJournal);
  renameSync(temp,path.join(base,'meta/_journal.json'));
}
export async function readSequences(client) {
  const result={};
  for(const name of ['public.question_code_seq','drizzle.__drizzle_migrations_id_seq'])
    result[name]=(await client.query(`SELECT last_value::text,is_called FROM ${name}`)).rows[0];
  return result;
}
// Read the *application* role's grants using the migrator's catalog access. Uses
// the same strict flag validator as startup, without SET ROLE or a role grant.
export async function checkExistingRuntime(client,root) {
  assert.deepEqual((await client.query("SELECT nspname,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname IN ('public','drizzle') ORDER BY nspname")).rows,[{nspname:'drizzle',owner:policy.migrationRole},{nspname:'public',owner:policy.migrationRole}],'Unexpected application schema ownership');
  const fields=[
    'r.rolsuper AS superuser','r.rolcreatedb AS createdb','r.rolcreaterole AS createrole','r.rolreplication AS replication','r.rolbypassrls AS bypassrls',
    'EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS inherited_membership',
    ...['CREATE','TEMP'].map((p,i)=>`has_database_privilege($1,current_database(),'${p}') AS ${['database_create','temp'][i]}`),
    "has_schema_privilege($1,'public','CREATE') AS schema_create","has_schema_privilege($1,'drizzle','USAGE') AS ledger_access",
  ];
  for(const [flag,tables,priv] of [
    ['catalog_select',['topics','questions','question_options'],'SELECT'],['catalog_insert',['topics','questions','question_options'],'INSERT'],['catalog_update',['topics','questions','question_options'],'UPDATE'],
    ['options_delete',['question_options'],'DELETE'],['revision_select',['question_revisions'],'SELECT'],['revision_insert',['question_revisions'],'INSERT'],['revision_update',['question_revisions'],'UPDATE'],['revision_delete',['question_revisions'],'DELETE'],['revision_truncate',['question_revisions'],'TRUNCATE'],
    ['delivery_select',['practice_deliveries'],'SELECT'],['delivery_insert',['practice_deliveries'],'INSERT'],['delivery_update',['practice_deliveries'],'UPDATE'],['delivery_delete',['practice_deliveries'],'DELETE'],['delivery_truncate',['practice_deliveries'],'TRUNCATE'],
    ['attempt_select',['practice_attempts'],'SELECT'],['attempt_insert',['practice_attempts'],'INSERT'],['history_update',['practice_attempts'],'UPDATE'],['history_delete',['practice_attempts'],'DELETE'],['user_select',['users'],'SELECT'],['user_insert',['users'],'INSERT'],['user_delete',['users'],'DELETE'],['question_delete',['questions'],'DELETE'],['topic_delete',['topics'],'DELETE'],
  ]) fields.push(tables.map(t=>`has_table_privilege($1,'public.${t}','${priv}')`).join(' AND ')+' AS '+flag);
  fields.push(['email','display_name','updated_at','last_login_at'].map(c=>`has_column_privilege($1,'public.users','${c}','UPDATE')`).join(' AND ')+' AS profile_update');
  for(const [flag,col] of [['role_update','role'],['status_update','status']]) fields.push(`has_column_privilege($1,'public.users','${col}','UPDATE') AS ${flag}`);
  for(const [flag,priv] of [['code_usage','USAGE'],['code_update','UPDATE']]) fields.push(`has_sequence_privilege($1,'public.question_code_seq','${priv}') AS ${flag}`);
  assertRuntimePrivileges((await client.query('SELECT '+fields.join(',')+' FROM pg_roles r WHERE rolname=$1',[policy.appRole])).rows[0]);
  await assertCanonicalPrivileges(client);
  await assertNexusPrivileges(client);
  await assertLearningPrivileges(client);
  await assertNexusFunction(client,root,policy.migrationRole);
  await assertQuestionBankFunctions(client,root,10);
  await assertLessonPrivileges(client);
  await assertLessonRevisionGuard(client,root);
  assert.equal((await taxonomyPrivileges(client)).ready,true,'Existing taxonomy privileges differ');
}
export async function verifyLockedBaseline(client,config,root,plan) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Close API/frontend and competing database clients');
  assertSchemaCatalog(await readSchemaCatalog(client),JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0013_snapshot.json'),'utf8')));
  const rows=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(rows,plan.manifest.slice(0,13));
  assert.deepEqual(rows,plan.report.baselineLedger,'Ledger differs from fresh backup');
  const proof=await rowProof(client,Object.keys(plan.report.rowProof).sort());
  assert.deepEqual(proof,plan.report.rowProof,'Application rows changed since fresh backup; stop');
  assert.deepEqual(await readSequences(client),plan.report.sequences,'Sequence changed since fresh backup');
  await checkExistingRuntime(client,root);
}
export const studyGrants='GRANT SELECT,INSERT,UPDATE,DELETE ON public.lesson_annotations TO ccna_phase6a_app; GRANT SELECT,INSERT,UPDATE ON public.lesson_progress TO ccna_phase6a_app; GRANT SELECT,INSERT ON public.lesson_media TO ccna_phase6a_app';
export async function verifyActivated(client,config,root,plan,sourcePromoted=false) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  const catalog=await assertStudyRuntimeCatalog(client,root,policy.migrationRole);
  assert.equal(catalog.tables,22);
  await checkExistingRuntime(client,root);
  await assertStudyPrivileges(client,policy.appRole);
  await assertStudyPolicies(client);
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort()),plan.report.rowProof,'Existing rows changed');
  const sequences=await readSequences(client);
  assert.deepEqual(sequences['public.question_code_seq'],plan.report.sequences['public.question_code_seq']);
  assert.deepEqual(sequences['drizzle.__drizzle_migrations_id_seq'],{last_value:'14',is_called:true});
  for(const name of studyTables) assert.equal((await client.query(`SELECT count(*)::int AS n FROM public.${name}`)).rows[0].n,0,'New study tables must be empty');
  if(sourcePromoted){
    const db=path.join(root,'lib/db/drizzle');
    assert.equal(digest(readFileSync(path.join(db,'0014_interactive_study.sql'))),studyMigration[2]);
    assert.deepEqual(readFileSync(path.join(db,'meta/0014_snapshot.json')),readFileSync(path.join(db,'proposed/meta/0014_snapshot.json')));
    assert.deepEqual(readFileSync(path.join(db,'meta/_journal.json')),readFileSync(path.join(db,'proposed/meta/0014_journal.json')));
  }
  return {...catalog,existingRowsPreserved:true,questionCodeSequencePreserved:true,studyPrivilegesVerified:true,rlsPoliciesVerified:true,studyTablesEmpty:true};
}
