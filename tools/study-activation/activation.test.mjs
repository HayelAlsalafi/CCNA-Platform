// Database-free executor tests: official Drizzle runs against a recording client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, cpSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { executionIntent, stageStudy, promoteStudy, verifyLockedBaseline, studyGrants } from './activation.mjs';
import { proposedStudyManifest } from './proposed-runtime-guard.mjs';
import { assertStudyProposal, studyMigration } from './proposal.mjs';
import { transactionClient } from '../lesson-activation/transaction-client.mjs';
const root=process.cwd(),plan={manifest:proposedStudyManifest(root),...assertStudyProposal(root)};
mkdirSync('.local/study-executor-tests',{recursive:true});
const folder=mkdtempSync(path.join(root,'.local/study-executor-tests/run-'));
const require=createRequire(path.join(root,'lib/db/package.json'));
const {drizzle}=require('drizzle-orm/node-postgres'),{migrate}=require('drizzle-orm/node-postgres/migrator');
test('execution requires both exact flags and rejects implicit/repeated/unrelated modes',()=>{
  executionIntent(['--apply','--confirm-reviewed-study']);
  for(const flags of [[],['--apply'],['--confirm-reviewed-study'],['--apply','--confirm-reviewed-study','--force'],['--cleanup'],['--apply','--apply']])assert.throws(()=>executionIntent(flags));
});
test('staging contains exactly the pinned fourteen SQL files and refuses reuse or drift',()=>{
  const dir=path.join(folder,'stage');stageStudy(root,dir,plan);
  assert.deepEqual(readdirSync(dir).filter(n=>n.endsWith('.sql')).sort(),plan.manifest.map(m=>m.tag+'.sql').sort());
  assert(!readdirSync(dir).some(n=>n.startsWith('0012')));
  assert.throws(()=>stageStudy(root,dir,plan));
  const changed=structuredClone(plan);changed.manifest[13].hash='0'.repeat(64);
  assert.throws(()=>stageStudy(root,path.join(folder,'drift'),changed),/checksum/);
});
function recordingClient(fail=false) {
  const calls=[];
  return {calls,query:async(query,params)=>{
    const text=typeof query==='string'?query:query.text;calls.push({text,params});
    if(fail&&text.includes('CREATE TABLE public.lesson_progress')){const e=Error('synthetic migration failure');e.code='22012';throw e;}
    if(/select id, hash, created_at/i.test(text))return{rows:[{id:13,hash:plan.manifest[12].hash,created_at:plan.manifest[12].when}]};
    return{rows:[]};
  }};
}
test('actual Drizzle stages only 0014 on the thirteen-entry baseline and cannot commit the outer transaction',async()=>{
  const client=recordingClient();
  await migrate(drizzle(transactionClient(client)),{migrationsFolder:path.join(folder,'stage')});
  const sql=client.calls.map(c=>c.text);
  assert(sql.some(q=>q==='SAVEPOINT ccna_lesson_transaction'));
  assert(sql.some(q=>q==='RELEASE SAVEPOINT ccna_lesson_transaction'));
  assert(!sql.some(q=>/^(begin|commit)$/i.test(q)));
  assert.equal(sql.filter(q=>q.includes('CREATE TABLE public.lesson_')).length,3);
  assert(!sql.some(q=>q.includes('CREATE TABLE public.questions')||q.includes('exam_session')));
  const inserts=client.calls.filter(c=>/insert into .*__drizzle_migrations/i.test(c.text));
  assert.equal(inserts.length,1);
  assert.deepEqual(inserts[0].params,[studyMigration[2],studyMigration[1]]);
});
test('official Drizzle SQL failure rolls back its savepoint and emits no outer commit',async()=>{
  const client=recordingClient(true);
  await assert.rejects(migrate(drizzle(transactionClient(client)),{migrationsFolder:path.join(folder,'stage')}));
  assert(client.calls.some(c=>c.text==='ROLLBACK TO SAVEPOINT ccna_lesson_transaction'));
  assert(!client.calls.some(c=>/^commit$/i.test(c.text)));
});
test('wrong live identity fails before inspecting or locking application records',async()=>{
  const calls=[],client={query:async sql=>{calls.push(sql);return{rows:[{identity:{host:'wrong'}}]};}};
  await assert.rejects(verifyLockedBaseline(client,{},root,{}));
  assert.equal(calls.length,1);
});
test('promotion preserves prior files, copies only 0014 and refuses overwriting destinations',()=>{
  const copy=path.join(folder,'source');cpSync(path.join(root,'lib/db/drizzle'),path.join(copy,'lib/db/drizzle'),{recursive:true});
  const db=path.join(copy,'lib/db/drizzle'),original=readFileSync(path.join(db,'meta/_journal.json'));
  const previous=readFileSync(path.join(db,'0013_learning_lessons.sql'));
  promoteStudy(copy,{officialJournal:original});
  assert.deepEqual(readFileSync(path.join(db,'0013_learning_lessons.sql')),previous);
  assert.deepEqual(readFileSync(path.join(db,'meta/_journal.json')),readFileSync(path.join(db,'proposed/meta/0014_journal.json')));
  assert.equal(JSON.parse(readFileSync(path.join(db,'meta/_journal.json'))).entries.length,14);
  assert.throws(()=>promoteStudy(copy,{officialJournal:original}));
});
test('reviewed grants contain only the three exact table profiles, never schema/role broadening',()=>{
  assert.equal(studyGrants,'GRANT SELECT,INSERT,UPDATE,DELETE ON public.lesson_annotations TO ccna_phase6a_app; GRANT SELECT,INSERT,UPDATE ON public.lesson_progress TO ccna_phase6a_app; GRANT SELECT,INSERT ON public.lesson_media TO ccna_phase6a_app');
  const source=readFileSync('tools/study-activation/apply.mjs','utf8');
  assert(source.indexOf('await verifyLockedBaseline(')<source.indexOf('await migrate('));
  assert(source.indexOf('await verifyActivated(')<source.indexOf("await client.query('COMMIT')"));
  assert(!/TRUNCATE|DROP DATABASE|DISABLE TRIGGER/.test(source));
  const wrapper=readFileSync('tools/study-activation/apply-study.ps1','utf8');
  assert.match(wrapper,/-AsSecureString/);assert.match(wrapper,/RedirectStandardInput = \$true/);assert.match(wrapper,/EnvironmentVariables.Clear\(\)/);
});
