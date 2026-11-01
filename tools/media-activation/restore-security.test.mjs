import test from 'node:test';
import assert from 'node:assert/strict';
import {archivedRevisionAcl,restoreRevisionAcl,revisionRevoke} from './restore-security.mjs';
test('only the exact archived function restriction is accepted',()=>{
  assert.equal(archivedRevisionAcl(`-- fixture\n${revisionRevoke}\n`),revisionRevoke);
  for(const ddl of ['',revisionRevoke.replace('PUBLIC','some_role'),revisionRevoke+'\nGRANT EXECUTE ON FUNCTION public.reject_lesson_revision_mutation() TO PUBLIC;'])assert.throws(()=>archivedRevisionAcl(ddl));
});
test('main or unverified database cannot receive fixture ACL restoration',async()=>{
  let writes=0;
  const client={query:async()=>{writes++;throw Error('Identity unavailable');}};
  await assert.rejects(restoreRevisionAcl(client,'ccna_phase6a_dev','unused',revisionRevoke));assert.equal(writes,0);
  await assert.rejects(restoreRevisionAcl(client,'ccna_media_0015_'+'a'.repeat(24),'unused',revisionRevoke));assert.equal(writes,1);
});
