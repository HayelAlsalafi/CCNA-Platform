import {checked,sanitizedFailure} from './diagnostics.mjs';
import {isolatedMigrationClient} from './migration-context.mjs';
import {runSafetyAssertions,assertSafetyCoverage} from './safety-assertions.mjs';
// Restore/rehearse ONLY in a newly created private disposable database.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {runningPrivate,assertPrivateIdentity,isolated,bin} from '../study-activation/isolated-policy.mjs';
import {sourcePlan,stageExam,assertFreshBackup} from './activation.mjs';
import {verifyBackup} from './verify-backup.mjs';
import {assertExamPrivileges} from '../exam-policy.mjs';
import {loadExamServices} from './service-fixture.mjs';
import {checkExistingRuntime} from '../study-activation/activation.mjs';
import {assertDeletionFunction} from '../lesson-deletion/policy.mjs';
import {prepareFixtureRoles,fixtureRoles,aclSelection,aclSql} from './restore-roles.mjs';
import {archivedRevisionAcl} from '../media-activation/restore-security.mjs';
import {assertMediaRuntimeCatalog} from '../media-activation/runtime.mjs';
import {assertLessonPrivileges} from '../lesson-activation/policy.mjs';
import {readSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertLedger} from '../phase6a-local/policy.mjs';
import {readSequences} from '../study-activation/activation.mjs';
import {transactionClient} from '../lesson-activation/transaction-client.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {protectOperatorFolder,sterileEnvironment} from '../question-bank-disposable-access.mjs';
const root=process.cwd(),env=sterileEnvironment(),req=createRequire(path.join(root,'lib/db/package.json'));
const database='ccna_exam_0017_restore_'+randomUUID().replaceAll('-','').slice(0,24);
let state,changed,changedHba=false,client,folder,stage='offline-preflight',open=false;
const report={applicationDatabaseConnections:0,applicationWrites:0,sourcePromoted:false,migrationExecutions:0};
const reload=()=>execFileSync(bin+'pg_ctl.exe',['-D',state.data,'reload'],{env:state.env,stdio:'pipe',timeout:10000,windowsHide:true});
async function connect(name){assert(['postgres',database].includes(name));const c=new(req('pg').Client)({host:'127.0.0.1',port:55440,database:name,user:isolated.owner,ssl:false,password:async()=>{throw Error('Unexpected credentials');},connectionTimeoutMillis:5000,query_timeout:30000});c.on('error',()=>{});await c.connect();await assertPrivateIdentity(c,name,state.data);return c;}
try{
 assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--rehearse');const plan=sourcePlan(root),verified=verifyBackup(root,process.argv[3]),backup=JSON.parse(readFileSync(process.argv[3],'utf8'));assertFreshBackup(backup);
 folder=path.join(root,'.local/exam-0017-restored',database);mkdirSync(folder,{recursive:true});protectOperatorFolder(folder,env);report.backup={sha256:verified.sha256,receipt:path.relative(root,process.argv[3])};report.proposal=plan.proposal;report.toolingHash=plan.toolingHash;
 stage='private-identity';state=runningPrivate(root);changed=Buffer.from([...state.lines.slice(0,3),`host ${database} ${isolated.owner} 127.0.0.1/32 trust`,...state.lines.slice(3)].join('\n')+'\n');writeFileSync(state.hba,changed);changedHba=true;reload();
 client=await connect('postgres');assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',[database])).rows[0].n,0);await client.query(`CREATE DATABASE "${database}" OWNER "${isolated.owner}" TEMPLATE template0`);await client.end();client=await connect(database);report.target=await assertPrivateIdentity(client,database,state.data);
 assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].n,0);
 stage='archive-restoration';const options={env:state.env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,timeout:120000};
 const ddl=execFileSync(bin+'pg_restore.exe',['--schema-only','--no-owner','--file=-',backup.backup.path],options);const revoke=archivedRevisionAcl(ddl);
 if(/^CREATE SCHEMA public;$/m.test(ddl))await client.query('DROP SCHEMA public');
 execFileSync(bin+'pg_restore.exe',['--host=127.0.0.1','--port=55440','--username='+isolated.owner,'--dbname='+database,'--no-password','--no-owner','--no-privileges','--single-transaction','--exit-on-error',backup.backup.path],{...options,stdio:'pipe'});
 await client.query(revoke);report.archivedRevisionAclRestored=true;await client.query("SET TIME ZONE 'UTC'");
 const tables=Object.keys(backup.rowProof).sort(),ledgerSql='SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id';
 assertLedger((await client.query(ledgerSql)).rows,plan.manifest.slice(0,16));assert.deepEqual(await rowProof(client,tables,plan.baseline),backup.rowProof);assert.deepEqual(await readSequences(client),backup.sequences);const originalCatalog=await readSchemaCatalog(client);report.restorationVerified=true;
 const toc=execFileSync(bin+'pg_restore.exe',['--list',backup.backup.path],options),aclList=path.join(folder,'acl.list');writeFileSync(aclList,aclSelection(toc),{flag:'wx'});
 const acl=aclSql(execFileSync(bin+'pg_restore.exe',['--schema-only','--no-owner','--use-list='+aclList,'--file=-',backup.backup.path],options));
 const staging=path.join(folder,'migrations');stageExam(root,staging,plan);
 stage='transactional-isolated-role-fixture';await client.query('BEGIN');open=true;await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SET LOCAL TIME ZONE 'UTC'");
 // Serializes cooperating private workflows; refuses any existing role names.
 assert.equal((await client.query('SELECT pg_try_advisory_xact_lock(7130017) AS locked')).rows[0].locked,true);await prepareFixtureRoles(client,database);await client.query(acl);report.archivedAclRestored=true;
 // pg_restore emits session defaults (including zero timeouts). Re-establish
 // bounded validation and normal RLS/function-body checks after ACL replay.
 await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SET LOCAL TIME ZONE 'UTC'; SET LOCAL search_path=pg_catalog; SET LOCAL row_security=on; SET LOCAL check_function_bodies=on");
 await assertMediaRuntimeCatalog(client,root,plan.manifest.slice(0,16));await assertLessonPrivileges(client);await assertDeletionFunction(client,root);await checkExistingRuntime(client,root);report.leastPrivilegeOwnerVerified=true;
 stage='exact-drizzle-0017';await client.query('SET LOCAL ROLE ccna_phase6a_migrator');
 const migrationClient=await isolatedMigrationClient(client,database);
 const {drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');await migrate(drizzle(migrationClient),{migrationsFolder:staging,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});report.migrationExecutions=1;report.exactSqlRehearsed=true;
 await checked('metadata.lesson.deletion',()=>assertDeletionFunction(client,root));await checked('metadata.catalog.all',()=>assertMediaRuntimeCatalog(client,root,plan.manifest));await checked('metadata.lesson.privileges',()=>assertLessonPrivileges(client));
 assert.deepEqual(await rowProof(client,tables,plan.baseline),backup.rowProof);const after=await readSequences(client),first=(await client.query(ledgerSql)).rows;await migrate(drizzle(migrationClient),{migrationsFolder:staging,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});assert.deepEqual((await client.query(ledgerSql)).rows,first);assert.deepEqual(await readSequences(client),after);report.repeatExecutionNoOpVerified=true;
 stage='exam-least-privilege-fixture';await client.query('SAVEPOINT exam_fixture');await assertExamPrivileges(client);await checkExistingRuntime(client,root,12);
 const actor=(await client.query("SELECT id FROM public.users WHERE status::text='ACTIVE' ORDER BY id LIMIT 1")).rows[0]?.id;assert(actor,'Restored fixture requires an active user');
 const id=randomUUID();await client.query('RESET ROLE');await client.query('SET LOCAL ROLE ccna_phase6a_app');
 await client.query("INSERT INTO public.exam_sessions(id,user_id,request_id,auth_session_id,config,question_count,started_at,deadline_at) VALUES($1,$2,$3,'isolated-fixture','{}',1,statement_timestamp(),statement_timestamp()+interval '5 minutes')",[id,actor,randomUUID()]);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM public.exam_sessions WHERE id=$1',[id])).rows[0].n,1);
 await client.query('SAVEPOINT invalid_deadline');let rejected=false;
 try {await client.query("INSERT INTO public.exam_sessions(user_id,request_id,auth_session_id,config,question_count,started_at,deadline_at) VALUES($1,$2,'isolated-fixture','{}',1,statement_timestamp(),statement_timestamp()+interval '1 minute')",[actor,randomUUID()]);}catch(e){assert.equal(e.code,'23514');rejected=true;}
 await client.query('ROLLBACK TO SAVEPOINT invalid_deadline');assert(rejected,'Invalid deadline accepted');
 await client.query('RESET ROLE');await client.query('SET LOCAL ROLE ccna_phase6a_migrator');
 // Remove nothing: keep fixture rows only inside a savepoint, then roll back them.
 report.examFixtureVerified=true;
 const services=loadExamServices(root,folder,req),databaseApi=drizzle(transactionClient(client));
 await client.query('RESET ROLE');await client.query('SET LOCAL ROLE ccna_phase6a_app');
 const others=(await client.query("SELECT id FROM public.users WHERE status::text='ACTIVE' AND id<>$1 ORDER BY id LIMIT 1",[actor])).rows;assert.equal(others.length,1,'Two active restored actors required');
 const started=await services.examStart({requestId:randomUUID(),questionCount:1,durationMinutes:5},actor,'isolated-exam-fixture',databaseApi);
 assert.equal(started.status,'ACTIVE');assert.equal(started.questions.length,1);
 assert(!JSON.stringify(started).includes('isCorrect')&&!JSON.stringify(started).includes('correctOptions')&&!JSON.stringify(started).includes('explanation'),'Active answer leakage');
 await assert.rejects(()=>services.examSession(started.id,others[0].id,databaseApi),e=>e.status===404);
 const item=started.questions[0];await services.examSave(started.id,item.deliveryId,{selectedOptionKeys:[],flagged:true,expectedVersion:item.answerVersion},actor,databaseApi);
 const resumed=await services.examSession(started.id,actor,databaseApi);assert.equal(resumed.questions[0].flagged,true);
 await assert.rejects(()=>services.examSave(started.id,item.deliveryId,{selectedOptionKeys:[],flagged:false,expectedVersion:item.answerVersion},actor,databaseApi),e=>e.code==='VERSION_CONFLICT');
 const completed=await services.examSubmit(started.id,actor,databaseApi);assert.equal(completed.status,'SUBMITTED');assert.equal(completed.result.unanswered,1);
 assert.deepEqual((await services.examSubmit(started.id,actor,databaseApi)).result,completed.result);
 assert((await services.examHistory({},actor,databaseApi)).items.some(x=>x.id===started.id));
 await assert.rejects(()=>services.examSubmit(started.id,others[0].id,databaseApi),e=>e.status===404);
 report.answerPrivacyOwnershipVerified=true;
 stage='mandatory-safety-assertions';report.safetyAssertions={};
 await runSafetyAssertions(client,services,databaseApi,report.target,report.safetyAssertions);
 assertSafetyCoverage(report.safetyAssertions);
 await client.query('ROLLBACK TO SAVEPOINT exam_fixture');await client.query('RESET ROLE');await client.query('SET LOCAL ROLE ccna_phase6a_migrator');
 assert.deepEqual(await rowProof(client,tables,plan.baseline),backup.rowProof);report.permissionsVerified=true;report.constraintsVerified=true;report.originalRecordsPreserved=true;report.rehearsalVerified=true;report.isolatedLedgerEntriesDuringRehearsal=17;
 stage='rollback-verification';await client.query('ROLLBACK');open=false;assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[fixtureRoles])).rows[0].n,0);report.fixtureRoleChangesRolledBack=true;
 assert.deepEqual(await readSchemaCatalog(client),originalCatalog);assertLedger((await client.query(ledgerSql)).rows,plan.manifest.slice(0,16));assert.deepEqual(await rowProof(client,tables,plan.baseline),backup.rowProof);
 await assertPrivateIdentity(client,database,state.data);const seq=backup.sequences['drizzle.__drizzle_migrations_id_seq'];await client.query("SELECT setval('drizzle.__drizzle_migrations_id_seq',$1,$2)",[seq.last_value,seq.is_called]);assert.deepEqual(await readSequences(client),backup.sequences);report.rollbackVerified=true;assert.equal(report.answerPrivacyOwnershipVerified,true,'Restored authenticated exam ownership/privacy acceptance still required');assertSafetyCoverage(report.safetyAssertions);report.classification='READY FOR APPROVAL';stage='complete';
}catch(error){const code=error?.code??error?.cause?.code;report.classification='BLOCKED';report.failure={stage,diagnostic:sanitizedFailure(error),sqlState:/^[A-Z0-9]{5}$/.test(code??'')?code:null,message:'Stopped. Preserve evidence; no automatic retry. Raw output withheld.'};process.exitCode=1;}
finally{
 if(client){if(open)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
 if(changedHba){assert(readFileSync(state.hba).equals(changed));writeFileSync(state.hba,state.original);reload();assert(readFileSync(state.hba).equals(state.original));report.hbaRestoredByteForByte=true;}
 report.stage=stage;if(folder){report.report=path.join(folder,'rehearsal.json');writeFileSync(report.report,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify(report));
}
