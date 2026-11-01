// Authorized Phase 8A.1 operation only. No env files, role changes, migrations or history deletion.
import { readFileSync, writeFileSync, mkdirSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { policy, LocalRuntimeError, assertWorkspace, preflight, migrationManifest, cleanEnvironment } from '../phase6a-local/policy.mjs';
import { upgradeSnapshots, verifyUpgradeState } from '../phase6a-local/upgrade.mjs';
import { readPack, verifyManifest, validateBindings } from '../../docs/content/ccna-200-301/prepare-pack.mjs';
import { expectedQuestions } from '../../docs/content/ccna-200-301/manual-admin-workflow.browser.mjs';
import { curriculumDomains, mapCurriculumTopics } from '../../artifacts/api-server/src/lib/curriculum-config.ts';
import { cleanupPlan, preservationSet } from './planner.mjs';
import { topicDependencies } from './topic-dependencies.mjs';
const root = realpathSync(process.cwd()), bin='C:/Program Files/PostgreSQL/18/bin';
const report = { phase:'8A.1', committed:false, database:policy.database, stage:'configuration' };
let client, output;
const fail = message => { const error=Error(message);error.cleanupDiagnostic=true;throw error; };
const digest = data => createHash('sha256').update(data).digest('hex');
const tables = ['users','topics','questions','question_options','question_revisions','practice_deliveries','practice_attempts','exam_blueprints','exam_domains','exam_objectives','question_objectives'];
const protectedTables = ['users','question_revisions','practice_deliveries','practice_attempts','exam_blueprints','exam_domains','exam_objectives'];
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
  if (process.argv.slice(2).join(' ') !== '--execute-authorized-cleanup') fail('Only the authorized execution command is supported.');
  assertWorkspace(root,process.cwd(),execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim());
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='03b14526aae448e49eacd602a43bfb0e355aca4d') fail('HEAD changed.');
  verifyManifest(); const p=readPack();
  const bindingBytes=readFileSync(path.join(root,'docs/content/ccna-200-301/manual-runs/1791890147651/bindings.json'));
  if(digest(bindingBytes)!=='65e25113a21999c2d83aca494ff44d60f26add36a5bcf678d2b4e5d75f2430cf') fail('Reviewed actual UUID bindings changed.');
  const bindings=JSON.parse(bindingBytes);validateBindings(p,bindings);
  const expected=expectedQuestions({...p,topicMeta:p.topics,blueprint:{sourceUrl:p.sourceUrl}},bindings);
  let inputText='';for await(const chunk of process.stdin) { inputText+=chunk; if(inputText.length>16000)fail('Oversized private input.'); }
  const input=JSON.parse(inputText); inputText='';
  const env=cleanEnvironment(process.env,'check',{});
  const native=path.join(root,'.local/native-deps/node_modules');env.NODE_PATH=native;
  env.ESBUILD_BINARY_PATH=path.join(native,'.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
  const pgFolder=readdirSync(path.join(root,'node_modules/.pnpm')).find(n=>n.startsWith('pg@'));
  if(!pgFolder)fail('Installed PostgreSQL driver unavailable.');
  const require=createRequire(import.meta.url), {Client}=require(path.join(root,'node_modules/.pnpm',pgFolder,'node_modules/pg'));
  const manifest=migrationManifest(root), snapshots=upgradeSnapshots(root);
  const result=await preflight('upgrade-verify',input,{
    verifyLocalService:()=>execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:15000}),
    createClient:options=>new Client(options),
    upgradeState:(c,phase)=>verifyUpgradeState(c,manifest,snapshots,phase,false),
    onStage:stage=>{report.stage=stage;},
  },{});
  client=result.client; report.identity=result.identity;
  const localRoot=realpathSync(path.join(root,'.local'));
  if(!localRoot.toLowerCase().startsWith(root.toLowerCase()+path.sep))fail('Backup parent escapes the approved workspace.');
  const backupParent=path.join(localRoot,'phase8a-cleanup');mkdirSync(backupParent,{recursive:true});
  if(realpathSync(backupParent).toLowerCase()!==backupParent.toLowerCase())fail('Backup parent is redirected; stop.');
  const candidate=path.join(backupParent,new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(candidate); // Refuse existing paths; never overwrite a prior backup/report.
  output=candidate;
  const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',env}).match(/S-1-[0-9-]+/)?.[0];
  if(!sid)fail('Cannot protect backup directory.');
  execFileSync('icacls.exe',[output,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{env,stdio:'pipe',timeout:15000});
  report.stage='transaction-and-preservation';
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='180s'");
  await client.query('LOCK TABLE '+tables.map(t=>'public.'+t).join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  const before=await readState();report.stage='verify-pilot-preservation';
  const preserved=preservationSet(expected,before.questions);
  const plan=cleanupPlan(preserved,before.questions,before.topics,before.dependencies);
  const unexpectedIncoming=(await client.query("SELECT c.conname FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND c.confrelid IN ('public.questions'::regclass,'public.topics'::regclass) AND (n.nspname<>'public' OR NOT(child.relname=ANY($1::text[])))",[tables])).rows;
  if(unexpectedIncoming.length)fail('Unreviewed incoming foreign-key dependencies; stop.');
  const deletionTriggers=(await client.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D' AND (tgtype & 8)=8 AND tgrelid IN ('public.questions'::regclass,'public.topics'::regclass,'public.question_options'::regclass,'public.question_objectives'::regclass)")).rows;
  if(deletionTriggers.length)fail('Unreviewed content DELETE triggers; stop.');
  report.before={questions:before.questions.length,topics:before.topics.length,published:before.questions.filter(q=>q.status==='ACTIVE').length,drafts:before.questions.filter(q=>q.status==='DISABLED').length};
  report.plan=plan;
  await integrity();
  const domains=(await client.query('SELECT code,name,weight_percent AS "weightPercent" FROM public.exam_domains WHERE blueprint_id=$1 ORDER BY code',[bindings.blueprintId])).rows;
  if(JSON.stringify(domains)!==JSON.stringify(p.domains.map(d=>({code:d.code,name:d.name,weightPercent:d.weightPercent}))))fail('Pilot blueprint official domains differ from the reviewed source.');
  report.curriculum={domains:curriculumDomains.length,chapters:curriculumDomains.flatMap(d=>d.sections.flatMap(s=>s.chapters)).length};
  if(report.curriculum.domains!==6 || report.curriculum.chapters!==33)fail('Curriculum configuration changed.');
  const pilotIds=preserved.map(q=>q.id), pilotHash=digest(JSON.stringify(preserved));
  const pilotOptions=await fingerprint('question_options','WHERE t.question_id=ANY($1::uuid[])',[pilotIds]);
  const pilotMappings=await fingerprint('question_objectives','WHERE t.question_id=ANY($1::uuid[])',[pilotIds]);
  const pilotTopics=await fingerprint('topics','WHERE t.id=ANY($1::uuid[])',[plan.requiredTopicIds]);
  const assignments=(await client.query('SELECT m.question_id AS "questionId",m.blueprint_id AS "blueprintId",m.is_primary AS "isPrimary",o.code FROM public.question_objectives m JOIN public.exam_objectives o ON o.id=m.objective_id AND o.blueprint_id=m.blueprint_id WHERE m.question_id=ANY($1::uuid[])',[pilotIds])).rows;
  for(let i=0;i<preserved.length;i++)if(assignments.filter(a=>a.questionId===preserved[i].id&&a.blueprintId===bindings.blueprintId&&a.isPrimary&&a.code===expected[i].objective).length!==1)fail('Pilot primary objective differs from original reviewed import.');
  const historyHashes={};for(const table of protectedTables)historyHashes[table]=await fingerprint(table);
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
  report.stage='cleanup';
  const ids=plan.deleteQuestionIds;
  await client.query('DELETE FROM public.question_objectives WHERE question_id=ANY($1::uuid[])',[ids]);
  const deletedQuestions=await client.query('DELETE FROM public.questions WHERE id=ANY($1::uuid[]) RETURNING id',[ids]);
  const deletedTopics=await client.query('DELETE FROM public.topics WHERE id=ANY($1::uuid[]) RETURNING id',[plan.deleteTopicIds]);
  const disabledQuestions=await client.query("UPDATE public.questions SET status='DISABLED' WHERE id=ANY($1::uuid[]) AND status='ACTIVE' RETURNING id",[plan.disableQuestionIds]);
  const disabledTopics=await client.query("UPDATE public.topics SET status='DISABLED' WHERE id=ANY($1::uuid[]) AND status='ACTIVE' RETURNING id",[plan.disableTopicIds]);
  if(deletedQuestions.rowCount!==ids.length || deletedTopics.rowCount!==plan.deleteTopicIds.length)fail('Deletion set changed.');
  report.stage='precommit-verification';
  const after=await readState();report.stage='precommit-verification';
  const retained=preservationSet(expected,after.questions);
  if(digest(JSON.stringify(retained))!==pilotHash || await fingerprint('question_options','WHERE t.question_id=ANY($1::uuid[])',[pilotIds])!==pilotOptions || await fingerprint('question_objectives','WHERE t.question_id=ANY($1::uuid[])',[pilotIds])!==pilotMappings)fail('Original pilot content/status/IDs/mappings changed; rollback.');
  if(await fingerprint('topics','WHERE t.id=ANY($1::uuid[])',[plan.requiredTopicIds])!==pilotTopics)fail('Required pilot topics changed; rollback.');
  for(const table of protectedTables)if(await fingerprint(table)!==historyHashes[table])fail('Protected history or users changed; rollback.');
  if(JSON.stringify((await client.query('SELECT last_value,is_called FROM public.question_code_seq')).rows)!==JSON.stringify(sequence))fail('Question sequence changed.');
  await verifyUpgradeState(client,manifest,snapshots,'after',false);
  await integrity();await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  const oldIds=new Set([...plan.deleteQuestionIds,...plan.disableQuestionIds]);
  if(after.questions.some(q=>oldIds.has(q.id)&&q.status==='ACTIVE'))fail('Confirmed active legacy question remains.');
  report.after={questions:after.questions.length,topics:after.topics.length,preservedPilotQuestions:retained.length,published:after.questions.filter(q=>q.status==='ACTIVE').length,drafts:after.questions.filter(q=>q.status==='DISABLED').length,deletedQuestions:deletedQuestions.rowCount,deletedTopics:deletedTopics.rowCount,disabledHistoryProtectedQuestions:disabledQuestions.rowCount,disabledHistoryProtectedTopics:disabledTopics.rowCount};
  const eligible=after.questions.filter(q=>q.status==='ACTIVE'&&after.topics.some(t=>t.id===q.topicId&&t.status==='ACTIVE'));
  const mapped=mapCurriculumTopics(after.topics.filter(t=>t.status==='ACTIVE').map(t=>({...t,questionCount:eligible.filter(q=>q.topicId===t.id).length})));
  report.counts={practiceEligible:eligible.length,mappedPublished:mapped.mapped.reduce((n,t)=>n+t.questionCount,0),unmappedPublished:[...mapped.unmapped,...mapped.ambiguous].reduce((n,t)=>n+t.questionCount,0)};
  report.integrity={orphans:0,pilotUnchanged:true,historyAndUsersUnchanged:true,sequenceUnchanged:true,ledgerAndSchemaUnchanged:true};
  // Persist evidence before COMMIT so even a lost acknowledgement has an exact recovery record.
  writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  report.stage='commit';await client.query('COMMIT');report.committed=true;report.stage='complete';
}
try { await main(); }
catch(error) { if(report.stage==='commit')report.commitOutcome='UNKNOWN: preserve backup and inspect before any retry'; if(client && !report.committed)try { await client.query('ROLLBACK'); }catch{} report.failure={stage:report.stage,sqlState:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:null,message:report.stage==='postgres-connect'&&error.code==='28P01'?'PostgreSQL rejected the ccna_phase6a_migrator login. The API uses ccna_phase6a_app; supply only the known existing migrator credential. No password reset or automatic retry performed.':error.cleanupDiagnostic||error instanceof LocalRuntimeError?error.message:'Operation failed; raw driver/tool output and credentials withheld.'};process.exitCode=1; }
finally { if(client)await client.end(); if(output)writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({committed:report.committed,stage:report.stage,report:output?path.join(output,'report.json'):null,after:report.after,counts:report.counts,failure:report.failure})); }
