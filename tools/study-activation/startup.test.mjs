// Offline wiring and fail-closed checks. Temporary source copies only; no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { migrationManifest, runtimeTableInventory, assertLedger } from '../phase6a-local/policy.mjs';
import { upgradeSnapshots } from '../phase6a-local/upgrade.mjs';
import { assertStudyPolicies, assertStudyPrivileges } from './proposed-runtime-guard.mjs';
const root=process.cwd(), baseline=migrationManifest(root);
mkdirSync('.local/study-startup-tests',{recursive:true});
const copy=mkdtempSync(path.join(root,'.local/study-startup-tests/source-'));
cpSync(path.join(root,'lib/db/drizzle'),path.join(copy,'lib/db/drizzle'),{recursive:true});
for(const name of ['tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json','lib/ccna-book-chapters.ts','lib/canonical-chapters.json']) {
  mkdirSync(path.dirname(path.join(copy,name)),{recursive:true});
  cpSync(path.join(root,name),path.join(copy,name));
}
const db=path.join(copy,'lib/db/drizzle'),journal=readFileSync(path.join(db,'proposed/meta/0014_journal.json'));
cpSync(path.join(db,'proposed/0014_interactive_study.sql'),path.join(db,'0014_interactive_study.sql'));
cpSync(path.join(db,'proposed/meta/0014_snapshot.json'),path.join(db,'meta/0014_snapshot.json'));
writeFileSync(path.join(db,'meta/_journal.json'),journal);
test('actual active manifest/snapshot readers accept both exact 13 and 14 states',()=>{
  assert.equal(baseline.length,13);
  assert.equal(runtimeTableInventory(baseline).length,19);
  assert.equal(Object.keys(upgradeSnapshots(root)[1].tables).length,19);
  const manifest=migrationManifest(copy);
  assert.equal(manifest.length,14);
  assert.deepEqual(manifest.slice(0,13),baseline);
  assert.equal(runtimeTableInventory(manifest).length,22);
  assert.equal(Object.keys(upgradeSnapshots(copy)[1].tables).length,22);
  assert(!manifest.some(m=>m.tag==='0012_exam_simulator'));
});
test('wrong pending tag, hash, timestamp, order and extra entries are refused',()=>{
  for(const mutate of [j=>j.entries[13].tag='0012_exam_simulator',j=>j.entries[13].when++,j=>j.entries.reverse(),j=>j.entries.push({...j.entries[13],idx:14})]) {
    const j=JSON.parse(journal);mutate(j);writeFileSync(path.join(db,'meta/_journal.json'),JSON.stringify(j));
    try{assert.throws(()=>migrationManifest(copy));}finally{writeFileSync(path.join(db,'meta/_journal.json'),journal);}
  }
  const sql=path.join(db,'0014_interactive_study.sql'),bytes=readFileSync(sql);
  try{writeFileSync(sql,Buffer.concat([bytes,Buffer.from('\n-- drift')]));assert.throws(()=>migrationManifest(copy));}finally{writeFileSync(sql,bytes);}
});
test('runtime inventory never accepts an unknown fourteenth migration',()=>{
  const m=migrationManifest(copy);m[13]={...m[13],tag:'other'};
  assert.throws(()=>runtimeTableInventory(m));
  assert.throws(()=>runtimeTableInventory([...m,m[13]]));
});
test('14-entry ledger requires all hashes and timestamps and rejects a duplicate or missing row',()=>{
  const m=migrationManifest(copy),rows=m.map((x,i)=>({id:i+1,hash:x.hash,created_at:String(x.when)}));
  assertLedger(rows,m);
  assert.throws(()=>assertLedger(rows.slice(0,13),m));
  for(const field of ['hash','created_at']){const next=structuredClone(rows);next[13][field]='0';assert.throws(()=>assertLedger(next,m));}
  assert.throws(()=>assertLedger([...rows.slice(0,13),rows[12]],m));
});
test('launcher wiring preserves lesson checks and calls study policy/privilege guards',()=>{
  const run=readFileSync(path.join(root,'tools/phase6a-local/run.mjs'),'utf8');
  assert.match(run,/count===14\)\{await assertLessonPrivileges\(client\);await assertLessonRevisionGuard\(client,root\);await assertStudyPrivileges\(client,'ccna_phase6a_app'\);await assertStudyPolicies\(client\);\}/);
  assert.match(run,/verifyRuntimeLedger\(mode,input,ledgerPassword,manifest,snapshots/);
  assert.match(run,/assertQuestionBankFunctions\(client,root,count===13&&!lessonOnly\?12:count===10\?9:10\)/);
});
test('study privileges reject extra DELETE, missing SELECT, and unsafe MAINTAIN',async()=>{
  const rows=['lesson_annotations','lesson_media','lesson_progress'].map(name=>({name:'public.'+name,select:true,insert:true,update:name!=='lesson_media',delete:name==='lesson_annotations',truncate:false,references:false,trigger:false,maintain:false}));
  await assertStudyPrivileges({query:async()=>({rows})},'ccna_phase6a_app');
  for(const [i,k] of [[1,'delete'],[2,'select'],[0,'maintain']]){const changed=structuredClone(rows);changed[i][k]=!changed[i][k];await assert.rejects(assertStudyPrivileges({query:async()=>({rows:changed})},'ccna_phase6a_app'));}
});
test('study policies reject disabled RLS before accepting policy expressions',async()=>{
  await assert.rejects(assertStudyPolicies({query:async()=>({rows:[{relname:'lesson_annotations',relrowsecurity:false,relforcerowsecurity:false}]})}));
});
