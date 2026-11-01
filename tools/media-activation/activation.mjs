import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
// Inert helpers for the dedicated 0015 executor; no operation on import.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync,renameSync,realpathSync} from "node:fs";
import path from 'node:path';
import {assertMediaProposal,mediaMigration,baselineChainHash,digest} from './proposal.mjs';
import {readinessPlan} from './readiness.mjs';
import {verifyBackup} from './verify-backup.mjs';
import {migrationManifest,assertLedger,assertIdentity,policy} from '../phase6a-local/policy.mjs';
import {readSchemaCatalog,assertSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertMediaRuntimeCatalog} from './runtime.mjs';
import {checkExistingRuntime,readSequences} from '../study-activation/activation.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {assertStudyPolicies,assertStudyPrivileges} from '../study-activation/proposed-runtime-guard.mjs';
export const reviewedRehearsal={path:'.local/media-0015-rehearsal/ccna_media_0015_e13dfb49bd8a45939e31d53c/rehearsal.json',hash:'66ec68a9932b1f1b622769f3f0a1392845444ae1b4eb9547a449febe115c2b21'};
export function sourcePlan(root) {
  const plan=readinessPlan(root),source=assertMediaProposal(root);
  assert.equal(digest(JSON.stringify(plan.manifest)),baselineChainHash,'Baseline source-chain checksum changed');
  const manifest=[...plan.manifest,{tag:mediaMigration[0],when:mediaMigration[1],hash:mediaMigration[2]}];
  const dir=path.join(root,'lib/db/drizzle');
  for(const name of ['0015_lesson_media_library.sql','meta/0015_snapshot.json','meta/_journal.json.media-promotion-pending'])assert(!existsSync(path.join(dir,name)),'Promotion destination exists; diagnose rather than retry');
  return {...plan,...source,manifest,officialJournal:readFileSync(path.join(dir,'meta/_journal.json'))};
}
export function assertRehearsal(evidence,plan,backupHash) {
  assert.equal(evidence.stage,'complete');assert.equal(evidence.classification,'READY FOR APPROVAL');
  for(const flag of ['restorationVerified','rehearsalVerified','originalRecordsPreserved','permissionsVerified','constraintsVerified','rollbackVerified','repeatExecutionNoOpVerified','hbaRestoredByteForByte','archivedRevisionAclRestored'])assert.equal(evidence[flag],true,'Missing rehearsal gate: '+flag);
  assert.equal(evidence.applicationDatabaseConnections,0);assert.equal(evidence.applicationWrites,0);assert.equal(evidence.sourcePromoted,false);assert.equal(evidence.migrationExecutions,1);
  assert.deepEqual(evidence.proposal,plan.proposal);assert.equal(evidence.backup.sha256,backupHash,'This fresh archive was not restored/rehearsed');
  assert.equal(evidence.target.host,'127.0.0.1');assert.equal(evidence.target.port,55440);assert.equal(evidence.target.system,'7695735287099484548');assert.equal(evidence.target.version,180006);
  assert.equal(evidence.target.owner,'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170');assert.match(evidence.target.database,/^ccna_media_0015_[a-f0-9]{24}$/);
  assert.equal(evidence.target.directory,path.join(policy.root,'.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data').replaceAll('\\','/'));
  assert.equal(evidence.isolatedLedgerEntriesDuringRehearsal,15);
}
export function assertFreshBackup(report,now=Date.now()) {
  const age=now-Date.parse(report.createdAt);assert(Number.isFinite(age)&&age>=0&&age<=6*3600000,'Backup outside six-hour activation window');
  assert.deepEqual(report.sequences['drizzle.__drizzle_migrations_id_seq'],{last_value:'14',is_called:true},'Unexpected baseline ledger sequence');
}
export function preparedActivation(root,backupPath,rehearsalPath) {
  const plan=sourcePlan(root);
  // Pin the original reviewed successful run as well as the fresh archive's run.
  assert.equal(digest(readFileSync(path.join(root,reviewedRehearsal.path))),reviewedRehearsal.hash,'Reviewed rehearsal evidence changed');
  const verified=verifyBackup(root,backupPath),backupBytes=readFileSync(backupPath),report=JSON.parse(backupBytes);assertFreshBackup(report);
  const evidencePath=realpathSync(rehearsalPath),parent=path.dirname(evidencePath);
  assert.equal(path.dirname(parent),realpathSync(path.join(root,'.local/media-0015-rehearsal')));assert.equal(path.basename(evidencePath),'rehearsal.json');
  const evidenceBytes=readFileSync(evidencePath),evidence=JSON.parse(evidenceBytes);assert.equal(path.basename(parent),evidence.target.database);
  assertRehearsal(evidence,plan,verified.sha256);
  return {...plan,report,backupPath:realpathSync(backupPath),backupReceiptHash:digest(backupBytes),rehearsalPath:evidencePath,rehearsalHash:digest(evidenceBytes),folder:path.dirname(realpathSync(backupPath))};
}
export function assertEvidenceUnchanged(root,plan) {
  assertFreshBackup(plan.report);assert.equal(digest(readFileSync(plan.backupPath)),plan.backupReceiptHash);assert.equal(digest(readFileSync(plan.rehearsalPath)),plan.rehearsalHash);
  assert.equal(digest(readFileSync(plan.report.backup.path)),plan.report.backup.sha256);assert.deepEqual(sourcePlan(root).manifest,plan.manifest);
}
export function stageMedia(root,folder,plan) {
  assert(!existsSync(folder));mkdirSync(path.join(folder,'meta'),{recursive:true});
  const source=assertMediaProposal(root);assert.deepEqual(source.journal,plan.journal);
  const sql=readFileSync(path.join(root,'lib/db/drizzle/proposed/0015_lesson_media_library.sql'));assert.equal(digest(sql),mediaMigration[2]);
  writeFileSync(path.join(folder,'0015_lesson_media_library.sql'),sql,{flag:'wx'});
  // Deliberately contains exactly one SQL file and one journal entry.
  writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify({...plan.journal,entries:[plan.journal.entries[14]]}),{flag:'wx'});
}
export function promoteMedia(root,plan) {
  const dir=path.join(root,'lib/db/drizzle');assertMediaProposal(root);assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);
  for(const name of ['0015_lesson_media_library.sql','meta/0015_snapshot.json'])writeFileSync(path.join(dir,name),readFileSync(path.join(dir,'proposed',name)),{flag:'wx'});
  const temp=path.join(dir,'meta/_journal.json.media-promotion-pending');writeFileSync(temp,readFileSync(path.join(dir,'proposed/meta/0015_journal.json')),{flag:'wx'});
  assert.deepEqual(readFileSync(path.join(dir,'meta/_journal.json')),plan.officialJournal);renameSync(temp,path.join(dir,'meta/_journal.json'));
  assert.deepEqual(migrationManifest(root),plan.manifest);
}
export async function verifyLockedBaseline(client,config,root,plan) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  assertSchemaCatalog(await readSchemaCatalog(client),plan.baseline);
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(ledger,plan.manifest.slice(0,14));assert.deepEqual(ledger,plan.report.baselineLedger);
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof);
  assert.deepEqual(await readSequences(client),plan.report.sequences);
  await checkExistingRuntime(client,root);await assertStudyPolicies(client);await assertStudyPrivileges(client,policy.appRole);
}
export async function verifyActivated(client,config,root,plan,promoted=false) {
  assertIdentity((await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity,config);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n,0,'Other database clients exist');
  const catalog=await assertMediaRuntimeCatalog(client,root,plan.manifest);await checkExistingRuntime(client,root);
  // Project the ORIGINAL columns. New metadata must not alter old fingerprints.
  assert.deepEqual(await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline),plan.report.rowProof,'Original row fingerprints changed');
  const seq=await readSequences(client);assert.deepEqual(seq['public.question_code_seq'],plan.report.sequences['public.question_code_seq']);assert.deepEqual(seq['drizzle.__drizzle_migrations_id_seq'],{last_value:'15',is_called:true});
  if(promoted){assertMediaProposal(root);assert.deepEqual(migrationManifest(root),plan.manifest);}
  return {...catalog,existingRowsPreserved:true,questionCodeSequencePreserved:true,securityVerified:true};
}
