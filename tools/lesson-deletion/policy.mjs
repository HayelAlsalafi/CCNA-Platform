// Proposal and runtime checks only. Never promotes or connects on import.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const deletionMigration=Object.freeze(['0016_safe_lesson_deletion',1793145600002,'7a64aaaf5fc40e117a7aad2f11682d3fa8426673f17277c77009d19606dd0116']);
export function assertDeletionProposal(root){
 const dir=path.join(root,'lib/db/drizzle'),read=n=>readFileSync(path.join(dir,n));
 for(const [n,hash] of [['proposed/0016_safe_lesson_deletion.sql',deletionMigration[2]],['proposed/meta/0016_snapshot.json','e1adea7776037905d9b5b2528f3ac596fb368688fc062e918a66bee13514629a'],['proposed/meta/0016_journal.json','05bea46c44e9671d60939019602d6218e050052a15089e4dcc3a1e8b910274eb']])assert.equal(createHash('sha256').update(read(n)).digest('hex'),hash,'Lesson deletion source drift');
 const snapshot=JSON.parse(read('proposed/meta/0016_snapshot.json')),base=JSON.parse(read('meta/0015_snapshot.json')),journal=JSON.parse(read('proposed/meta/0016_journal.json')),official=JSON.parse(read('meta/_journal.json'));
 assert.equal(snapshot.prevId,base.id);assert.deepEqual({...snapshot,id:base.id,prevId:base.prevId},base,'Deletion must not change existing schema objects');
 assert([15,16].includes(official.entries.length));assert.deepEqual(journal.entries.slice(0,15),official.entries.slice(0,15));assert.equal(journal.entries.length,16);
 assert.deepEqual(journal.entries[15],{idx:15,version:'7',when:deletionMigration[1],tag:deletionMigration[0],breakpoints:true});
 if(official.entries.length===16){assert.deepEqual(official,journal);assert(read('0016_safe_lesson_deletion.sql').equals(read('proposed/0016_safe_lesson_deletion.sql')));assert(read('meta/0016_snapshot.json').equals(read('proposed/meta/0016_snapshot.json')));}
 return {snapshot,journal};
}
export async function assertDeletionFunction(client,root,owner='ccna_phase6a_migrator',appRole='ccna_phase6a_app'){
 assertDeletionProposal(root);
 const rows=(await client.query("SELECT p.prosrc,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,l.lanname AS language,p.prorettype::regtype::text AS returns FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname='delete_never_published_lesson' AND p.oid=to_regprocedure('public.delete_never_published_lesson(uuid,uuid,integer,text)')")).rows;
 assert.equal(rows.length,1);const f=rows[0],body=readFileSync(path.join(root,'lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$/)[1];
 assert.equal(f.prosrc.trim(),body.trim());assert.equal(f.owner,owner);assert.equal(f.prosecdef,true);assert.deepEqual(f.proconfig,['search_path=pg_catalog']);assert.equal(f.language,'plpgsql');assert.equal(f.returns,'jsonb');
 const acl=(await client.query("SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS role,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.delete_never_published_lesson(uuid,uuid,integer,text)'::regprocedure ORDER BY role")).rows;
 assert.deepEqual(acl,[{role:appRole,privilege:'EXECUTE',grantable:false},{role:owner,privilege:'EXECUTE',grantable:false}].sort((a,b)=>a.role.localeCompare(b.role)),'Unexpected deletion-function privileges');
 assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_never_published_lesson'")).rows[0].n,1,'Unexpected deletion-function overload');
}
