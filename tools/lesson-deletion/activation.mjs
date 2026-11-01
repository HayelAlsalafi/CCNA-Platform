import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
// Inert helpers for the dedicated 0016 executor; no operation on import.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync,renameSync,realpathSync} from "node:fs";
import path from 'node:path';
import {assertDeletionProposal,deletionMigration,assertDeletionFunction} from './policy.mjs';
import {digest} from '../media-activation/proposal.mjs';
const baselineChainHash='6a6ad1038cfdcf9c901121734f7551ef49b64d7ab63964d53c5363dbfc86e77d';
import {readinessPlan} from './readiness.mjs';
import {verifyBackup} from './verify-backup.mjs';
import {migrationManifest,assertLedger,assertIdentity,policy} from '../phase6a-local/policy.mjs';
import {readSchemaCatalog,assertSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertMediaRuntimeCatalog} from '../media-activation/runtime.mjs';
import {checkExistingRuntime,readSequences} from '../study-activation/activation.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {assertStudyPolicies,assertStudyPrivileges} from '../study-activation/proposed-runtime-guard.mjs';
export const reviewedRehearsal={path:'.local/lesson-deletion/ccna_lesson_delete_0016_4299210e385a4d58be08029c/rehearsal.json',hash:'784a5ae5a4158dfb8af4d61edd919ebf1f15d08c568faebb45b3119e57e104de'};
export function sourcePlan(root) {
  const plan=readinessPlan(root),source={...assertDeletionProposal(root),baseline:JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0015_snapshot.json'),'utf8'))};
  assert.equal(digest(JSON.stringify(plan.manifest)),baselineChainHash,'Baseline source-chain checksum changed');
  const manifest=[...plan.manifest,{tag:deletionMigration[0],when:deletionMigration[1],hash:deletionMigration[2]}];
  const dir=path.join(root,'lib/db/drizzle');
  for(const name of ['0016_safe_lesson_deletion.sql','meta/0016_snapshot.json','meta/_journal.json.lesson-delete-promotion-pending'])assert(!existsSync(path.join(dir,name)),'Promotion destination exists; diagnose rather than retry');
  return {...plan,...source,manifest,officialJournal:readFileSync(path.join(dir,'meta/_journal.json'))};
}
export function assertRehearsal(evidence,plan,backupHash) {
  assert.equal(evidence.stage,'complete');assert.equal(evidence.classification,'READY FOR APPROVAL');
  for(const flag of ['restorationVerified','rehearsalVerified','originalRecordsPreserved','permissionsVerified','constraintsVerified','rollbackVerified','repeatExecutionNoOpVerified','hbaRestoredByteForByte','archivedRevisionAclRestored'])assert.equal(evidence[flag],true,'Missing rehearsal gate: '+flag);
  assert.equal(evidence.applicationDatabaseConnections,0);assert.equal(evidence.applicationWrites,0);
  for(const flag of ['exactSqlRehearsed','leastPrivilegeOwnerVerified','archivedAclRestored','fixtureRoleChangesRolledBack'])assert.equal(evidence[flag],true,'Restored baseline gate: '+flag);assert.equal(evidence.sourcePromoted,false);assert.equal(evidence.migrationExecutions,1);
  assert.deepEqual(evidence.proposal,plan.proposal);assert.equal(evidence.backup.sha256,backupHash,'This fresh archive was not restored/rehearsed');
  assert.equal(evidence.target.host,'127.0.0.1');assert.equal(evidence.target.port,55440);assert.equal(evidence.target.system,'7695735287099484548');assert.equal(evidence.target.version,180006);
  assert.equal(evidence.target.owner,'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170');assert.match(evidence.target.database,/^ccna_lesson_delete_restore_[a-f0-9]{24}$/);
  assert.equal(evidence.target.directory,path.join(policy.root,'.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data').replaceAll('\\','/'));
  assert.equal(evidence.isolatedLedgerEntriesDuringRehearsal,16);
}
export function assertFreshBackup(report,now=Date.now()) {
  const age=now-Date.parse(report.createdAt);assert(Number.isFinite(age)&&age>=0&&age<=6*3600000,'Backup outside six-hour activation window');
  assert.deepEqual(report.sequences['drizzle.__drizzle_migrations_id_seq'],{last_value:'15',is_called:true},'Unexpected baseline ledger sequence');
}
export function preparedActivation(root,backupPath,rehearsalPath) {
  const plan=sourcePlan(root);
  // Pin the original reviewed successful run as well as the fresh archive's run.
  assert.equal(digest(readFileSync(path.join(root,reviewedRehearsal.path))),reviewedRehearsal.hash,'Reviewed rehearsal evidence changed');
  const verified=verifyBackup(root,backupPath),backupBytes=readFileSync(backupPath),report=JSON.parse(backupBytes);assertFreshBackup(report);
  const evidencePath=realpathSync(rehearsalPath),parent=path.dirname(evidencePath);
  assert.equal(path.dirname(parent),realpathSync(path.join(root,'.local/lesson-deletion-restored')));assert.equal(path.basename(evidencePath),'rehearsal.json');
  const evidenceBytes=readFileSync(evidencePath),evidence=JSON.parse(evidenceBytes);assert.equal(path.basename(parent),evidence.target.database);
  assertRehearsal(evidence,plan,verified.sha256);
  return {...plan,report,backupPath:realpathSync(backupPath),backupReceiptHash:digest(backupBytes),rehearsalPath:evidencePath,rehearsalHash:digest(evidenceBytes),folder:path.dirname(realpathSync(backupPath))};
}
export function assertEvidenceUnchanged(root,plan) {
  assertFreshBackup(plan.report);assert.equal(digest(readFileSync(plan.backupPath)),plan.backupReceiptHash);assert.equal(digest(readFileSync(plan.rehearsalPath)),plan.rehearsalHash);
  assert.equal(digest(readFileSync(plan.report.backup.path)),plan.report.backup.sha256);assert.deepEqual(sourcePlan(root).manifest,plan.manifest);
}
export function stageDeletion(root,folder,plan) {
  assert(!existsSync(folder));mkdirSync(path.join(folder,'meta'),{recursive:true});
  const source={...assertDeletionProposal(root),baseline:JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0015_snapshot.json'),'utf8'))};assert.deepEqual(source.journal,plan.journal);
  const sql=readFileSync(path.join(root,'lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql'));assert.equal(digest(sql),deletionMigration[2]);
  writeFileSync(path.join(folder,'0016_safe_lesson_deletion.sql'),sql,{flag:'wx'});
  // Deliberately contains exactly one SQL file and one journal entry.
  writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify({...plan.journal,entries:[plan.journal.entries[15]]}),{flag:'wx'});
}
export function promoteDeletion(root,plan) {
  const dir=path.join(root,'lib/db/drizzle');assertDeletionProposal(root);assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);
  for(const name of ['0016_safe_lesson_deletion.sql','meta/0016_snapshot.json'])writeFileSync(path.join(dir,name),readFileSync(path.join(dir,'proposed',name)),{flag:'wx'});
  const temp=path.join(dir,'meta/_journal.json.lesson-delete-promotion-pending');writeFileSync(temp,readFileSync(path.join(dir,'proposed/meta/0016_journal.json')),{flag:'wx'});
  assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);renameSync(temp,path.join(dir,'meta/_journal.json'));
  assert.deepEqual(migrationManifest(root),plan.manifest);
}
export async function verifyLockedBaseline(client,config,root,plan) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  assertSchemaCatalog(await readSchemaCatalog(client),plan.baseline);
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(ledger,plan.manifest.slice(0,15));assert.deepEqual(ledger,plan.report.baselineLedger);
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof);
  assert.deepEqual(await readSequences(client),plan.report.sequences);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_never_published_lesson'")).rows[0].n,0,'Deletion function already exists');
  await checkExistingRuntime(client,root);await assertStudyPolicies(client);await assertStudyPrivileges(client,policy.appRole);
}
export async function verifyActivated(client,config,root,plan,promoted=false) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  const catalog=await assertMediaRuntimeCatalog(client,root,plan.manifest);await checkExistingRuntime(client,root);
  // Project the ORIGINAL columns. New metadata must not alter old fingerprints.
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof,'Original row fingerprints changed');
  const seq=await readSequences(client);assert.deepEqual(seq['public.question_code_seq'],plan.report.sequences['public.question_code_seq']);assert.deepEqual(seq['drizzle.__drizzle_migrations_id_seq'],{last_value:'16',is_called:true});
  await assertDeletionFunction(client,root);
  if(promoted){assertDeletionProposal(root);assert.deepEqual(migrationManifest(root),plan.manifest);}
  return {...catalog,existingRowsPreserved:true,questionCodeSequencePreserved:true,securityVerified:true};
}

export function offlinePlan(root) {
  const manifest=migrationManifest(root),proposal=assertDeletionProposal(root);
  if(manifest.length===16){assert.equal(digest(JSON.stringify(manifest.slice(0,15))),baselineChainHash);return {state:'SOURCE_PROMOTED',sourceEntries:16,pending:[],databaseVerified:false,databaseConnections:0,applyAllowed:false};}
  const plan=sourcePlan(root);return {state:'AWAITING_APPROVAL',sourceEntries:15,target:plan.target,proposal:plan.proposal,pending:[deletionMigration[0]],databaseVerified:false,databaseConnections:0,applyAllowed:false};
}
