// Database-free sequencing/guard regressions. Live PostgreSQL evidence is separate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withReadOnlyUtc } from './read-only-utc.mjs';
import { rowProof } from '../question-bank-upgrade-core.mjs';
import { policy, assertIdentity, assertLedger, migrationManifest, runtimeTableInventory } from '../phase6a-local/policy.mjs';
import { assertStudyPrivileges } from './proposed-runtime-guard.mjs';
const root=process.cwd(),manifest=migrationManifest(root);
const expected={questions:{count:16,hash:'a'.repeat(64)}};
function fixture(initial='Asia/Riyadh',drift=false) {
  let zone=initial,active=false;const calls=[];
  return {calls,get timezone(){return zone;},async query(sql){
    calls.push(sql);
    if(sql.startsWith('BEGIN')){active=true;return{rows:[]};}
    if(sql.includes("set_config('TimeZone','UTC',true)")){assert(active);zone='UTC';return{rows:[{timezone:zone,read_only:'on'}]};}
    if(sql==='ROLLBACK'){active=false;zone=initial;return{rows:[]};}
    if(sql.includes('jsonb_agg(to_jsonb(t)'))return{rows:[{count:16,hash:zone==='UTC'&&!drift?'a'.repeat(64):'b'.repeat(64)}]};
    throw Error('Unexpected mock query');
  }};
}
for(const initial of ['UTC','Asia/Riyadh'])test('same unchanged fingerprint comparison succeeds for initial '+initial,async()=>{
  const client=fixture(initial);
  await withReadOnlyUtc(client,async()=>assert.deepEqual(await rowProof(client,['questions']),expected));
  assert.equal(client.timezone,initial,'Local timezone leaked outside transaction');
  assert.equal(client.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert(client.calls[1].includes("set_config('TimeZone','UTC',true)"));
  assert.equal(client.calls.at(-1),'ROLLBACK');
});
test('genuine fingerprint mismatch still fails and releases local settings',async()=>{
  const client=fixture('Asia/Riyadh',true);
  await assert.rejects(withReadOnlyUtc(client,async()=>assert.deepEqual(await rowProof(client,['questions']),expected)));
  assert.equal(client.timezone,'Asia/Riyadh');assert.equal(client.calls.at(-1),'ROLLBACK');
});
test('verification cannot proceed if read-only/UTC context is not proven',async()=>{
  for(const settings of [{timezone:'Asia/Riyadh',read_only:'on'},{timezone:'UTC',read_only:'off'}]){
    let called=false;const calls=[];
    await assert.rejects(withReadOnlyUtc({query:async sql=>{calls.push(sql);return{rows:[settings]};}},async()=>{called=true;}));
    assert.equal(called,false);assert.equal(calls.at(-1),'ROLLBACK');
  }
});
test('identity, ledger and exact table count failures still propagate',async()=>{
  const identity={host:policy.host,port:policy.port,database:policy.database,sessionRole:policy.migrationRole,systemIdentifier:policy.upgradeSystemIdentifier,versionNumber:180006,dataDirectory:policy.dataDirectory,neon:null};
  const config={role:policy.migrationRole,systemIdentifier:policy.upgradeSystemIdentifier};
  const rows=manifest.map((m,i)=>({id:i+1,hash:m.hash,created_at:String(m.when)}));
  for(const fail of [()=>assertIdentity({...identity,systemIdentifier:'1'},config),()=>assertLedger(rows.slice(0,13),manifest),()=>assertLedger(rows.map((r,i)=>i===13?{...r,hash:'0'.repeat(64)}:r),manifest),()=>assert.equal(runtimeTableInventory(manifest).length-1,22)]){
    const c=fixture();await assert.rejects(withReadOnlyUtc(c,fail));assert.equal(c.calls.at(-1),'ROLLBACK');
  }
});
test('unsafe study privilege remains rejected in the read-only wrapper',async()=>{
  const client=fixture();
  await assert.rejects(withReadOnlyUtc(client,()=>assertStudyPrivileges({query:async()=>({rows:[]})},policy.appRole)));
  assert.equal(client.calls.at(-1),'ROLLBACK');
});
test('actual activator keeps its complete verified postcommit pipeline inside the UTC wrapper',()=>{
  const source=readFileSync('tools/study-activation/apply.mjs','utf8');
  assert(source.includes('withReadOnlyUtc(client,()=>verifyActivated(client,config,root,plan,true))'));
  const verify=readFileSync('tools/study-activation/activation.mjs','utf8').split('export async function verifyActivated')[1];
  for(const guard of ['assertIdentity','assertStudyRuntimeCatalog','catalog.tables,22','checkExistingRuntime','assertStudyPrivileges','assertStudyPolicies','rowProof','readSequences'])assert(verify.includes(guard));
});
