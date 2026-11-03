// Inert source pins: no registration, promotion or database connection.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const mediaMigration=Object.freeze(['0015_lesson_media_library',1793145600001,'f42de505df26dc5a00a49e740ba59ccc1c0e6d053f1f6f77a84b8bf92090a63b']);
export const baselineChainHash='bd845403f82ffaed696958f44687fb9b453ec6c68903db8c9922a44b7568ea50';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const mediaColumns=Object.freeze(['original_name','caption','width','height','thumbnail_key','thumbnail_sha256','original_key','edit']);
export function assertMediaProposal(root) {
  const dir=path.join(root,'lib/db/drizzle'),read=name=>readFileSync(path.join(dir,name));
  for(const [name,hash] of [
    ['proposed/0015_lesson_media_library.sql',mediaMigration[2]],
    ['proposed/meta/0015_snapshot.json','485a3cf8998faaad5defcf82f01166175fac0b5e26238791db369e0b828e1b24'],
    ['proposed/meta/0015_journal.json','de08a3729f3687d870a1e90b24dadc286c54ca3f35024dc237923b02061e121b'],
    ['meta/0014_snapshot.json','d325996ec079334f4593cc7cafdbacfaada720404db14f16e988ebf54645ed4a']
  ])assert.equal(digest(read(name)),hash,'Media source drift: '+name);
  const base=JSON.parse(read('meta/0014_snapshot.json')),snapshot=JSON.parse(read('proposed/meta/0015_snapshot.json'));
  const previous=structuredClone(snapshot),table=previous.tables['public.lesson_media'];
  for(const name of mediaColumns)delete table.columns[name];
  delete table.checkConstraints.lesson_media_library_metadata_ck;delete table.indexes.lesson_media_library_created_idx;
  assert.equal(snapshot.prevId,base.id);assert.deepEqual({...previous,id:base.id,prevId:base.prevId},base,'Unrelated schema change');
  const journal=JSON.parse(read('proposed/meta/0015_journal.json')),official=JSON.parse(read('meta/_journal.json'));
  assert([14,15,16,17].includes(official.entries.length));assert.deepEqual(journal.entries.slice(0,14),official.entries.slice(0,14));
  assert.deepEqual(journal.entries[14],{idx:14,version:'7',when:mediaMigration[1],tag:mediaMigration[0],breakpoints:true});
  if(official.entries.length>=15){assert.deepEqual({...official,entries:official.entries.slice(0,15)},journal);assert(read('0015_lesson_media_library.sql').equals(read('proposed/0015_lesson_media_library.sql')));assert(read('meta/0015_snapshot.json').equals(read('proposed/meta/0015_snapshot.json')));}
  return {snapshot,journal,baseline:base};
}
