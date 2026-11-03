import {requiredSafetyCases} from './safety-assertions.mjs';
// Offline filesystem/query fixtures only. No PostgreSQL or service startup.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {examSourceFixture,installedServiceRequire} from '../test-support/exam-source-fixture.mjs';
import {assertExamProposal,exam17Migration} from './proposal.mjs';
import {executionIntent} from './apply.mjs';

import {upgradeSnapshots,assertSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertExamDetails,examExpression} from './runtime-details.mjs';
import {assertExamPrivileges} from '../exam-policy.mjs';
import {withReadOnlyUtc} from '../study-activation/read-only-utc.mjs';
import {loadExamServices} from './service-fixture.mjs';
const repository=process.cwd();
const {root,work,plan,activation,policy}=await examSourceFixture(repository);
const {sourcePlan,offlinePlan,stageExam,promoteExam,assertFreshBackup,assertRehearsal,toolingHash}=activation;
const {migrationManifest,runtimeTableInventory}=policy;
after(()=>{assert.equal(JSON.parse(readFileSync(path.join(repository,'lib/db/drizzle/meta/_journal.json'))).entries.length,17);assertExamProposal(repository);});
function copy() {
 const dest=mkdtempSync(path.join(work,'source-'));
 cpSync(path.join(root,'lib/db/drizzle'),path.join(dest,'lib/db/drizzle'),{recursive:true});
 cpSync(path.join(root,'tools/exam-activation'),path.join(dest,'tools/exam-activation'),{recursive:true});
 for(const name of ['tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json','lib/ccna-book-chapters.ts','lib/canonical-chapters.json']){mkdirSync(path.dirname(path.join(dest,name)),{recursive:true});cpSync(path.join(root,name),path.join(dest,name));}
 return dest;
}
test('exact 16 baseline remains accepted, Plan is offline and only 0017 is staged',()=>{
 assert.equal(migrationManifest(root).length,16);assert.equal(runtimeTableInventory(migrationManifest(root)).length,22);
 assert.equal(offlinePlan(root).databaseConnections,0);assert.equal(offlinePlan(root).applyAllowed,false);
 const stage=path.join(work,'stage');stageExam(root,stage,plan);
 assert.deepEqual(readdirSync(stage).sort(),['0017_exam_simulator.sql','meta']);
 const j=JSON.parse(readFileSync(path.join(stage,'meta/_journal.json')));assert.equal(j.entries.length,1);assert.equal(j.entries[0].idx,16);assert.equal(j.entries[0].tag,exam17Migration[0]);
});
test('promotion copies exact forward metadata; valid 17 accepted and partial/unknown chains rejected',()=>{
 const dest=copy();promoteExam(dest,plan);const manifest=migrationManifest(dest);
 assert.equal(manifest.length,17);assert.equal(runtimeTableInventory(manifest).length,24);
 assert.equal(Object.keys(upgradeSnapshots(dest)[1].tables).length,24);
 assert.equal(offlinePlan(dest).state,'SOURCE_PROMOTED');assert.equal(offlinePlan(dest).applyAllowed,false);
 const bad=structuredClone(manifest);bad[16].hash='0'.repeat(64);assert.throws(()=>runtimeTableInventory(bad));
 assert.throws(()=>runtimeTableInventory([...manifest,manifest[16]]));
 const file=path.join(dest,'lib/db/drizzle/0017_exam_simulator.sql');writeFileSync(file,readFileSync(file)+'\n-- drift');assert.throws(()=>assertExamProposal(dest));
 assert.equal(migrationManifest(root).length,16);
});
test('proposal preserves all original definitions, historical deletion helper, ACL boundaries',()=>{
 const source=assertExamProposal(root);assert.equal(source.snapshot.prevId,source.baseline.id);
 const sql=readFileSync(path.join(root,plan.proposal.file),'utf8'),old=readFileSync(path.join(root,'lib/db/drizzle/proposed/0012_exam_simulator.sql'),'utf8');
 const bodies=s=>[...s.matchAll(/AS \$\$([\s\S]*?)\$\$/g)].map(m=>m[1]);assert.deepEqual(bodies(sql),bodies(old));
 assert(sql.includes('RENAME TO execute_question_deletion_pre_exam'));
 assert(sql.includes('GRANT UPDATE(selected_keys,flagged,answer_version,graded_result)'));
 assert(!/GRANT\s+(?:ALL|DELETE)|DROP TABLE|TRUNCATE|DISABLE TRIGGER/i.test(sql));
 const dest=copy(),snapshotFile=path.join(dest,'lib/db/drizzle/proposed/meta/0017_snapshot.json');
 const broken=structuredClone(source.snapshot);delete broken.tables['public.exam_session_items'].columns.answer_version;writeFileSync(snapshotFile,JSON.stringify(broken));assert.throws(()=>assertExamProposal(dest));
});
test('explicit intent, six-hour freshness, same-archive private rehearsal and all proof flags required',()=>{
 assert.deepEqual(executionIntent(['--apply','--confirm-reviewed-exam','--backup','b','--rehearsal','r']),{backup:'b',rehearsal:'r'});
 for(const args of [[],['--apply'],['--apply','--confirm-reviewed-lesson-deletion','--backup','b','--rehearsal','r']])assert.throws(()=>executionIntent(args));
 const b={createdAt:new Date(0).toISOString(),sequences:{'drizzle.__drizzle_migrations_id_seq':{last_value:'16',is_called:true}}};assertFreshBackup(b,3600000);assert.throws(()=>assertFreshBackup(b,7*3600000));assert.throws(()=>assertFreshBackup(b,-1));
 const e={stage:'complete',classification:'READY FOR APPROVAL',toolingHash:plan.toolingHash,proposal:plan.proposal,backup:{sha256:'fixture'},target:{host:'127.0.0.1',port:55440,system:'7695735287099484548',version:180006,owner:'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170',database:'ccna_exam_0017_restore_'+'a'.repeat(24),directory:root.replaceAll('\\','/')+'/.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data'},applicationDatabaseConnections:0,applicationWrites:0,sourcePromoted:false,migrationExecutions:1,isolatedLedgerEntriesDuringRehearsal:17};
 for(const flag of ['restorationVerified','rehearsalVerified','originalRecordsPreserved','permissionsVerified','constraintsVerified','rollbackVerified','repeatExecutionNoOpVerified','hbaRestoredByteForByte','archivedRevisionAclRestored','examFixtureVerified','answerPrivacyOwnershipVerified','exactSqlRehearsed','leastPrivilegeOwnerVerified','archivedAclRestored','fixtureRoleChangesRolledBack'])e[flag]=true;
 e.safetyAssertions=Object.fromEntries(requiredSafetyCases.map(name=>[name,'PASS']));
 assertRehearsal(e,plan,'fixture');
 for(const change of [x=>delete x.safetyAssertions,x=>x.safetyAssertions.expiredDeadline='SKIPPED',x=>x.target.port=5432,x=>x.backup.sha256='other',x=>x.toolingHash='other',x=>x.rollbackVerified=false,x=>x.answerPrivacyOwnershipVerified=false,x=>x.fixtureRoleChangesRolledBack=false]){const bad=structuredClone(e);change(bad);assert.throws(()=>assertRehearsal(bad,plan,'fixture'));}
 assert.equal(toolingHash(root),plan.toolingHash);
});
test('constraint boolean grouping is preserved; drift and missing privileged objects rejected',async()=>{
 assert.deepEqual(examExpression('"exam_sessions"."question_count" BETWEEN 1 AND 100'),examExpression('((question_count >= 1) AND (question_count <= 100))'));
 assert.deepEqual(examExpression("status IN ('SUBMITTED','EXPIRED')"),examExpression("(status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'EXPIRED'::character varying])::text[])"));
 assert.notDeepEqual(examExpression('(a OR b) AND c'),examExpression('a OR (b AND c)'));
 await assert.rejects(()=>assertExamDetails({query:async()=>({rows:[]})},plan.snapshot));
 await assert.rejects(()=>assertExamPrivileges({query:async()=>({rows:[]})}));
 const bad={tables:[{name:'unexpected',kind:'r',owner:'other'}],columns:[],constraints:[],indexes:[],enums:[],sequences:[]};assert.throws(()=>assertSchemaCatalog(bad,plan.snapshot));
});
test('postcommit verifier always uses transaction-local UTC and rolls back on mismatch',async()=>{
 const calls=[],client={query:async s=>{calls.push(s);return {rows:s.includes("set_config")?[{timezone:"UTC",read_only:"on"}]:[]};}};
 await assert.rejects(()=>withReadOnlyUtc(client,async()=>{throw Error('mismatch');}));
 assert(calls.some(s=>s.includes('READ ONLY')));assert(calls.some(s=>s.includes("set_config('TimeZone','UTC',true)")));assert.equal(calls.at(-1),'ROLLBACK');
});
test('actual service fixture bundles with inert DB shim and no application pool',()=>{
 const folder=path.join(work,'bundle');mkdirSync(folder);const req=installedServiceRequire(repository);
 const previous=process.env.ESBUILD_BINARY_PATH;
 try {const services=loadExamServices(root,folder,req);assert.equal(typeof services.examStart,'function');assert.equal(typeof services.examSubmit,'function');}
 finally {if(previous===undefined)delete process.env.ESBUILD_BINARY_PATH;else process.env.ESBUILD_BINARY_PATH=previous;}
});
test('exact exam runtime metadata accepts reviewed fixtures and rejects extra grants, policies, constraints and index drift',async()=>{
 const tables=['exam_sessions','exam_session_items'];
 const functions=['guard_exam_state','execute_question_deletion','execute_question_deletion_pre_exam','delete_question_with_history','delete_question_without_learner_history'];
 const value={
  tableAcl:tables.flatMap(table=>[['ccna_phase6a_migrator',['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']],['ccna_phase6a_app',['SELECT','INSERT']]].flatMap(([role,privileges])=>privileges.map(privilege=>({table,role,privilege,grantable:false})))),
  columnAcl:Object.entries({exam_sessions:['status','finalized_at','result'],exam_session_items:['selected_keys','flagged','answer_version','graded_result']}).flatMap(([table,columns])=>columns.map(column=>({table,column,role:'ccna_phase6a_app',privilege:'UPDATE',grantable:false}))),
  functionAcl:functions.flatMap(name=>['ccna_phase6a_migrator',...(name.startsWith('delete_question_')?['ccna_phase6a_app']:[])].map(role=>({name,role,privilege:'EXECUTE',grantable:false}))),
  rls:[...tables].sort().map(name=>({name,enabled:false,forced:false,policies:0})),
  constraints:tables.flatMap(table=>Object.entries(plan.snapshot.tables['public.'+table].checkConstraints).map(([name,c])=>({table,name,expression:c.value,validated:true}))).sort((a,b)=>(a.table+'/'+a.name).localeCompare(b.table+'/'+b.name)),
  defaults:tables.flatMap(table=>Object.values(plan.snapshot.tables['public.'+table].columns).map(c=>({table,name:c.name,value:c.default===undefined?null:String(c.default)}))).sort((a,b)=>(a.table+'/'+a.name).localeCompare(b.table+'/'+b.name)),
  indexes:Object.entries({exam_items_question_idx:'exam_session_items USING btree (question_id, revision_id)',exam_items_user_idx:'exam_session_items USING btree (user_id, session_id, "position")',exam_sessions_deadline_idx:'exam_sessions USING btree (status, deadline_at)',exam_sessions_history_idx:'exam_sessions USING btree (user_id, started_at DESC NULLS LAST, id)'}).map(([name,tail])=>({name,definition:'CREATE INDEX '+name+' ON public.'+tail,valid:true,ready:true})),
 };
 const client=v=>({query:async sql=>({rows:sql.includes('col.attacl')?v.columnAcl:sql.includes('acldefault(\'r\'')?v.tableAcl:sql.includes('acldefault(\'f\'')?v.functionAcl:sql.includes('relrowsecurity')?v.rls:sql.includes('pg_constraint')?v.constraints:sql.includes('pg_attrdef')?v.defaults:v.indexes})});
 await assertExamDetails(client(value),plan.snapshot);
 for(const change of [v=>v.tableAcl.push({table:'exam_sessions',role:'other',privilege:'SELECT',grantable:false}),v=>v.columnAcl[0].privilege='DELETE',v=>v.functionAcl.push({name:'guard_exam_state',role:'PUBLIC',privilege:'EXECUTE',grantable:false}),v=>v.rls[0].policies=1,v=>v.constraints[0].expression='true',v=>v.constraints[0].validated=false,v=>v.defaults[0].value='null',v=>v.indexes[3].definition=v.indexes[3].definition.replace('DESC','ASC')]){const bad=structuredClone(value);change(bad);await assert.rejects(()=>assertExamDetails(client(bad),plan.snapshot));}
});
