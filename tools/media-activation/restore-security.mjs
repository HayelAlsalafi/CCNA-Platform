import assert from 'node:assert/strict';
import {assertPrivateIdentity} from '../study-activation/isolated-policy.mjs';
export const revisionRevoke='REVOKE ALL ON FUNCTION public.reject_lesson_revision_mutation() FROM PUBLIC;';
export function archivedRevisionAcl(ddl) {
  const statements=ddl.split(/\r?\n/).filter(line=>/^(REVOKE|GRANT) .*FUNCTION public\.reject_lesson_revision_mutation\(\)/.test(line));
  assert.deepEqual(statements,[revisionRevoke],'Unexpected archived revision-function ACL; stop');
  return revisionRevoke;
}
export async function restoreRevisionAcl(client,database,data,ddl) {
  assert.match(database,/^ccna_media_0015_[a-f0-9]{24}$/);
  const statement=archivedRevisionAcl(ddl);
  await assertPrivateIdentity(client,database,data);
  // --no-privileges deliberately omits shared-role grants. Recover this exact
  // archived restriction on the new disposable function, not arbitrary ACL SQL.
  await client.query(statement);
}
