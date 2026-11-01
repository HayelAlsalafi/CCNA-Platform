// Offline source copies and query fixtures only; no database/network operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {sourcePlan,stageMedia,promoteMedia,assertFreshBackup,assertRehearsal,verifyLockedBaseline,verifyActivated} from './activation.mjs';
import {executionIntent} from './apply.mjs';
import {assertMediaProposal,mediaColumns,mediaMigration} from './proposal.mjs';
import {assertMediaCatalogStructure,assertMediaDetails,checkTree} from './runtime.mjs';
import {migrationManifest,runtimeTableInventory,assertLedger} from '../phase6a-local/policy.mjs';
import {upgradeSnapshots} from '../phase6a-local/upgrade.mjs';
import {proposedStudyManifest,assertStudyPolicies,assertStudyPrivileges} from '../study-activation/proposed-runtime-guard.mjs';
const root=process.cwd(),plan=sourcePlan(root),snapshot=assertMediaProposal(root).snapshot;
mkdirSync('.local/media-startup-tests',{recursive:true});
const folder=mkdtempSync(path.resolve('.local/media-startup-tests/source-'));
cpSync('lib/db/drizzle',path.join(folder,'lib/db/drizzle'),{recursive:true});
for(const name of ['tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json','lib/ccna-book-chapters.ts','lib/canonical-chapters.json']){mkdirSync(path.dirname(path.join(folder,name)),{recursive:true});cpSync(name,path.join(folder,name));}
test('14-entry live source stays unchanged; promotion in source COPY enables strict 15-entry branches',()=>{
  assert.equal(migrationManifest(root).length,14);assert.equal(upgradeSnapshots(root)[1].id,plan.baseline.id);
  promoteMedia(folder,plan);
  const manifest=migrationManifest(folder);assert.deepEqual(manifest,plan.manifest);assert.equal(runtimeTableInventory(manifest).length,22);
  assert.deepEqual(upgradeSnapshots(folder)[1],snapshot);assert.deepEqual(proposedStudyManifest(folder),manifest);
  const rows=manifest.map((m,i)=>({id:i+1,hash:m.hash,created_at:String(m.when)}));assertLedger(rows,manifest);
  for(const broken of [rows.slice(0,14),rows.map((r,i)=>i===14?{...r,hash:'0'.repeat(64)}:r),[...rows].reverse()])assert.throws(()=>assertLedger(broken,manifest));
  assert.throws(()=>runtimeTableInventory([...manifest,{tag:'unknown'}]));
  assert.throws(()=>runtimeTableInventory(manifest.map((m,i)=>i===14?{...m,hash:'0'.repeat(64)}:m)));
  const sqlFile=path.join(folder,'lib/db/drizzle/0015_lesson_media_library.sql'),bytes=readFileSync(sqlFile);writeFileSync(sqlFile,Buffer.concat([bytes,Buffer.from('\n-- drift')]));assert.throws(()=>migrationManifest(folder));writeFileSync(sqlFile,bytes);
  const snapFile=path.join(folder,'lib/db/drizzle/meta/0015_snapshot.json'),snapBytes=readFileSync(snapFile);writeFileSync(snapFile,'{}');assert.throws(()=>migrationManifest(folder));writeFileSync(snapFile,snapBytes);
  assert.equal(migrationManifest(root).length,14);
});
test('dedicated staging contains ONLY approved 0015; ambiguous invocation is rejected',()=>{
  const staging=path.join(folder,'staging');stageMedia(root,staging,plan);
  assert.deepEqual(readdirSync(staging).sort(),['0015_lesson_media_library.sql','meta']);
  assert.equal(JSON.parse(readFileSync(path.join(staging,'meta/_journal.json'))).entries.length,1);
  assert.deepEqual(executionIntent(['--apply','--confirm-reviewed-media','--backup','b','--rehearsal','r']),{backup:'b',rehearsal:'r'});
  for(const args of [[],['--apply'],['--apply','--confirm-reviewed-study','--backup','b','--rehearsal','r'],['--apply','--confirm-reviewed-media','--backup','b','--rehearsal','r','--skip']])assert.throws(()=>executionIntent(args));
});
function catalog(s) {
  const sort=rows=>rows.sort((a,b)=>(a.table+'/'+a.name).localeCompare(b.table+'/'+b.name));
  const tables=Object.values(s.tables).sort((a,b)=>a.name.localeCompare(b.name));
  const constraints=sort(tables.flatMap(t=>[
    ...Object.entries(t.uniqueConstraints).map(([name,c])=>({table:t.name,name,kind:'u',columns:c.columns})),
    ...Object.entries(t.foreignKeys).map(([name,c])=>({table:t.name,name,kind:'f',columns:c.columnsFrom,target:c.tableTo,targetColumns:c.columnsTo,onDelete:({'restrict':'r','cascade':'c','no action':'a','set null':'n','set default':'d'})[c.onDelete]})),
    ...Object.keys(t.checkConstraints).map(name=>({table:t.name,name,kind:'c'})),
    ...Object.entries(t.compositePrimaryKeys).map(([name,c])=>({table:t.name,name,kind:'p',columns:c.columns})),
    ...Object.values(t.columns).filter(c=>c.primaryKey).map(c=>({table:t.name,name:t.name+'_pkey',kind:'p',columns:[c.name]}))]));
  return {tables:tables.map(t=>({name:t.name,kind:'r',owner:'ccna_phase6a_migrator'})),columns:tables.flatMap(t=>Object.values(t.columns).map(c=>({table:t.name,name:c.name,type:c.type,notNull:c.notNull}))),constraints,
    indexes:sort(tables.flatMap(t=>[...Object.entries(t.indexes).map(([name,i])=>({table:t.name,name,unique:i.isUnique,columns:i.columns.map(c=>c.expression),where:(i.where??'').replace(/(?:"[^\"]+"|[a-z_][a-z_0-9]*)\./gi,'').replaceAll('"','').replace(/\s|[()]/g,'')})),...constraints.filter(c=>c.table===t.name&&['p','u'].includes(c.kind)).map(c=>({table:t.name,name:c.name,unique:true,columns:c.columns,where:''}))])),
    enums:Object.values(s.enums).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>({name:e.name,values:e.values})),sequences:Object.values(s.sequences).map(s=>s.name).sort()};
}
test('actual catalog structure accepts reviewed 22 tables; rejects partial columns, added tables, owners and constraints',()=>{
  const valid=catalog(snapshot);assertMediaCatalogStructure(valid,snapshot);
  for(const mutate of [c=>c.columns.splice(c.columns.findIndex(x=>x.name==='thumbnail_key'),1),c=>c.tables.push({name:'unexpected',kind:'r',owner:'ccna_phase6a_migrator'}),c=>c.tables[0].owner='other',c=>c.tables[0].kind='v',c=>c.constraints.pop(),c=>c.indexes.pop(),c=>c.columns.find(x=>x.name==='original_name').notNull=false]){const bad=structuredClone(valid);mutate(bad);assert.throws(()=>assertMediaCatalogStructure(bad,snapshot));}
});
test('metadata definitions enforce defaults, check boolean semantics and index direction',async()=>{
  const expected=snapshot.tables['public.lesson_media'];
  const definitions={defaults:mediaColumns.map(name=>({name,value:expected.columns[name].default??null})).sort((a,b)=>a.name.localeCompare(b.name)),constraint:[{expression:expected.checkConstraints.lesson_media_library_metadata_ck.value,convalidated:true}],index:[{definition:'CREATE INDEX lesson_media_library_created_idx ON public.lesson_media USING btree (created_at DESC, id)',indisvalid:true,indisready:true}]};
  const client=value=>({query:async sql=>({rows:sql.includes('pg_attribute')?value.defaults:sql.includes('pg_constraint')?value.constraint:value.index})});
  await assertMediaDetails(client(definitions),snapshot);
  for(const change of [d=>d.defaults[0].value="'unsafe'",d=>d.constraint[0].expression='true',d=>d.constraint[0].convalidated=false,d=>d.index[0].definition=d.index[0].definition.replace('DESC','ASC')]){const bad=structuredClone(definitions);change(bad);await assert.rejects(assertMediaDetails(client(bad),snapshot));}
  assert.deepEqual(checkTree('(width IS NULL) OR ((width >= 1) AND (width <= 8192))'),checkTree('width IS NULL OR width BETWEEN 1 AND 8192'));
  assert.notDeepEqual(checkTree('(a OR b) AND c'),checkTree('a OR (b AND c)'));
});
test('stale backups, wrong isolated targets and mismatched archive evidence fail closed',()=>{
  const backup={createdAt:new Date(0).toISOString(),sequences:{'drizzle.__drizzle_migrations_id_seq':{last_value:'14',is_called:true}}};
  assertFreshBackup(backup,3600000);assert.throws(()=>assertFreshBackup(backup,7*3600000));assert.throws(()=>assertFreshBackup(backup,-1));
  const evidence={stage:'complete',classification:'READY FOR APPROVAL',restorationVerified:true,rehearsalVerified:true,originalRecordsPreserved:true,permissionsVerified:true,constraintsVerified:true,rollbackVerified:true,repeatExecutionNoOpVerified:true,hbaRestoredByteForByte:true,archivedRevisionAclRestored:true,applicationDatabaseConnections:0,applicationWrites:0,sourcePromoted:false,migrationExecutions:1,proposal:plan.proposal,backup:{sha256:'fixture'},target:{host:'127.0.0.1',port:55440,system:'7695735287099484548',version:180006,owner:'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170',database:'ccna_media_0015_'+'a'.repeat(24),directory:root.replaceAll('\\','/')+'/.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data'},isolatedLedgerEntriesDuringRehearsal:15};
  assertRehearsal(evidence,plan,'fixture');
  for(const mutate of [e=>e.target.port=5432,e=>e.target.system='7694701597474139084',e=>e.rollbackVerified=false,e=>e.backup.sha256='other',e=>e.proposal.sha256='other']){const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>assertRehearsal(bad,plan,'fixture'));}
});
test('existing RLS and media least-privilege checks still reject unauthorized changes',async()=>{
  await assert.rejects(assertStudyPolicies({query:async()=>({rows:[]})}));
  await assert.rejects(assertStudyPrivileges({query:async()=>({rows:[]})},'ccna_phase6a_app'));
});
test('both database verification paths reject wrong identity before reading records',async()=>{
  for(const verify of [verifyLockedBaseline,verifyActivated]){
    const calls=[];
    await assert.rejects(verify({query:async sql=>{calls.push(sql);return{rows:[{identity:{host:'127.0.0.1',port:55440,database:'unapproved'}}]};}},{role:'ccna_phase6a_migrator',systemIdentifier:'7694701597474139084'},root,plan));
    assert.equal(calls.length,1);assert(calls[0].startsWith('SELECT local_runtime_guard.identity()'));
  }
});
