import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
// Offline archive/receipt verification. Does not restore or connect anywhere.
import assert from 'node:assert/strict';
import {realpathSync,statSync} from "node:fs";
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readinessPlan} from './readiness.mjs';
import {assertLedger} from '../phase6a-local/policy.mjs';
import {sterileEnvironment} from '../question-bank-disposable-access.mjs';
export function assertBackupReceipt(report,plan,tables) {
  assert.equal(report.stage,'backup-complete');
  assert.equal(report.databaseWrites,0);
  for(const key of ['host','port','database','systemIdentifier']) assert.equal(report.identity[key],plan.target[key]);
  assert.equal(report.identity.sessionRole,plan.target.owner);
  assert.equal(report.identity.versionNumber,180006);
  assert.equal(report.identity.dataDirectory,'C:/Program Files/PostgreSQL/18/data');
  assert([null,''].includes(report.identity.neon));
  assert.equal(report.baselineSchemaMatched,true);
  assert.equal(report.lessonRevisionGuardMatched,true);
  assert.equal(report.lessonPrivilegesMatched,true);
  assert.equal(report.examObjectsAbsent,true);
  assert.equal(report.ledgerEntries,16);
  assertLedger(report.baselineLedger,plan.manifest);
  assert.deepEqual(report.baselineLedger.map(row=>row.id),Array.from({length:16},(_,i)=>i+1));
  assert.deepEqual(report.proposal,plan.proposal);
  assert.deepEqual(Object.keys(report.rowProof).sort(),[...tables].sort());
  for(const proof of Object.values(report.rowProof)) {
    assert(Number.isSafeInteger(proof.count)&&proof.count>=0);
    assert.match(proof.hash,/^[a-f0-9]{64}$/);
  }
  for(const flag of ['snapshotConsistent','tocVerified','fullArchiveDecodeVerified']) assert.equal(report.backup[flag],true);
  assert.match(report.backup.sha256,/^[a-f0-9]{64}$/);
  // Archive verification never upgrades an unperformed restore/rehearsal to PASS.
  assert.equal(report.restorationVerified,false);
  assert.equal(report.rehearsalVerified,false);
  assert.equal(report.activationAuthorized,false);
}
export function verifyBackup(root,receiptPath) {
  const plan=readinessPlan(root),receipt=realpathSync(receiptPath),folder=path.dirname(receipt);
  assert.equal(path.basename(receipt),'exam-0017-backup.json');
  assert.equal(path.dirname(folder),realpathSync(path.join(root,'.local/question-bank-upgrade')));
  assert.match(path.basename(folder),/^exam-0017-[0-9TZ.-]+-[a-f0-9-]{36}$/);
  const report=JSON.parse(readFileSync(receipt,'utf8'));
  const tables=Object.values(JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0016_snapshot.json'),'utf8')).tables).map(t=>t.name);
  assertBackupReceipt(report,plan,tables);
  const archive=realpathSync(report.backup.path);
  assert.equal(path.dirname(archive),folder);
  assert.equal(path.basename(archive),'before-upgrade.dump');
  assert.equal(statSync(archive).size,report.backup.bytes);
  assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),report.backup.sha256);
  const bin='C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',env=sterileEnvironment();
  const options={env,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:16*1024*1024};
  const toc=execFileSync(bin,['--list',archive],options);
  for(const name of [...tables,'__drizzle_migrations']) assert(toc.includes('TABLE DATA '+(name==='__drizzle_migrations'?'drizzle':'public')+' '+name+' '),'Missing archive table');
  execFileSync(bin,['--file=NUL',archive],options);
  return {stage:'offline-backup-verified',databaseConnections:0,tables:tables.length,bytes:report.backup.bytes,sha256:report.backup.sha256,archiveReadable:true,restorationVerified:false,rehearsalVerified:false,activationAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,3,'Supply only the reviewed exam-0017-backup.json path');
  console.log(JSON.stringify(verifyBackup(realpathSync(process.cwd()),process.argv[2])));
}
