// SELECT-only diagnosis. Never imports or invokes either cleanup executor.
import {readFileSync,writeFileSync,mkdirSync,realpathSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {policy,LocalRuntimeError,assertWorkspace,preflight,migrationManifest,cleanEnvironment} from '../phase6a-local/policy.mjs';
import {upgradeSnapshots,verifyUpgradeState} from '../phase6a-local/upgrade.mjs';
import {readPack,verifyManifest,validateBindings} from '../../docs/content/ccna-200-301/prepare-pack.mjs';
import {expectedQuestions} from '../../docs/content/ccna-200-301/manual-admin-workflow.browser.mjs';
import {preservationSet} from './planner.mjs';
import {reviewedInventory,reviewedProvenanceAmendments,finalPlan,decodeArchiveTables,disposableDifferences,verifyDisposableOwnership} from './final-planner.mjs';
import {safeDifference,expectedPilotEvidence,archivalPilotEvidence} from './provenance-diagnostics.mjs';
import {sprint7QuestionIds,sprint7TopicIds} from '../../artifacts/api-server/src/lib/pilot-content-protection.ts';
const digest=data=>createHash('sha256').update(data).digest('hex');
const root=realpathSync(process.cwd()),report={operation:'SELECT-only provenance diagnosis',databaseWrites:0,cleanupExecuted:false,stage:'workspace'};
let client,output;
const fail=message=>{const e=new LocalRuntimeError(message);throw e;};
try{
  if(process.argv.length!==2)fail('No operation flags or target overrides accepted.');
  assertWorkspace(root,process.cwd(),execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim());
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='03b14526aae448e49eacd602a43bfb0e355aca4d')fail('HEAD changed.');
  verifyManifest();const pack=readPack(),inventory=reviewedInventory(),manifest=migrationManifest(root),snapshots=upgradeSnapshots(root);
  const bindingBytes=readFileSync(path.join(root,'docs/content/ccna-200-301/manual-runs/1791890147651/bindings.json'));
  if(digest(bindingBytes)!=='65e25113a21999c2d83aca494ff44d60f26add36a5bcf678d2b4e5d75f2430cf')fail('Verified pilot bindings changed.');
  const bindings=JSON.parse(bindingBytes);validateBindings(pack,bindings);
  const expected=expectedQuestions({...pack,topicMeta:pack.topics,blueprint:{sourceUrl:pack.sourceUrl}},bindings);
  const archive=path.join(root,'.local/phase8a-cleanup/2026-10-13T15-59-16-134Z/before-cleanup.dump');
  if(digest(readFileSync(archive))!==inventory.sourceArchiveHash)fail('Verified provenance archive changed.');
  const env=cleanEnvironment(process.env,'check',{});
  const archived=decodeArchiveTables(execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',['--file=-',archive],{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,windowsHide:true}));
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>16000)fail('Oversized private input.');}const input=JSON.parse(raw);raw='';
  const pgFolder=readdirSync(path.join(root,'node_modules/.pnpm')).find(n=>n.startsWith('pg@'));if(!pgFolder)fail('Installed PostgreSQL driver missing.');
  const require=createRequire(import.meta.url),{Client}=require(path.join(root,'node_modules/.pnpm',pgFolder,'node_modules/pg'));
  const checked=await preflight('upgrade-verify',input,{
    verifyLocalService:()=>execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:15000,windowsHide:true}),
    createClient:options=>new Client(options),upgradeState:(c,phase)=>verifyUpgradeState(c,manifest.slice(0,6),snapshots,phase,false),onStage:stage=>{report.stage=stage;},
  },{});client=checked.client;report.identity=checked.identity;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL TimeZone='UTC'");
  report.stage='read-only-provenance-comparison';
  const tables=['questions','topics','question_options','question_objectives','question_revisions','practice_deliveries','practice_attempts'],current={};
  for(const table of tables)current[table]=(await client.query('SELECT to_jsonb(t) AS row FROM public.'+table+' t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row);
  const questions=current.questions.map(q=>({...q,topicId:q.topic_id,questionCode:q.question_code,imageKey:q.image_key,referenceNotes:q.reference_notes,options:current.question_options.filter(o=>o.question_id===q.id).map(o=>({optionKey:o.option_key,text:o.text,isCorrect:o.is_correct}))}));
  const preserved=preservationSet(expected,questions),plan=finalPlan(preserved,questions,current.topics,inventory);
  if(JSON.stringify(plan.preservedIds)!==JSON.stringify([...sprint7QuestionIds].sort())||JSON.stringify(plan.requiredTopicIds)!==JSON.stringify([...sprint7TopicIds].sort()))fail('Independent pilot UUID baseline differs.');
  report.pilot={questions:preserved.length,topics:plan.requiredTopicIds.length,allQuestionsPublished:preserved.every(q=>q.status==='ACTIVE'),allRequiredTopicsActive:current.topics.filter(t=>plan.requiredTopicIds.includes(t.id)).every(t=>t.status==='ACTIVE'),content:expectedPilotEvidence(expected,preserved),originalBackup:archivalPilotEvidence(plan.preservedIds,current,archived)};
  report.deletionSet={questions:plan.deleteQuestionIds,topics:plan.deleteTopicIds,protectedQuestionOverlap:0,requiredTopicOverlap:0};
  report.originalBackupDifferences=disposableDifferences(plan,current,archived,inventory).map(safeDifference);
  const differences=disposableDifferences(plan,current,archived,inventory,reviewedProvenanceAmendments());
  report.differences=differences.map(safeDifference);report.differenceCount=differences.length;
  report.changedQuestionIds=[...new Set(differences.filter(d=>d.table==='questions').map(d=>d.id))].sort();
  report.before={questions:current.questions.length,topics:current.topics.length};
  report.sourceArchiveSha256=inventory.sourceArchiveHash;
  if(!differences.length){report.ownership=verifyDisposableOwnership(plan,current,archived,inventory);report.guardWouldPass=true;}else report.guardWouldPass=false;
  await client.query('ROLLBACK');report.stage='complete';
  const parent=path.join(root,'.local/final-legacy-diagnosis');mkdirSync(parent,{recursive:true});if(realpathSync(parent).toLowerCase()!==parent.toLowerCase())fail('Diagnostic directory redirected.');
  output=path.join(parent,new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(output);
  const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{env,encoding:'utf8'}).match(/S-1-[0-9-]+/)?.[0];if(!sid)fail('Cannot protect diagnostic report.');
  execFileSync('icacls.exe',[output,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{env,stdio:'pipe',timeout:15000});
  writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
}catch(error){if(client)try{await client.query('ROLLBACK');}catch{}const code=error.code??error.cause?.code;report.failure={sqlState:/^[0-9A-Z]{5}$/.test(code??'')?code:null,message:error instanceof LocalRuntimeError||error.cleanupDiagnostic?error.message:'Diagnostic failed; raw database/credential/content details withheld.'};process.exitCode=1;
}finally{if(client)await client.end();console.log(JSON.stringify({stage:report.stage,databaseWrites:0,cleanupExecuted:false,report:output?path.join(output,'report.json'):null,differenceCount:report.differenceCount,changedQuestionIds:report.changedQuestionIds,differences:report.differences,pilotVerified:report.pilot?.content.every(p=>p.matched),protectedOverlap:report.deletionSet?0:undefined,failure:report.failure}));}
