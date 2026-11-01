// FINAL LEGACY DATA REMOVAL: exact approved fixtures only. No secrets/role changes/reset.
import { readFileSync, writeFileSync, mkdirSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { policy, LocalRuntimeError, assertWorkspace, preflight, migrationManifest, cleanEnvironment } from '../phase6a-local/policy.mjs';
import { upgradeSnapshots, verifyUpgradeState, migratorClient } from '../phase6a-local/upgrade.mjs';
import { readPack, verifyManifest, validateBindings } from '../../docs/content/ccna-200-301/prepare-pack.mjs';
import { expectedQuestions } from '../../docs/content/ccna-200-301/manual-admin-workflow.browser.mjs';
import { curriculumDomains, mapCurriculumTopics } from '../../artifacts/api-server/src/lib/curriculum-config.ts';
import { preservationSet } from './planner.mjs';
import { finalPlan, reviewedInventory, reviewedProvenanceAmendments, decodeArchiveTables, verifyDisposableOwnership } from './final-planner.mjs';
import { assertControlledDeleteState, assertControlledDeleteMetadata } from './controlled-delete.mjs';
import { sprint7QuestionIds, sprint7TopicIds } from '../../artifacts/api-server/src/lib/pilot-content-protection.ts';
import { topicDependencies } from './topic-dependencies.mjs';
const root = realpathSync(process.cwd()), bin='C:/Program Files/PostgreSQL/18/bin';
const report = { phase:'FINAL-LEGACY-REMOVAL', committed:false, database:policy.database, stage:'configuration' };
let client, output;
const fail = message => { const error=Error(message);error.cleanupDiagnostic=true;throw error; };
const digest = data => createHash('sha256').update(data).digest('hex');
const tables = ['users','topics','questions','question_options','question_revisions','practice_deliveries','practice_attempts','exam_blueprints','exam_domains','exam_objectives','question_objectives'];
const protectedTables = ['users','exam_blueprints','exam_domains','exam_objectives'];
const historyTables=['question_revisions','practice_deliveries','practice_attempts'];
async function fingerprint(table, condition = '', values = []) {
  // Table/condition text is internal constants only. Values are parameterized.
  return (await client.query(`SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM public.${table} t ${condition}`, values)).rows[0].hash;
}
async function readState() {
  report.stage='read-question-records';
  const questions = (await client.query(`SELECT q.id,q.topic_id AS "topicId",q.question_code AS "questionCode",q.text,q.type,q.difficulty,q.explanation,q.image_key AS "imageKey",q.reference_notes AS "referenceNotes",q.status,q.created_at AS "createdAt",q.updated_at AS "updatedAt",
    coalesce((SELECT jsonb_agg(jsonb_build_object('optionKey',o.option_key,'text',o.text,'isCorrect',o.is_correct) ORDER BY o.option_key) FROM public.question_options o WHERE o.question_id=q.id),'[]'::jsonb) AS options FROM public.questions q ORDER BY q.id`)).rows;
  report.stage='read-topic-records';
  const topics = (await client.query('SELECT id,slug,name,description,status FROM public.topics ORDER BY id')).rows;
  const dependencies = { questions:{}, topics:{} };
  report.stage='read-question-dependencies';
  for (const q of questions) dependencies.questions[q.id] = (await client.query(`SELECT
    (SELECT count(*)::int FROM public.question_revisions WHERE question_id=$1) AS revisions,
    (SELECT count(*)::int FROM public.practice_deliveries WHERE question_id=$1) AS deliveries,
    (SELECT count(*)::int FROM public.practice_attempts WHERE question_id=$1) AS attempts`,[q.id])).rows[0];
  report.stage='read-topic-dependencies';
  for (const t of topics) dependencies.topics[t.id] = await topicDependencies(client,t.id);
  return {questions,topics,dependencies};
}
async function integrity() {
  const rows = (await client.query(`SELECT
    (SELECT count(*) FROM public.questions q LEFT JOIN public.topics t ON t.id=q.topic_id WHERE t.id IS NULL) +
    (SELECT count(*) FROM public.question_options o LEFT JOIN public.questions q ON q.id=o.question_id WHERE q.id IS NULL) +
    (SELECT count(*) FROM public.question_revisions r LEFT JOIN public.questions q ON q.id=r.question_id WHERE q.id IS NULL) +
    (SELECT count(*) FROM public.practice_deliveries d LEFT JOIN public.question_revisions r ON r.id=d.revision_id AND r.question_id=d.question_id LEFT JOIN public.users u ON u.id=d.user_id WHERE r.id IS NULL OR u.id IS NULL) +
    (SELECT count(*) FROM public.practice_attempts a LEFT JOIN public.questions q ON q.id=a.question_id LEFT JOIN public.topics t ON t.id=a.topic_id LEFT JOIN public.users u ON u.id=a.user_id WHERE q.id IS NULL OR t.id IS NULL OR u.id IS NULL) +
    (SELECT count(*) FROM public.practice_attempts a LEFT JOIN public.practice_deliveries d ON d.id=a.delivery_id AND d.user_id=a.user_id AND d.question_id=a.question_id AND d.revision_id=a.revision_id LEFT JOIN public.question_revisions r ON r.id=a.revision_id AND r.question_id=a.question_id WHERE (a.delivery_id IS NOT NULL AND (d.id IS NULL OR r.id IS NULL)) OR ((a.delivery_id IS NULL) <> (a.revision_id IS NULL))) +
    (SELECT count(*) FROM public.exam_domains d LEFT JOIN public.exam_blueprints b ON b.id=d.blueprint_id WHERE b.id IS NULL) +
    (SELECT count(*) FROM public.exam_objectives o LEFT JOIN public.exam_domains d ON d.id=o.domain_id AND d.blueprint_id=o.blueprint_id AND d.code=o.domain_code WHERE d.id IS NULL) +
    (SELECT count(*) FROM public.question_objectives m LEFT JOIN public.questions q ON q.id=m.question_id LEFT JOIN public.exam_objectives o ON o.id=m.objective_id AND o.blueprint_id=m.blueprint_id WHERE q.id IS NULL OR o.id IS NULL) AS orphans`)).rows;
  if (String(rows[0].orphans) !== '0') fail('Referential integrity failed.');
}
async function main() {
  const operation=process.argv.slice(2).join(' ');
  if (!['--execute-final-legacy-cleanup','--plan'].includes(operation)) fail('Only the authorized execution command or inert plan is supported.');
  assertWorkspace(root,process.cwd(),execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim());
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='03b14526aae448e49eacd602a43bfb0e355aca4d') fail('HEAD changed.');
  verifyManifest(); const p=readPack();
  const amendments=reviewedProvenanceAmendments();
  report.provenanceAmendment={questionTimestampPairs:amendments.filter(e=>e.table==='questions').length,topicTimestampPairs:amendments.filter(e=>e.table==='topics').length,sourceSha256:'ef060c6b46041a6ef33a5a6bd7082b6c5978c9723ac95ef047fdb410120d1974',evidenceSha256:'2d6e3503432c02b079137fcfc83a48eb64e4c0f4442f755650507755f406abb1'};
  assertControlledDeleteMetadata();
  const bindingBytes=readFileSync(path.join(root,'docs/content/ccna-200-301/manual-runs/1791890147651/bindings.json'));
  if(digest(bindingBytes)!=='65e25113a21999c2d83aca494ff44d60f26add36a5bcf678d2b4e5d75f2430cf') fail('Reviewed actual UUID bindings changed.');
  const bindings=JSON.parse(bindingBytes);validateBindings(p,bindings);
  const expected=expectedQuestions({...p,topicMeta:p.topics,blueprint:{sourceUrl:p.sourceUrl}},bindings);
  if(operation==='--plan'){
    const manifest=migrationManifest(root),inventory=reviewedInventory();
    if(manifest.length!==7||expected.length!==60||new Set(sprint7QuestionIds).size!==60||new Set(sprint7TopicIds).size!==24||inventory.questions.length!==75||inventory.topics.length!==78)fail('Planned identity/migration inventory mismatch.');
    report.stage='plan';report.databaseOperations=0;report.planSummary={preserveQuestions:60,preserveTopics:24,removeQuestions:75,removeTopics:78,pendingMigration:manifest[6].tag,backup:'Full snapshot archive and rollback-only eleven-table restoration before deletion',target:{host:policy.host,port:policy.port,database:policy.database,systemIdentifier:policy.upgradeSystemIdentifier},futureAdminGrant:'EXECUTE on delete_question_with_history(uuid,uuid) only; no direct history table privileges'};return;
  }
  let inputText='';for await(const chunk of process.stdin) { inputText+=chunk; if(inputText.length>16000)fail('Oversized private input.'); }
  const input=JSON.parse(inputText); inputText='';
  const env=cleanEnvironment(process.env,'check',{});
  const native=path.join(root,'.local/native-deps/node_modules');env.NODE_PATH=native;
  env.ESBUILD_BINARY_PATH=path.join(native,'.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
  const pgFolder=readdirSync(path.join(root,'node_modules/.pnpm')).find(n=>n.startsWith('pg@'));
  if(!pgFolder)fail('Installed PostgreSQL driver unavailable.');
  const require=createRequire(import.meta.url), {Client}=require(path.join(root,'node_modules/.pnpm',pgFolder,'node_modules/pg'));
  const manifest=migrationManifest(root), snapshots=upgradeSnapshots(root), oldManifest=manifest.slice(0,6);
  if(manifest.length!==7||manifest[6].tag!=='0006_controlled_history_delete')fail('Only reviewed 0006 can be pending.');
  const result=await preflight('upgrade-verify',input,{
    verifyLocalService:()=>execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:15000}),
    createClient:options=>new Client(options),
    upgradeState:(c,phase)=>verifyUpgradeState(c,oldManifest,snapshots,phase,false),
    onStage:stage=>{report.stage=stage;},
  },{});
  client=result.client; report.identity=result.identity;
  const localRoot=realpathSync(path.join(root,'.local'));
  if(!localRoot.toLowerCase().startsWith(root.toLowerCase()+path.sep))fail('Backup parent escapes the approved workspace.');
  const backupParent=path.join(localRoot,'final-legacy-cleanup');mkdirSync(backupParent,{recursive:true});
  if(realpathSync(backupParent).toLowerCase()!==backupParent.toLowerCase())fail('Backup parent is redirected; stop.');
  const candidate=path.join(backupParent,new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(candidate); // Refuse existing paths; never overwrite a prior backup/report.
  output=candidate;
  const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',env}).match(/S-1-[0-9-]+/)?.[0];
  if(!sid)fail('Cannot protect backup directory.');
  execFileSync('icacls.exe',[output,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{env,stdio:'pipe',timeout:15000});
  report.stage='transaction-and-preservation';
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await client.query("SET LOCAL TimeZone='UTC'");
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='600s'");
  await client.query('LOCK TABLE '+tables.map(t=>'public.'+t).join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  const before=await readState();report.stage='verify-pilot-preservation';
  const preserved=preservationSet(expected,before.questions);
  const inventory=reviewedInventory(), plan=finalPlan(preserved,before.questions,before.topics,inventory);
  if(JSON.stringify(plan.preservedIds)!==JSON.stringify([...sprint7QuestionIds].sort())||JSON.stringify(plan.requiredTopicIds)!==JSON.stringify([...sprint7TopicIds].sort()))fail('Original pilot UUID inventory differs.');
  const ownership=(await client.query("SELECT pg_get_userbyid(datdba) AS owner,has_database_privilege(current_user,current_database(),'TEMP') AS temp FROM pg_database WHERE datname=current_database()")).rows[0];
  if(ownership?.owner!==policy.migrationRole||ownership.temp!==true)fail('Expected database owner/private definer TEMP permission missing; no automatic role changes.');
  const oldSource=readFileSync(path.join(root,'lib/db/drizzle/0004_question_revisions.sql'),'utf8');
  const originalBody=oldSource.match(/CREATE FUNCTION public\.reject_revision_history_change\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/)?.[1];
  const oldFn=(await client.query("SELECT prosrc,prosecdef,pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.reject_revision_history_change()'::regprocedure")).rows[0];
  if(!originalBody||oldFn?.prosrc!==originalBody||oldFn.prosecdef!==false||oldFn.owner!==policy.migrationRole)fail('Append-only function differs from reviewed 0004; stop.');
  const oldArchive=path.join(root,'.local/phase8a-cleanup/2026-10-13T15-59-16-134Z/before-cleanup.dump');
  if(digest(readFileSync(oldArchive))!==inventory.sourceArchiveHash)fail('Original provenance backup changed.');
  const archived=decodeArchiveTables(execFileSync(path.join(bin,'pg_restore.exe'),['--file=-',oldArchive],{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024}));
  const current={};for(const table of tables)current[table]=(await client.query('SELECT to_jsonb(t) AS row FROM public.'+table+' t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row);
  report.historicalFixtures=verifyDisposableOwnership(plan,current,archived,inventory);
  const existingTriggers=(await client.query("SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
  if(existingTriggers.some(t=>t.tgenabled!=='O'))fail('Unexpected disabled/user trigger state.');
  const historyDeleteTriggers=(await client.query("SELECT c.relname,t.tgname,t.tgfoid='public.reject_revision_history_change()'::regprocedure AS expected_function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND (t.tgtype & 8)=8 AND t.tgrelid=ANY($1::regclass[]) ORDER BY c.relname",[historyTables.map(t=>'public.'+t)])).rows;
  if(historyDeleteTriggers.length!==3||historyDeleteTriggers.some(t=>!t.expected_function||t.tgname!==t.relname+'_immutable'))fail('Unreviewed history DELETE triggers; stop.');
  const unexpectedIncoming=(await client.query("SELECT c.conname FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND c.confrelid=ANY($2::regclass[]) AND (n.nspname<>'public' OR NOT(child.relname=ANY($1::text[])))",[tables,['questions','topics','question_options','question_objectives',...historyTables].map(t=>'public.'+t)])).rows;
  if(unexpectedIncoming.length)fail('Unreviewed incoming foreign-key dependencies; stop.');
  const deletionTriggers=(await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D' AND (tgtype & 8)=8 AND tgrelid IN ('public.questions'::regclass,'public.topics'::regclass,'public.question_options'::regclass,'public.question_objectives'::regclass)")).rows;
  if(deletionTriggers.length)fail('Unreviewed content DELETE triggers; stop.');
  report.before={questions:before.questions.length,topics:before.topics.length,published:before.questions.filter(q=>q.status==='ACTIVE').length,drafts:before.questions.filter(q=>q.status==='DISABLED').length};
  report.plan=plan;
  await integrity();
  const domains=(await client.query('SELECT code,name,weight_percent AS "weightPercent" FROM public.exam_domains WHERE blueprint_id=$1 ORDER BY code',[bindings.blueprintId])).rows;
  if(JSON.stringify(domains)!==JSON.stringify(p.domains.map(d=>({code:d.code,name:d.name,weightPercent:d.weightPercent}))))fail('Pilot blueprint official domains differ from the reviewed source.');
  report.curriculum={domainRows:domains.length,chapterStorage:'versioned curriculum configuration (no chapter table)',domains:curriculumDomains.length,chapters:curriculumDomains.flatMap(d=>d.sections.flatMap(s=>s.chapters)).length};
  if(report.curriculum.domains!==6 || report.curriculum.chapters!==33 || current.exam_domains.length!==6)fail('Exact domain inventory/curriculum configuration changed.');
  const pilotIds=preserved.map(q=>q.id), pilotHash=digest(JSON.stringify(preserved));
  const pilotOptions=await fingerprint('question_options','WHERE t.question_id=ANY($1::uuid[])',[pilotIds]);
  const pilotMappings=await fingerprint('question_objectives','WHERE t.question_id=ANY($1::uuid[])',[pilotIds]);
  const pilotTopics=await fingerprint('topics','WHERE t.id=ANY($1::uuid[])',[plan.requiredTopicIds]);
  const assignments=(await client.query('SELECT m.question_id AS "questionId",m.blueprint_id AS "blueprintId",m.is_primary AS "isPrimary",o.code FROM public.question_objectives m JOIN public.exam_objectives o ON o.id=m.objective_id AND o.blueprint_id=m.blueprint_id WHERE m.question_id=ANY($1::uuid[])',[pilotIds])).rows;
  for(let i=0;i<preserved.length;i++)if(assignments.filter(a=>a.questionId===preserved[i].id&&a.blueprintId===bindings.blueprintId&&a.isPrimary&&a.code===expected[i].objective).length!==1)fail('Pilot primary objective differs from original reviewed import.');
  const historyHashes={};for(const table of protectedTables)historyHashes[table]=await fingerprint(table);
  const pilotHistory={};for(const table of historyTables)pilotHistory[table]=await fingerprint(table,'WHERE t.question_id=ANY($1::uuid[])',[pilotIds]);
  const sequence=(await client.query('SELECT last_value,is_called FROM public.question_code_seq')).rows;
  report.stage='backup';
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const archive=path.join(output,'before-cleanup.dump');
  const backupEnv={...env,PGPASSWORD:input.password,PGSSLMODE:'disable'};
  const dumpVersion=execFileSync(path.join(bin,'pg_dump.exe'),['--version'],{env,encoding:'utf8',timeout:5000}).trim();
  if(!/PostgreSQL\) 18\.6$/.test(dumpVersion))fail('Expected installed PostgreSQL 18.6 backup tools.');
  execFileSync(path.join(bin,'pg_dump.exe'),['--host',policy.host,'--port',String(policy.port),'--username',policy.migrationRole,'--dbname',policy.database,'--no-password','--format=custom','--snapshot',snapshot,'--file',archive],{env:backupEnv,stdio:'pipe',timeout:120000});
  delete backupEnv.PGPASSWORD;
  const toc=execFileSync(path.join(bin,'pg_restore.exe'),['--list',archive],{env,encoding:'utf8',timeout:30000});
  for(const table of tables)if(!toc.includes('TABLE DATA public '+table+' '))fail('Backup missing application table '+table);
  execFileSync(path.join(bin,'pg_restore.exe'),['--file=-',archive],{env,stdio:['ignore','ignore','pipe'],timeout:120000});
  if(statSync(archive).size===0)fail('Empty backup.');
  report.backup={path:archive,bytes:statSync(archive).size,sha256:digest(readFileSync(archive)),tocVerified:true,fullArchiveDecodeVerified:true,restoreTested:false};
  writeFileSync(path.join(output,'recovery.md'),`# Recovery\n\nBackup: ${archive}\nSHA-256: ${report.backup.sha256}\n\nThe archive was fully decoded, not restored into another database. Preserve it and this report. Never restore over the running database automatically. For recovery after an unexpected post-commit failure, stop application writes, verify this hash, and obtain an explicitly approved recovery target. Use PostgreSQL 18.6 pg_restore with --exit-on-error and privately supplied credentials on that target. No DROP/TRUNCATE/--clean procedure is authorized. Read-only inspection: pg_restore --list "${archive}".\n`);
  report.stage='verify-backup-restoration';
  const proof={sha256:report.backup.sha256,tables:{}};
  for(const table of tables)proof.tables[table]={count:current[table].length,hash:await fingerprint(table)};
  const proofPath=path.join(output,'restore-proof-input.json');writeFileSync(proofPath,JSON.stringify(proof,null,2));
  const restoreResult=JSON.parse(execFileSync(process.execPath,[path.join(root,'tools/phase8a-cleanup/verify-backup.mjs'),'--verify-rollback-restoration',archive,proofPath],{env,encoding:'utf8',timeout:150000,maxBuffer:1024*1024,windowsHide:true}));
  if(restoreResult.restoreVerified!==true||restoreResult.allRowsAndHashesMatched!==true||restoreResult.rolledBack!==true)fail('Backup restoration proof failed.');
  report.backup.restoreTested=true;report.backup.restoration=restoreResult;
  writeFileSync(path.join(output,'recovery.md'),`# Verified recovery archive\n\nFull custom archive: ${archive}\nSHA-256: ${report.backup.sha256}\n\nAll eleven application tables were restored with exact counts and hashes into the existing disposable database, then rolled back. Schema archive fully decoded; migration/schema metadata verified. No roles/passwords are included. Actual database-wide recovery requires an explicitly chosen EMPTY target and PostgreSQL 18.6 pg_restore --exit-on-error; never use --clean or restore over the live application automatically.\n`);
  report.stage='official-migration-0006';
  const dbRequire=createRequire(path.join(root,'lib/db/package.json'));
  const {drizzle}=dbRequire('drizzle-orm/node-postgres'),{migrate}=dbRequire('drizzle-orm/node-postgres/migrator');
  await migrate(drizzle(migratorClient(client)),{migrationsFolder:path.join(root,'lib/db/drizzle')});
  await verifyUpgradeState(client,manifest,snapshots,'after',false);
  await assertControlledDeleteState(client,false);
  // Exact function EXECUTE only. No direct history DELETE/TEMP grant to the API role.
  await client.query('GRANT EXECUTE ON FUNCTION public.delete_question_with_history(uuid,uuid) TO ccna_phase6a_app');
  await assertControlledDeleteState(client,true);
  report.stage='delete-exact-disposable-history-and-questions';
  const ids=plan.deleteQuestionIds,deletedHistory={attempts:0,deliveries:0,revisions:0};
  for(const id of ids){const counts=(await client.query('SELECT public.delete_question_with_history($1::uuid,NULL::uuid) AS counts',[id])).rows[0].counts;for(const key of Object.keys(deletedHistory))deletedHistory[key]+=Number(counts[key]);}
  const deletedQuestions={rowCount:ids.length};
  if(deletedHistory.attempts!==report.historicalFixtures.practice_attempts||deletedHistory.deliveries!==report.historicalFixtures.practice_deliveries||deletedHistory.revisions!==report.historicalFixtures.question_revisions)fail('Exact fixture history deletion set changed.');
  const deletedTopics=await client.query('DELETE FROM public.topics WHERE id=ANY($1::uuid[]) RETURNING id',[plan.deleteTopicIds]);
  if(deletedTopics.rowCount!==78)fail('Exact obsolete topic deletion count failed.');
  report.deletedHistory=deletedHistory;
  report.stage='precommit-verification';
  const after=await readState();report.stage='precommit-verification';
  const retained=preservationSet(expected,after.questions);
  if(digest(JSON.stringify(retained))!==pilotHash || await fingerprint('question_options','WHERE t.question_id=ANY($1::uuid[])',[pilotIds])!==pilotOptions || await fingerprint('question_objectives','WHERE t.question_id=ANY($1::uuid[])',[pilotIds])!==pilotMappings)fail('Original pilot content/status/IDs/mappings changed; rollback.');
  if(await fingerprint('topics','WHERE t.id=ANY($1::uuid[])',[plan.requiredTopicIds])!==pilotTopics)fail('Required pilot topics changed; rollback.');
  for(const table of protectedTables)if(await fingerprint(table)!==historyHashes[table])fail('Users or taxonomy changed; rollback.');
  for(const table of historyTables)if(await fingerprint(table,'WHERE t.question_id=ANY($1::uuid[])',[pilotIds])!==pilotHistory[table])fail('Pilot learner history changed; rollback.');
  if(after.questions.length!==60||after.topics.length!==24||JSON.stringify(after.questions.map(q=>q.id).sort())!==JSON.stringify(plan.preservedIds)||JSON.stringify(after.topics.map(t=>t.id).sort())!==JSON.stringify(plan.requiredTopicIds))fail('Exact final PostgreSQL identity/count set failed.');
  const afterTriggers=(await client.query("SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
  if(JSON.stringify(existingTriggers)!==JSON.stringify(afterTriggers))fail('Existing trigger bindings changed; rollback.');
  await assertControlledDeleteState(client,true);
  if(JSON.stringify((await client.query('SELECT last_value,is_called FROM public.question_code_seq')).rows)!==JSON.stringify(sequence))fail('Question sequence changed.');
  await verifyUpgradeState(client,manifest,snapshots,'after',false);
  await integrity();await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  const oldIds=new Set(plan.deleteQuestionIds);
  if(after.questions.some(q=>oldIds.has(q.id)))fail('Obsolete question remains physically present.');
  report.after={questions:after.questions.length,topics:after.topics.length,preservedPilotQuestions:retained.length,published:after.questions.filter(q=>q.status==='ACTIVE').length,drafts:after.questions.filter(q=>q.status==='DISABLED').length,deletedQuestions:deletedQuestions.rowCount,deletedTopics:deletedTopics.rowCount,disabledHistoryProtectedQuestions:0,disabledHistoryProtectedTopics:0};
  const eligible=after.questions.filter(q=>q.status==='ACTIVE'&&after.topics.some(t=>t.id===q.topicId&&t.status==='ACTIVE'));
  const mapped=mapCurriculumTopics(after.topics.filter(t=>t.status==='ACTIVE').map(t=>({...t,questionCount:eligible.filter(q=>q.topicId===t.id).length})));
  report.counts={practiceEligible:eligible.length,mappedPublished:mapped.mapped.reduce((n,t)=>n+t.questionCount,0),unmappedPublished:[...mapped.unmapped,...mapped.ambiguous].reduce((n,t)=>n+t.questionCount,0)};
  report.integrity={orphans:0,pilotUnchanged:true,pilotHistoryAndUsersUnchanged:true,sequenceUnchanged:true,sixHistoricalLedgerEntriesUnchanged:true,officialMigration0006Verified:true,foreignKeysAndTriggerBindingsUnchanged:true};
  // Persist evidence before COMMIT so even a lost acknowledgement has an exact recovery record.
  writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  report.stage='commit';await client.query('COMMIT');report.committed=true;
  report.stage='postcommit-read-only-verification';
  await client.query('BEGIN READ ONLY');
  try{
    const q=(await client.query('SELECT id,status FROM public.questions ORDER BY id')).rows;
    const t=(await client.query('SELECT id FROM public.topics ORDER BY id')).rows;
    const domainCount=Number((await client.query('SELECT count(*) AS count FROM public.exam_domains')).rows[0].count);
    if(JSON.stringify(q.map(r=>r.id))!==JSON.stringify(plan.preservedIds)||q.some(r=>r.status!=='ACTIVE')||JSON.stringify(t.map(r=>r.id))!==JSON.stringify(plan.requiredTopicIds)||domainCount!==6)fail('Post-commit counts/identities changed. Cleanup committed; preserve backup and investigate without retry.');
    report.postCommit={questions:q.length,topics:t.length,domains:domainCount,pilotIdsVerified:true,obsoleteIdsAbsent:true};
    await verifyUpgradeState(client,manifest,snapshots,'after',false);await assertControlledDeleteState(client,true);await integrity();
  }finally{await client.query('ROLLBACK');}
  report.stage='complete';
}
try { await main(); }
catch(error) { if(report.stage==='commit')report.commitOutcome='UNKNOWN: preserve backup and inspect before any retry'; if(client && !report.committed)try { await client.query('ROLLBACK'); }catch{} const state=error.code??error.cause?.code;report.failure={stage:report.stage,sqlState:/^[0-9A-Z]{5}$/.test(state??'')?state:null,message:report.stage==='postgres-connect'&&state==='28P01'?'PostgreSQL rejected the ccna_phase6a_migrator login. The API uses ccna_phase6a_app; supply only the known existing migrator credential. No password reset or automatic retry performed.':error.cleanupDiagnostic||error instanceof LocalRuntimeError?error.message:'Operation failed; raw driver/tool output and credentials withheld.'};process.exitCode=1; }
finally { if(client)await client.end(); if(output)writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({committed:report.committed,stage:report.stage,report:output?path.join(output,'report.json'):null,databaseOperations:report.databaseOperations,plan:report.planSummary,after:report.after,counts:report.counts,backup:report.backup,deletedHistory:report.deletedHistory,failure:report.failure})); }
