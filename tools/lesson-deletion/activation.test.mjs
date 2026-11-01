// Essential offline checks for NEW activation tooling; completed UI/deletion
// fixture suites are intentionally not repeated here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,readdirSync,cpSync} from 'node:fs';
import path from 'node:path';
import {sourcePlan,offlinePlan,stageDeletion,promoteDeletion,assertFreshBackup,assertRehearsal,verifyLockedBaseline,verifyActivated} from './activation.mjs';
import {executionIntent} from './apply.mjs';
import {assertBackupReceipt} from './verify-backup.mjs';
import {aclSelection,aclSql,prepareFixtureRoles} from './restore-roles.mjs';
import {migrationManifest} from '../phase6a-local/policy.mjs';
const root=process.cwd(),plan=sourcePlan(root);mkdirSync('.local/lesson-delete-activation-tests',{recursive:true});
const dir=mkdtempSync(path.resolve('.local/lesson-delete-activation-tests/source-'));
test('source Plan remains offline and staged Drizzle folder has ONLY 0016',()=>{
 assert.equal(migrationManifest(root).length,15);assert.equal(offlinePlan(root).databaseConnections,0);assert.equal(offlinePlan(root).state,'AWAITING_APPROVAL');
 const folder=path.join(dir,'staged');stageDeletion(root,folder,plan);assert.deepEqual(readdirSync(folder).sort(),['0016_safe_lesson_deletion.sql','meta']);
 const journal=JSON.parse(readFileSync(path.join(folder,'meta/_journal.json')));assert.equal(journal.entries.length,1);assert.equal(journal.entries[0].tag,'0016_safe_lesson_deletion');
 assert.deepEqual(executionIntent(['--apply','--confirm-reviewed-lesson-deletion','--backup','b','--rehearsal','r']),{backup:'b',rehearsal:'r'});
 for(const args of [[],['--apply'],['--apply','--confirm-reviewed-media','--backup','b','--rehearsal','r'],['--apply','--confirm-reviewed-lesson-deletion','--backup','b','--rehearsal','r','--bypass']])assert.throws(()=>executionIntent(args));
});
test('post-promotion Plan describes source without calling pre-activation readiness or enabling Apply',()=>{
 const copy=path.join(dir,'promoted');cpSync('lib/db/drizzle',path.join(copy,'lib/db/drizzle'),{recursive:true});
 for(const name of ['tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json','lib/ccna-book-chapters.ts','lib/canonical-chapters.json']){mkdirSync(path.dirname(path.join(copy,name)),{recursive:true});cpSync(name,path.join(copy,name));}
 promoteDeletion(copy,plan);assert.deepEqual(offlinePlan(copy),{state:'SOURCE_PROMOTED',sourceEntries:16,pending:[],databaseVerified:false,databaseConnections:0,applyAllowed:false});assert.throws(()=>sourcePlan(copy));assert.equal(migrationManifest(root).length,15);
});
test('freshness and matching restored-archive evidence cannot be skipped',()=>{
 const backup={createdAt:new Date(0).toISOString(),sequences:{'drizzle.__drizzle_migrations_id_seq':{last_value:'15',is_called:true}}};assertFreshBackup(backup,3600000);assert.throws(()=>assertFreshBackup(backup,7*3600000));assert.throws(()=>assertFreshBackup(backup,-1));
 const e={stage:'complete',classification:'READY FOR APPROVAL',restorationVerified:true,rehearsalVerified:true,originalRecordsPreserved:true,permissionsVerified:true,constraintsVerified:true,rollbackVerified:true,repeatExecutionNoOpVerified:true,hbaRestoredByteForByte:true,archivedRevisionAclRestored:true,applicationDatabaseConnections:0,applicationWrites:0,sourcePromoted:false,migrationExecutions:1,exactSqlRehearsed:true,leastPrivilegeOwnerVerified:true,archivedAclRestored:true,fixtureRoleChangesRolledBack:true,proposal:plan.proposal,backup:{sha256:'fixture'},target:{host:'127.0.0.1',port:55440,system:'7695735287099484548',version:180006,owner:'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170',database:'ccna_lesson_delete_restore_'+'a'.repeat(24),directory:root.replaceAll('\\','/')+'/.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data'},isolatedLedgerEntriesDuringRehearsal:16};assertRehearsal(e,plan,'fixture');
 for(const mutate of [v=>v.target.port=5432,v=>v.backup.sha256='other',v=>v.fixtureRoleChangesRolledBack=false,v=>v.leastPrivilegeOwnerVerified=false,v=>v.exactSqlRehearsed=false,v=>v.rollbackVerified=false]){const bad=structuredClone(e);mutate(bad);assert.throws(()=>assertRehearsal(bad,plan,'fixture'));}
 assert.throws(()=>assertBackupReceipt({stage:'backup-complete',databaseWrites:1},plan,Object.keys(plan.baseline.tables)));
});
test('wrong main identity stops both verification paths before any record read',async()=>{
 for(const verify of [verifyLockedBaseline,verifyActivated]){const queries=[];await assert.rejects(verify({query:async sql=>{queries.push(sql);return{rows:[{identity:{database:'wrong',port:55440}}]};}},{role:'ccna_phase6a_migrator',systemIdentifier:'7694701597474139084'},root,plan));assert.equal(queries.length,1);}
});
test('private role fixture rejects main targets/existing roles; ACL replay excludes global database entries',async()=>{
 let calls=0;const client={query:async()=>{calls++;return{rows:[{database:'wrong',port:5432,system:'7694701597474139084'}]};}};
 await assert.rejects(prepareFixtureRoles(client,'ccna_phase6a_dev'));assert.equal(calls,0);await assert.rejects(prepareFixtureRoles(client,'ccna_lesson_delete_restore_'+'a'.repeat(24)));assert.equal(calls,1);
 const toc='1; 0 0 ACL public TABLE lessons owner\n2; 0 0 ACL - DATABASE ccna_phase6a_dev owner\n3; 0 0 ACL - SCHEMA public owner\n4; 0 0 TABLE DATA public lessons owner\n';
 const selected=aclSelection(toc);assert(selected.includes('ACL public TABLE'));assert(selected.includes('ACL - SCHEMA public'));assert(!selected.includes('DATABASE'));assert(!selected.includes('TABLE DATA'));
 assert(aclSql('\\restrict opaque\nSET statement_timeout = 0;\nGRANT SELECT, UPDATE ON TABLE public.lessons TO ccna_phase6a_app;\n\\unrestrict opaque').includes('GRANT SELECT'));
 assert.throws(()=>aclSql('DELETE FROM public.lessons;'));assert.throws(()=>aclSql('ALTER DATABASE ccna_phase6a_dev OWNER TO other;'));
 const exists={query:async sql=>({rows:sql.includes('current_database')?[{database:'ccna_lesson_delete_restore_'+'a'.repeat(24),port:55440,system:'7695735287099484548'}]:[{n:1}]})};await assert.rejects(prepareFixtureRoles(exists,'ccna_lesson_delete_restore_'+'a'.repeat(24)));
});
