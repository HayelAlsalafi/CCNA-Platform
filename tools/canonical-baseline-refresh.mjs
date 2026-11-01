// Inert review of a fresh backup. Does not write a plan or connect to PostgreSQL.
import assert from 'node:assert/strict';
export const confirmedUserDrift=Object.freeze({
  previousHash:'241929147565d00a30c7f4590aee5799da8b845e899f9819cc93fb16198ee9a1',
  currentHash:'bc49b64353bebb78e5e68975fb0704a51ee14582bc83f2beb076ffc6679bba83',
  accountReference:'df6191eb7e54a04bf97aef9d8c363fdb3f499d0cbc4bcb785bcb02a2bff901e9',
  fields:['last_login_at','updated_at'],
  previousTimestamp:'2026-10-17T10:34:11.059+00:00',
  currentTimestamp:'2026-10-17T13:46:17.753+00:00',
});
export function assertTimestampOnlyRefresh(original,report) {
  assert.equal(report.stage,'complete');assert.equal(report.committed,false);
  assert.equal(report.databaseWrites,0);assert.equal(report.applicationWrites,0);
  assert.equal(report.executionApproved,false);assert.equal(report.baselineCount,11);
  for(const key of ['identity','baselineLedger','clearTables','preservedTables','catalog','questionCodeSequence'])
    assert.deepEqual(report[key],original[key],'Refreshed scope differs: '+key);
  assert.equal(original.rowProof.users.count,9);
  assert.equal(original.rowProof.users.hash,confirmedUserDrift.previousHash);
  assert.deepEqual(Object.keys(report.rowProof).sort(),Object.keys(original.rowProof).sort());
  for(const [table,proof] of Object.entries(original.rowProof))
    assert.deepEqual(report.rowProof[table],table==='users'?{count:9,hash:confirmedUserDrift.currentHash}:proof,'Unreviewed refreshed data: '+table);
  assert.notEqual(report.backup.path,original.backup.path,'Retain original approved backup');
  assert.notEqual(report.backup.sha256,original.backup.sha256);
  assert(/^[a-f0-9]{64}$/.test(report.backup.sha256));
  assert(Number.isSafeInteger(report.backup.bytes)&&report.backup.bytes>0);
  assert.equal(report.backup.tocVerified,true);assert.equal(report.backup.fullArchiveDecodeVerified,true);
  assert.deepEqual(report.restoration,original.restoration,'Fresh backup must pass the same complete isolated restore proof');
  return {deletionScopeUnchanged:true,allNineAccountsPreserved:true,onlyConfirmedUserTimestampFingerprintRefreshed:true};
}
