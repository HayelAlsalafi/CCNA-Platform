// Catalog verification only; import never opens a connection.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LocalRuntimeError, policy } from '../phase6a-local/policy.mjs';
const names=['reject_revision_history_change','delete_question_with_history'];
export function assertControlledDeleteMetadata(){
  const old=JSON.parse(readFileSync(new URL('../../lib/db/drizzle/meta/0005_snapshot.json',import.meta.url),'utf8'));
  const bytes=readFileSync(new URL('../../lib/db/drizzle/meta/0006_snapshot.json',import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!=='28ede5d7deb0156695f6779828235515fa24da0b45a00e64084fab4526ba58ef')throw new LocalRuntimeError('Controlled deletion snapshot changed.');
  const next=JSON.parse(bytes),{id:oldId,prevId:oldPrev,...oldSchema}=old,{id:nextId,prevId:nextPrev,...nextSchema}=next;
  if(nextPrev!==oldId||nextId===oldId||JSON.stringify(oldSchema)!==JSON.stringify(nextSchema))throw new LocalRuntimeError('Functions-only migration unexpectedly changes table schema.');
}
export async function assertControlledDeleteState(client,requireRuntimeGrant=true) {
  assertControlledDeleteMetadata();
  const source=readFileSync(new URL('../../lib/db/drizzle/0006_controlled_history_delete.sql',import.meta.url),'utf8');
  if(createHash('sha256').update(source).digest('hex')!=='2b77bb268d42f33d2fe24d0fb909939e8253a17e751c5b56beebb6332dfaf298')throw new LocalRuntimeError('Controlled deletion migration source changed.');
  const bodies=[...source.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)].map(m=>m[1]);
  const rows=(await client.query(`SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,
    pg_get_userbyid(p.proowner) AS owner,p.proargtypes::text AS arguments,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
    has_function_privilege($2,p.oid,'EXECUTE') AS runtime_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[]) ORDER BY p.proname`,[names,policy.appRole])).rows;
  if(rows.length!==2)throw new LocalRuntimeError('Controlled deletion functions missing or overloaded.');
  for(const row of rows){const i=names.indexOf(row.name);
    if(row.owner!==policy.migrationRole||!row.definer||row.body!==bodies[i]||JSON.stringify(row.config)!=='["search_path=pg_catalog"]'||row.public_execute!==false||row.arguments!==(i===0?'':'2950 2950')||row.runtime_execute!==(i===1&&requireRuntimeGrant))
      throw new LocalRuntimeError('Controlled deletion function identity/ACL invariant failed: '+names[i]+'.');
  }
}
