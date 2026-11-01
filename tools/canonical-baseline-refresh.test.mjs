import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertTimestampOnlyRefresh,confirmedUserDrift} from './canonical-baseline-refresh.mjs';
const original=JSON.parse(readFileSync('tools/canonical-chapters-original-approval.json','utf8'));
function fresh() {
 const report=structuredClone(original);
 Object.assign(report,{stage:'complete',committed:false,databaseWrites:0,applicationWrites:0,executionApproved:false});
 report.rowProof.users={count:9,hash:confirmedUserDrift.currentHash};
 report.backup={...report.backup,path:original.backup.path+'.fresh-fixture',sha256:'f'.repeat(64)};
 return report;
}
test('accepts only the independently confirmed timestamp fingerprint and unchanged deletion scope',()=>{
 assert.equal(assertTimestampOnlyRefresh(original,fresh()).deletionScopeUnchanged,true);
});
for(const [name,change] of [
 ['another user change',r=>r.rowProof.users.hash='0'.repeat(64)],
 ['new account',r=>r.rowProof.users.count=10],
 ['question change',r=>r.rowProof.questions.hash='0'.repeat(64)],
 ['topic change',r=>r.rowProof.topics.hash='0'.repeat(64)],
 ['achievement change',r=>r.rowProof.achievement_definitions.hash='0'.repeat(64)],
 ['added deletion target',r=>r.clearTables.push('users')],
 ['changed server',r=>r.identity.systemIdentifier='7694701597474139000'],
 ['changed ledger',r=>r.baselineLedger.pop()],
 ['changed sequence',r=>r.questionCodeSequence[0].last_value='137'],
 ['unverified restore',r=>r.restoration.restoreVerified=false],
 ['overwritten original backup',r=>r.backup.path=original.backup.path],
 ['application write',r=>r.databaseWrites=1],
 ['incomplete inventory',r=>delete r.rowProof.practice_attempts],
])test('refuses '+name,()=>{const report=fresh();change(report);assert.throws(()=>assertTimestampOnlyRefresh(original,report));});
