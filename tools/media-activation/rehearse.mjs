// One new isolated database only; restore once, rehearse 0015 once, rollback.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {readinessPlan} from './readiness.mjs';
import {verifyBackup} from './verify-backup.mjs';
import {archivedRevisionAcl,restoreRevisionAcl} from './restore-security.mjs';
import {runningPrivate,assertPrivateIdentity,isolated,bin} from '../study-activation/isolated-policy.mjs';
import {assertLedger} from '../phase6a-local/policy.mjs';
import {readSchemaCatalog} from '../phase6a-local/upgrade.mjs';
import {assertStudyPolicies} from '../study-activation/proposed-runtime-guard.mjs';
import {assertLessonRevisionGuard} from '../lesson-activation/policy.mjs';
import {transactionClient} from '../lesson-activation/transaction-client.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {protectOperatorFolder,sterileEnvironment} from '../question-bank-disposable-access.mjs';
const root=realpathSync(process.cwd()),env=sterileEnvironment(),req=createRequire(path.join(root,'lib/db/package.json'));
const {Client}=req('pg'),{drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const database='ccna_media_0015_'+randomUUID().replaceAll('-','').slice(0,24);
const settings=name=>{assert(['postgres',database].includes(name));return {host:'127.0.0.1',port:55440,database:name,user:isolated.owner,ssl:false,password:async()=>{throw Error('Unexpected credential request');},connectionTimeoutMillis:5000,query_timeout:30000,options:'-c statement_timeout=30000 -c lock_timeout=5000',application_name:'ccna-media-0015-isolated'};};
const connect=async name=>{const c=new Client(settings(name));c.on('error',()=>{});await c.connect();return c;};
const sequences=async c=>Object.fromEntries(await Promise.all(['public.question_code_seq','drizzle.__drizzle_migrations_id_seq'].map(async name=>[name,(await c.query(`SELECT last_value::text,is_called FROM ${name}`)).rows[0]])));
const columns=['original_name','caption','width','height','thumbnail_key','thumbnail_sha256','original_key','edit'];
let stage='offline-preflight',folder,client,state,hbaChanged=false;
const report={applicationDatabaseConnections:0,applicationWrites:0,sourcePromoted:false,migrationExecutions:0};
try {
  assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--rehearse');
  const plan=readinessPlan(root),verified=verifyBackup(root,process.argv[3]),receipt=JSON.parse(readFileSync(process.argv[3],'utf8'));
  assert(Date.now()-Date.parse(receipt.createdAt)>=0&&Date.now()-Date.parse(receipt.createdAt)<6*60*60*1000,'Backup older than six hours; stop');
  const snapshot=JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/0014_snapshot.json'),'utf8')),tables=Object.keys(receipt.rowProof).sort();
  folder=path.join(root,'.local','media-0015-rehearsal',database);mkdirSync(folder,{recursive:true});protectOperatorFolder(folder,env);
  report.backup={sha256:verified.sha256,receipt:path.relative(root,realpathSync(process.argv[3]))};report.proposal=plan.proposal;
  stage='private-isolation';state=runningPrivate(root);
  const changed=Buffer.from([...state.lines.slice(0,3),`host ${database} ${isolated.owner} 127.0.0.1/32 trust`,...state.lines.slice(3)].join('\n')+'\n');
  const reload=()=>execFileSync(bin+'pg_ctl.exe',['-D',state.data,'reload'],{env:state.env,stdio:'pipe',timeout:10000,windowsHide:true});
  try {
    writeFileSync(state.hba,changed);hbaChanged=true;reload();
    client=await connect('postgres');await assertPrivateIdentity(client,'postgres',state.data);
    assert.equal((await client.query('SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS exists',[database])).rows[0].exists,false,'Never reuse a database');
    assert.match(database,/^ccna_media_0015_[a-f0-9]{24}$/);
    await client.query(`CREATE DATABASE "${database}" OWNER "${isolated.owner}" TEMPLATE template0`);report.disposableDatabaseCreated=true;await client.end();client=await connect(database);
    const identity=await assertPrivateIdentity(client,database,state.data);report.target={...identity,database};
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].n,0);
    stage='archive-restoration';
    const securityDdl=execFileSync(bin+'pg_restore.exe',['--schema-only','--no-owner','--file=-',receipt.backup.path],{env:state.env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
    archivedRevisionAcl(securityDdl);
    const ddl=execFileSync(bin+'pg_restore.exe',['--schema-only','--no-owner','--no-privileges','--file=-',receipt.backup.path],{env:state.env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
    if(/^CREATE SCHEMA public;$/m.test(ddl))await client.query('DROP SCHEMA public'); // exact empty, newly-created DB only; no CASCADE
    execFileSync(bin+'pg_restore.exe',['--host=127.0.0.1','--port=55440','--username='+isolated.owner,'--dbname='+database,'--no-password','--no-owner','--no-privileges','--single-transaction','--exit-on-error',receipt.backup.path],{env:state.env,stdio:'pipe',timeout:120000,windowsHide:true,maxBuffer:1024*1024});
    stage='restore-revision-function-acl';
    await restoreRevisionAcl(client,database,state.data,securityDdl);report.archivedRevisionAclRestored=true;
    stage='restored-baseline-verification';
    await client.query("SET TIME ZONE 'UTC'");
    const ledgerSql='SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id';
    assertLedger((await client.query(ledgerSql)).rows,plan.manifest);
    assert.deepEqual(await rowProof(client,tables,snapshot),receipt.rowProof);assert.deepEqual(await sequences(client),receipt.sequences);
    await assertStudyPolicies(client);await assertLessonRevisionGuard(client,root,isolated.owner);
    const baseline=await readSchemaCatalog(client);
    assert.equal(baseline.tables.length,22);assert(baseline.tables.every(table=>table.owner===isolated.owner));
    report.restorationVerified=true;
    stage='staged-0015';
    const staging=path.join(folder,'migrations');mkdirSync(path.join(staging,'meta'),{recursive:true});
    const journal=JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/_journal.json'),'utf8'));
    const when=plan.manifest.at(-1).when+1;
    for(const migration of plan.manifest){const bytes=readFileSync(path.join(root,'lib/db/drizzle',migration.tag+'.sql'));assert.equal(digest(bytes),migration.hash);writeFileSync(path.join(staging,migration.tag+'.sql'),bytes,{flag:'wx'});}
    const sql=readFileSync(path.join(root,plan.proposal.file));assert.equal(digest(sql),plan.proposal.sha256);writeFileSync(path.join(staging,'0015_lesson_media_library.sql'),sql,{flag:'wx'});
    journal.entries.push({idx:14,version:'7',when,tag:'0015_lesson_media_library',breakpoints:true});writeFileSync(path.join(staging,'meta/_journal.json'),JSON.stringify(journal),{flag:'wx'});
    await client.query('BEGIN');
    try {
      // Fixture ACLs are confined to this new DB and outer transaction. Archived ACLs are not replayed onto shared roles.
      await client.query('GRANT USAGE ON SCHEMA public TO pg_read_all_settings');
      await client.query('GRANT SELECT,INSERT ON public.lesson_media TO pg_read_all_settings');
      stage='isolated-drizzle-0015';report.migrationExecutions=1;
      await migrate(drizzle(transactionClient(client)),{migrationsFolder:staging,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});
      const manifest=[...plan.manifest,{tag:'0015_lesson_media_library',when,hash:plan.proposal.sha256}];assertLedger((await client.query(ledgerSql)).rows,manifest);
      const firstLedger=(await client.query(ledgerSql)).rows,firstSequences=await sequences(client);
      await migrate(drizzle(transactionClient(client)),{migrationsFolder:staging,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});
      assert.deepEqual((await client.query(ledgerSql)).rows,firstLedger);assert.deepEqual(await sequences(client),firstSequences);
      report.repeatExecutionNoOpVerified=true;
      const after=await readSchemaCatalog(client);
      assert.deepEqual(after.tables,baseline.tables);assert.deepEqual(after.enums,baseline.enums);
      assert.deepEqual(after.columns.filter(column=>!(column.table==='lesson_media'&&columns.includes(column.name))),baseline.columns);
      assert.deepEqual(after.constraints.filter(value=>value.name!=='lesson_media_library_metadata_ck'),baseline.constraints);
      assert.deepEqual(after.indexes.filter(value=>value.name!=='lesson_media_library_created_idx'),baseline.indexes);
      assert.deepEqual(after.columns.filter(value=>value.table==='lesson_media'&&columns.includes(value.name)).map(value=>value.name).sort(),[...columns].sort());
      assert(after.constraints.some(value=>value.name==='lesson_media_library_metadata_ck'));assert(after.indexes.some(value=>value.name==='lesson_media_library_created_idx'));
      assert.deepEqual(await rowProof(client,tables,snapshot),receipt.rowProof);
      await assertStudyPolicies(client);await assertLessonRevisionGuard(client,root,isolated.owner);
      const privileges=(await client.query("SELECT has_table_privilege('pg_read_all_settings','public.lesson_media','SELECT') AS select,has_table_privilege('pg_read_all_settings','public.lesson_media','INSERT') AS insert,has_table_privilege('pg_read_all_settings','public.lesson_media','UPDATE') AS update,has_table_privilege('pg_read_all_settings','public.lesson_media','DELETE') AS delete,has_table_privilege('pg_read_all_settings','public.lesson_media','TRUNCATE') AS truncate")).rows[0];
      assert.deepEqual(privileges,{select:true,insert:true,update:false,delete:false,truncate:false});
      await client.query('SAVEPOINT media_fixture');
      const creator=(await client.query('SELECT id FROM public.users ORDER BY id LIMIT 1')).rows[0]?.id;assert(creator);
      await client.query('SET LOCAL ROLE pg_read_all_settings');
      const id=randomUUID();
      const defaults=(await client.query("INSERT INTO public.lesson_media(id,created_by,storage_key,mime,bytes,sha256) VALUES($1,$2,$3,'image/webp',1,$4) RETURNING original_name,caption,width,height,edit",[id,creator,id+'.webp','0'.repeat(64)])).rows[0];
      assert.deepEqual(defaults,{original_name:'',caption:'',width:null,height:null,edit:{}});
      await client.query('RESET ROLE');await client.query('ROLLBACK TO SAVEPOINT media_fixture');
      await client.query('SAVEPOINT invalid_media');
      let invalid=false;try{await client.query("INSERT INTO public.lesson_media(id,created_by,storage_key,mime,bytes,sha256,width) VALUES($1,$2,$3,'image/webp',1,$4,0)",[id,creator,id+'.webp','0'.repeat(64)]);}catch(error){assert.equal(error.code,'23514');invalid=true;}
      assert(invalid);await client.query('ROLLBACK TO SAVEPOINT invalid_media');
      report.rehearsalVerified=true;report.isolatedLedgerEntriesDuringRehearsal=15;report.originalRecordsPreserved=true;report.permissionsVerified=true;report.constraintsVerified=true;
    } finally {await client.query('ROLLBACK');}
    stage='rollback-verification';
    assert.deepEqual(await readSchemaCatalog(client),baseline);assertLedger((await client.query(ledgerSql)).rows,plan.manifest);assert.deepEqual(await rowProof(client,tables,snapshot),receipt.rowProof);
    // PostgreSQL sequences are nontransactional; restore only this disposable ledger sequence.
    await assertPrivateIdentity(client,database,state.data);
    const sequence=receipt.sequences['drizzle.__drizzle_migrations_id_seq'];await client.query("SELECT setval('drizzle.__drizzle_migrations_id_seq',$1,$2)",[sequence.last_value,sequence.is_called]);
    assert.deepEqual(await sequences(client),receipt.sequences);report.rollbackVerified=true;
    await client.end();client=null;
  } finally {
    if(client){await client.end().catch(()=>{});client=null;}
    if(hbaChanged){assert(readFileSync(state.hba).equals(changed),'Concurrent HBA change; do not overwrite');writeFileSync(state.hba,state.original);reload();assert(readFileSync(state.hba).equals(state.original));report.hbaRestoredByteForByte=true;}
  }
  report.classification='READY FOR APPROVAL';stage='complete';
} catch(error) {
  report.classification='BLOCKED';report.failure={stage,sqlState:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:null,message:'Stopped. No automatic retry; raw SQL, row values and credentials withheld.'};process.exitCode=1;
}
report.stage=stage;if(folder){const file=path.join(folder,'rehearsal.json');report.report=file;writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify(report));
