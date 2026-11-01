import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readinessPlan} from './readiness.mjs';
import {assertBackupReceipt} from './verify-backup.mjs';
const plan=readinessPlan(process.cwd()),tables=['lessons','lesson_revisions'];
function fixture() {
  return {stage:'backup-complete',databaseWrites:0,identity:{...plan.target,sessionRole:plan.target.owner,versionNumber:180006,dataDirectory:'C:/Program Files/PostgreSQL/18/data',neon:null},
    baselineSchemaMatched:true,lessonRevisionGuardMatched:true,lessonPrivilegesMatched:true,studyObjectsAbsent:true,ledgerEntries:13,
    baselineLedger:plan.manifest.map((m,i)=>({id:i+1,hash:m.hash,created_at:String(m.when)})),proposal:plan.proposal,
    rowProof:Object.fromEntries(tables.map(t=>[t,{count:0,hash:'0'.repeat(64)}])),
    backup:{snapshotConsistent:true,tocVerified:true,fullArchiveDecodeVerified:true,sha256:'1'.repeat(64)},
    restorationVerified:false,rehearsalVerified:false,activationAuthorized:false};
}
test('a verified readable archive remains unproven for restore and activation',()=>assertBackupReceipt(fixture(),plan,tables));
test('wrong identity, drift, incomplete coverage and fabricated gate results are rejected',()=>{
  const changes=[r=>r.identity.port=55440,r=>r.identity.systemIdentifier='1',r=>r.databaseWrites=1,
    r=>r.baselineLedger.pop(),r=>r.baselineLedger[12].hash='2'.repeat(64),r=>r.baselineLedger[12].created_at='0',
    r=>delete r.rowProof.lesson_revisions,r=>r.backup.snapshotConsistent=false,
    r=>r.rehearsalVerified=true,r=>r.restorationVerified=true,r=>r.activationAuthorized=true,
    r=>r.lessonRevisionGuardMatched=false,r=>r.lessonPrivilegesMatched=false];
  for(const change of changes) {const report=fixture();change(report);assert.throws(()=>assertBackupReceipt(report,plan,tables));}
});
