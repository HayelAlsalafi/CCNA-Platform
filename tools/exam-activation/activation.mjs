import {assertSafetyCoverage} from './safety-assertions.mjs';
import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
// Inert helpers for the dedicated 0017 executor; no operation on import.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync,renameSync,realpathSync,readdirSync} from "node:fs";
import path from 'node:path';
import {assertDeletionFunction} from '../lesson-deletion/policy.mjs';
import {assertExamProposal,exam17Migration,baselineChainHash} from './proposal.mjs';
import {digest} from '../media-activation/proposal.mjs';
import {readinessPlan} from './readiness.mjs';
import {verifyBackup} from './verify-backup.mjs';
import {migrationManifest,assertLedger,assertIdentity,policy} from '../phase6a-local/policy.mjs';
import {readSchemaCatalog,assertSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertMediaRuntimeCatalog} from '../media-activation/runtime.mjs';
import {checkExistingRuntime,readSequences} from '../study-activation/activation.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {assertStudyPolicies,assertStudyPrivileges} from '../study-activation/proposed-runtime-guard.mjs';
export function toolingHash(root) {
 const files=[...readdirSync(path.join(root,'tools/exam-activation')).filter(n=>/\.(mjs|ps1|json)$/.test(n)&&!n.endsWith('.test.mjs')).map(n=>'tools/exam-activation/'+n),
 'tools/phase6a-local/policy.mjs','tools/phase6a-local/run.mjs','tools/phase6a-local/upgrade.mjs','tools/media-activation/runtime.mjs','tools/media-activation/proposal.mjs','tools/lesson-deletion/policy.mjs','tools/study-activation/activation.mjs','tools/study-activation/proposed-runtime-guard.mjs','tools/exam-policy.mjs','tools/question-bank-policy.mjs',
 'artifacts/api-server/src/lib/exams.ts','artifacts/api-server/src/lib/question-revisions.ts','artifacts/api-server/src/routes/exams.ts'];
 return digest(JSON.stringify(files.sort().map(file=>[file,digest(readFileSync(path.join(root,file)))])));
}
export function sourcePlan(root) {
  const plan=readinessPlan(root),source={...assertExamProposal(root),baseline:JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0016_snapshot.json'),'utf8'))};
  assert.equal(digest(JSON.stringify(plan.manifest)),baselineChainHash,'Baseline source-chain checksum changed');
  const manifest=[...plan.manifest,{tag:exam17Migration[0],when:exam17Migration[1],hash:exam17Migration[2]}];
  const dir=path.join(root,'lib/db/drizzle');
  for(const name of ['0017_exam_simulator.sql','meta/0017_snapshot.json','meta/_journal.json.exam-promotion-pending'])assert(!existsSync(path.join(dir,name)),'Promotion destination exists; diagnose rather than retry');
  return {...plan,...source,manifest,toolingHash:toolingHash(root),officialJournal:readFileSync(path.join(dir,'meta/_journal.json'))};
}
export function assertRehearsal(evidence,plan,backupHash) {
  assertSafetyCoverage(evidence.safetyAssertions);
  assert.equal(evidence.toolingHash,plan.toolingHash,'Rehearsal tooling/source changed');
  assert.equal(evidence.stage,'complete');assert.equal(evidence.classification,'READY FOR APPROVAL');
  for(const flag of ['restorationVerified','rehearsalVerified','originalRecordsPreserved','permissionsVerified','constraintsVerified','rollbackVerified','repeatExecutionNoOpVerified','hbaRestoredByteForByte','archivedRevisionAclRestored','examFixtureVerified','answerPrivacyOwnershipVerified'])assert.equal(evidence[flag],true,'Missing rehearsal gate: '+flag);
  assert.equal(evidence.applicationDatabaseConnections,0);assert.equal(evidence.applicationWrites,0);
  for(const flag of ['exactSqlRehearsed','leastPrivilegeOwnerVerified','archivedAclRestored','fixtureRoleChangesRolledBack'])assert.equal(evidence[flag],true,'Restored baseline gate: '+flag);assert.equal(evidence.sourcePromoted,false);assert.equal(evidence.migrationExecutions,1);
  assert.deepEqual(evidence.proposal,plan.proposal);assert.equal(evidence.backup.sha256,backupHash,'This fresh archive was not restored/rehearsed');
  assert.equal(evidence.target.host,'127.0.0.1');assert.equal(evidence.target.port,55440);assert.equal(evidence.target.system,'7695735287099484548');assert.equal(evidence.target.version,180006);
  assert.equal(evidence.target.owner,'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170');assert.match(evidence.target.database,/^ccna_exam_0017_restore_[a-f0-9]{24}$/);
  assert.equal(evidence.target.directory,path.join(policy.root,'.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data').replaceAll('\\','/'));
  assert.equal(evidence.isolatedLedgerEntriesDuringRehearsal,17);
}
export function assertFreshBackup(report,now=Date.now()) {
  const age=now-Date.parse(report.createdAt);assert(Number.isFinite(age)&&age>=0&&age<=6*3600000,'Backup outside six-hour activation window');
  assert.deepEqual(report.sequences['drizzle.__drizzle_migrations_id_seq'],{last_value:'16',is_called:true},'Unexpected baseline ledger sequence');
}
export function preparedActivation(root,backupPath,rehearsalPath) {
  const plan=sourcePlan(root);
  const verified=verifyBackup(root,backupPath),backupBytes=readFileSync(backupPath),report=JSON.parse(backupBytes);assertFreshBackup(report);
  const evidencePath=realpathSync(rehearsalPath),parent=path.dirname(evidencePath);
  assert.equal(path.dirname(parent),realpathSync(path.join(root,'.local/exam-0017-restored')));assert.equal(path.basename(evidencePath),'rehearsal.json');
  const evidenceBytes=readFileSync(evidencePath),evidence=JSON.parse(evidenceBytes);assert.equal(path.basename(parent),evidence.target.database);
  assertRehearsal(evidence,plan,verified.sha256);
  return {...plan,report,backupPath:realpathSync(backupPath),backupReceiptHash:digest(backupBytes),rehearsalPath:evidencePath,rehearsalHash:digest(evidenceBytes),folder:path.dirname(realpathSync(backupPath))};
}
export function assertEvidenceUnchanged(root,plan) {
  assert.equal(toolingHash(root),plan.toolingHash,'Reviewed tooling changed during activation');assertFreshBackup(plan.report);assert.equal(digest(readFileSync(plan.backupPath)),plan.backupReceiptHash);assert.equal(digest(readFileSync(plan.rehearsalPath)),plan.rehearsalHash);
  assert.equal(digest(readFileSync(plan.report.backup.path)),plan.report.backup.sha256);assert.deepEqual(sourcePlan(root).manifest,plan.manifest);
}
export function stageExam(root,folder,plan) {
  assert(!existsSync(folder));mkdirSync(path.join(folder,'meta'),{recursive:true});
  const source={...assertExamProposal(root),baseline:JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0016_snapshot.json'),'utf8'))};assert.deepEqual(source.journal,plan.journal);
  const sql=readFileSync(path.join(root,'lib/db/drizzle/proposed/0017_exam_simulator.sql'));assert.equal(digest(sql),exam17Migration[2]);
  writeFileSync(path.join(folder,'0017_exam_simulator.sql'),sql,{flag:'wx'});
  // Deliberately contains exactly one SQL file and one journal entry.
  writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify({...plan.journal,entries:[plan.journal.entries[16]]}),{flag:'wx'});
}
export function promoteExam(root,plan) {
  const dir=path.join(root,'lib/db/drizzle');assertExamProposal(root);assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);
  for(const name of ['0017_exam_simulator.sql','meta/0017_snapshot.json'])writeFileSync(path.join(dir,name),readFileSync(path.join(dir,'proposed',name)),{flag:'wx'});
  const temp=path.join(dir,'meta/_journal.json.exam-promotion-pending');writeFileSync(temp,readFileSync(path.join(dir,'proposed/meta/0017_journal.json')),{flag:'wx'});
  assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);renameSync(temp,path.join(dir,'meta/_journal.json'));
  assert.deepEqual(migrationManifest(root),plan.manifest);
}
export async function verifyLockedBaseline(client,config,root,plan) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  assertSchemaCatalog(await readSchemaCatalog(client),plan.baseline);
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(ledger,plan.manifest.slice(0,16));assert.deepEqual(ledger,plan.report.baselineLedger);
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof);
  assert.deepEqual(await readSequences(client),plan.report.sequences);
  await assertDeletionFunction(client,root);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('guard_exam_state','execute_question_deletion_pre_exam')")).rows[0].n,0);
  await checkExistingRuntime(client,root);await assertStudyPolicies(client);await assertStudyPrivileges(client,policy.appRole);
}
export async function verifyActivated(client,config,root,plan,promoted=false) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  const catalog=await assertMediaRuntimeCatalog(client,root,plan.manifest);await checkExistingRuntime(client,root,12);
  // Project the ORIGINAL columns. New metadata must not alter old fingerprints.
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof,'Original row fingerprints changed');
  const seq=await readSequences(client);assert.deepEqual(seq['public.question_code_seq'],plan.report.sequences['public.question_code_seq']);assert.deepEqual(seq['drizzle.__drizzle_migrations_id_seq'],{last_value:'17',is_called:true});
  await assertDeletionFunction(client,root);
  for(const table of ['exam_sessions','exam_session_items'])assert.equal((await client.query('SELECT count(*)::int AS n FROM public.'+table)).rows[0].n,0,'No main test sessions may be created during activation');
  if(promoted){assertExamProposal(root);assert.deepEqual(migrationManifest(root),plan.manifest);}
  return {...catalog,existingRowsPreserved:true,questionCodeSequencePreserved:true,securityVerified:true};
}

export function offlinePlan(root) {
  const manifest=migrationManifest(root),proposal=assertExamProposal(root);
  if(manifest.length===17){assert.equal(digest(JSON.stringify(manifest.slice(0,16))),baselineChainHash);return {state:'SOURCE_PROMOTED',sourceEntries:17,pending:[],databaseVerified:false,databaseConnections:0,applyAllowed:false};}
  const plan=sourcePlan(root);return {state:'AWAITING_APPROVAL',sourceEntries:16,target:plan.target,proposal:plan.proposal,pending:[exam17Migration[0]],databaseVerified:false,databaseConnections:0,applyAllowed:false};
}
