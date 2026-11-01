import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {assertDeletionProposal,assertDeletionFunction,deletionMigration} from './policy.mjs';
import {migrationManifest,runtimeTableInventory,assertLedger} from '../phase6a-local/policy.mjs';
import {upgradeSnapshots} from '../phase6a-local/upgrade.mjs';
import {proposedStudyManifest} from '../study-activation/proposed-runtime-guard.mjs';
const root=process.cwd(),base=migrationManifest(root),proposal=assertDeletionProposal(root);
test('15-entry startup stays pinned; only reviewed source-copy promotion enables 16 entries and the same 22 tables',()=>{
 assert.equal(base.length,15);mkdirSync('.local/lesson-delete-policy',{recursive:true});const copy=mkdtempSync(path.resolve('.local/lesson-delete-policy/source-'));cpSync('lib/db/drizzle',path.join(copy,'lib/db/drizzle'),{recursive:true});
 for(const name of ['tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json','lib/ccna-book-chapters.ts','lib/canonical-chapters.json']){mkdirSync(path.dirname(path.join(copy,name)),{recursive:true});cpSync(name,path.join(copy,name));}
 const dir=path.join(copy,'lib/db/drizzle');cpSync(path.join(dir,'proposed/0016_safe_lesson_deletion.sql'),path.join(dir,'0016_safe_lesson_deletion.sql'));cpSync(path.join(dir,'proposed/meta/0016_snapshot.json'),path.join(dir,'meta/0016_snapshot.json'));cpSync(path.join(dir,'proposed/meta/0016_journal.json'),path.join(dir,'meta/_journal.json'));
 const promoted=migrationManifest(copy);assert.deepEqual(promoted.slice(0,15),base);assert.equal(promoted[15].hash,deletionMigration[2]);assert.equal(runtimeTableInventory(promoted).length,22);assert.deepEqual(upgradeSnapshots(copy)[1],proposal.snapshot);assert.deepEqual(proposedStudyManifest(copy),promoted);
 const rows=promoted.map((m,i)=>({id:i+1,hash:m.hash,created_at:String(m.when)}));assertLedger(rows,promoted);assert.throws(()=>assertLedger(rows.slice(0,15),promoted));assert.throws(()=>runtimeTableInventory([...promoted,{tag:'unreviewed'}]));
 const sql=readFileSync(path.join(dir,'0016_safe_lesson_deletion.sql'));writeFileSync(path.join(dir,'0016_safe_lesson_deletion.sql'),Buffer.concat([sql,Buffer.from('\n-- drift')]));assert.throws(()=>migrationManifest(copy));assert.equal(migrationManifest(root).length,15);
});
test('runtime verifies exact definer body, search path, owner, exclusive ACL and overload count',async()=>{
 const prosrc=readFileSync('lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql','utf8').match(/AS \$\$([\s\S]*?)\$\$/)[1];
 const good={f:{prosrc,owner:'ccna_phase6a_migrator',prosecdef:true,proconfig:['search_path=pg_catalog'],language:'plpgsql',returns:'jsonb'},acl:[{role:'ccna_phase6a_app',privilege:'EXECUTE',grantable:false},{role:'ccna_phase6a_migrator',privilege:'EXECUTE',grantable:false}],n:1};
 const client=fixture=>({query:async sql=>({rows:sql.includes('p.prosrc')?[fixture.f]:sql.includes('aclexplode')?fixture.acl:[{n:fixture.n}]})});
 await assertDeletionFunction(client(good),root);
 for(const mutate of [v=>v.f.prosrc+=' unsafe',v=>v.f.owner='other',v=>v.f.prosecdef=false,v=>v.f.proconfig=['search_path=public'],v=>v.acl.push({role:'PUBLIC',privilege:'EXECUTE',grantable:false}),v=>v.acl[0].grantable=true,v=>v.n=2]){const bad=structuredClone(good);mutate(bad);await assert.rejects(assertDeletionFunction(client(bad),root));}
});
