import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalSources} from './canonical-chapters-policy.mjs';
import {migrationManifest} from './phase6a-local/policy.mjs';
import {assertCanonicalExecutionLedger,canonicalExecutionState} from './canonical-execution-state.mjs';
const root=process.cwd(),{plan,journal}=canonicalSources(root),manifest=migrationManifest(root);
const baseline=plan.baselineLedger;
const applied=[...structuredClone(baseline),{id:12,hash:manifest[11].hash,created_at:String(manifest[11].when)}];
test('promoted source is the exact reviewed twelve-entry chain',()=>{
 assert.equal(manifest.length,12);
 assert.deepEqual(JSON.parse(readFileSync('lib/db/drizzle/meta/_journal.json','utf8')),journal);
});
test('source promotion permits SELECT-only diagnosis of unchanged eleven-entry database',()=>{
 assert.doesNotThrow(()=>assertCanonicalExecutionLedger(baseline,manifest,baseline));
});
test('recognizes applied canonical migration without treating it as reset approval',()=>{
 assert.doesNotThrow(()=>assertCanonicalExecutionLedger(applied,manifest,baseline));
 assert.match(readFileSync('tools/canonical-execution-state.mjs','utf8'),/resetRetryAuthorizedByDiagnostic:false/);
});
for(const [name,change] of [
 ['wrong hash',r=>r[0].hash='0'.repeat(64)],
 ['wrong timestamp',r=>r[1].created_at='0'],
 ['duplicate entry',r=>r[2]={...r[1]}],
 ['changed baseline ID',r=>r[0].id=99],
 ['duplicate canonical ID',r=>r[11].id=1],
 ['invalid canonical ID',r=>r[11].id=-1],
 ['missing migration',r=>r.splice(4,1)],
 ['extra migration',r=>r.push({...r[11],id:13})],
 ['incorrect canonical hash',r=>r[11].hash='0'.repeat(64)],
 ['incorrect canonical timestamp',r=>r[11].created_at='0'],
 ['reordered ledger',r=>r.reverse()],
])test('refuses '+name,()=>{
 const rows=structuredClone(applied);change(rows);
 assert.throws(()=>assertCanonicalExecutionLedger(rows,manifest,baseline));
});
test('unexpected ledger state stops before catalog or row inspection',async()=>{
 let calls=0;
 await assert.rejects(canonicalExecutionState({query:async sql=>{
  calls++;assert.match(sql,/^SELECT /);return {rows:[]};
 }},root),/Unexpected canonical execution ledger inventory/);
 assert.equal(calls,1);
});
