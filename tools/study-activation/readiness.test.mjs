import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {readinessPlan,inspectReadiness} from './readiness.mjs';
import {assertStudyProposal,studyTables} from './proposal.mjs';
const root=process.cwd(),plan=readinessPlan(root);
test('proposal preserves all 19 existing tables and official 13-entry chain',()=>{
  const {snapshot,journal}=assertStudyProposal(root);
  assert.equal(Object.keys(snapshot.tables).length,22);
  assert.deepEqual(journal.entries.slice(0,13).map(e=>e.tag),plan.manifest.map(e=>e.tag));
  assert(!journal.entries.some(e=>e.tag==='0012_exam_simulator'));
  for(const name of studyTables) assert(snapshot.tables['public.'+name]);
  assert.equal(plan.applySupported,false);
});
test('offline plan needs no database credentials or connection',()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/DATABASE|CLERK|NEON|^PG|DOTENV|NODE_OPTIONS/i.test(key)));
  const result=spawnSync(process.execPath,['tools/study-activation/readiness.mjs','--plan'],{env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0);
  assert.equal(JSON.parse(result.stdout).manifest.length,13);
});
test('apply, restore and cleanup flags fail before credentials or connections',()=>{
  for(const flag of ['--apply','--restore','--cleanup']) {
    const result=spawnSync(process.execPath,['tools/study-activation/readiness.mjs',flag],{encoding:'utf8',timeout:15000});
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).stage,'offline-preflight');
  }
});
test('wrong identity rolls back before any application-table read',async()=>{
  const queries=[],client={query:async(q)=>{queries.push(q);return {rows:[{identity:{host:'wrong'}}]};}};
  await assert.rejects(inspectReadiness(client,{},plan,root));
  assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1),'ROLLBACK');
  assert(!queries.some(q=>q.includes('FROM public.')));
});
test('missing or changed ledger entries stop before catalog inspection',async()=>{
  const identity={...plan.target,sessionRole:plan.target.owner,versionNumber:180006,dataDirectory:'C:/Program Files/PostgreSQL/18/data',neon:null};
  for(const rows of [[],plan.manifest.map((m,i)=>({id:i+1,hash:i===12?'0'.repeat(64):m.hash,created_at:String(m.when)}))]) {
    const queries=[],client={query:async(q)=>{queries.push(q);return {rows:q.includes('identity()')?[{identity}]:rows};}};
    await assert.rejects(inspectReadiness(client,{role:plan.target.owner,systemIdentifier:plan.target.systemIdentifier},plan,root),/ledger/);
    assert.equal(queries.at(-1),'ROLLBACK');
    assert(!queries.some(q=>q.includes('FROM pg_roles')));
  }
});
test('backup uses post-0013 coverage and hidden stdin without apply support',()=>{
  const backup=readFileSync('tools/study-activation/backup.mjs','utf8'),wrapper=readFileSync('tools/study-activation/prepare-backup.ps1','utf8');
  assert.match(backup,/meta\/0013_snapshot.json/);
  assert.match(backup,/pg_export_snapshot/);
  assert.match(backup,/flag: "wx"/);
  assert.match(wrapper,/-AsSecureString/);
  assert.match(wrapper,/RedirectStandardInput = \$true/);
  assert.match(wrapper,/EnvironmentVariables.Clear\(\)/);
  assert.doesNotMatch(wrapper,/\[switch\]\$Apply|DATABASE_URL|\.env/);
});
