// Offline proposal verification only. Never promotes or connects to a database.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const studyTables = Object.freeze(['lesson_annotations','lesson_progress','lesson_media']);
export const studyMigration = Object.freeze(['0014_interactive_study',1793145600000,'c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893']);
export function assertStudyProposal(root) {
  for (const [name,hash] of [
    ['0014_interactive_study.sql',studyMigration[2]],
    ['meta/0014_snapshot.json','d325996ec079334f4593cc7cafdbacfaada720404db14f16e988ebf54645ed4a'],
    ['meta/0014_journal.json','e8132f0677ae5d0069d298c3a2b49c4ce9399b6203dd3600612411f6ae5feb6e'],
  ]) assert.equal(createHash('sha256').update(readFileSync(path.join(root,'lib/db/drizzle/proposed',name))).digest('hex'),hash,'Study proposal source drift: '+name);
  const read = name => JSON.parse(readFileSync(path.join(root,'lib/db/drizzle',name),'utf8'));
  const base=read('meta/0013_snapshot.json'), next=read('proposed/meta/0014_snapshot.json');
  const previous=structuredClone(next);
  for (const name of studyTables) { assert(previous.tables['public.'+name]); delete previous.tables['public.'+name]; }
  assert.equal(next.prevId,base.id);
  assert.deepEqual({...previous,id:base.id,prevId:base.prevId},base,'Existing schema metadata changed');
  const journal=read('proposed/meta/0014_journal.json'), official=read('meta/_journal.json');
  assert([13,14,15,16,17].includes(official.entries.length));
  assert.equal(official.entries[12].tag,'0013_learning_lessons');
  assert.equal(journal.entries.length,14);
  assert.deepEqual(journal.entries.slice(0,Math.min(official.entries.length,14)),official.entries.slice(0,14),'Unrelated migration in study proposal');
  if(official.entries.length>=14) {
    assert.deepEqual({...official,entries:official.entries.slice(0,14)},journal,'Promoted study journal differs from reviewed proposal');
    assert(readFileSync(path.join(root,'lib/db/drizzle/meta/0014_snapshot.json')).equals(readFileSync(path.join(root,'lib/db/drizzle/proposed/meta/0014_snapshot.json'))),'Promoted study snapshot differs from reviewed proposal');
  }
  assert.deepEqual(journal.entries[13],{idx:13,version:'7',when:studyMigration[1],tag:studyMigration[0],breakpoints:true});
  for (const name of studyTables.slice(0,2)) {
    const table=next.tables['public.'+name];
    assert.equal(table.isRLSEnabled,true);
    assert.deepEqual(Object.keys(table.policies),[name+'_owner']);
  }
  return {snapshot:next,journal};
}
