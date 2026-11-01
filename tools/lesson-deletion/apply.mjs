import {applicationQuiescenceScript} from '../workspace-root.mjs';
// Dedicated operator entrypoint. --plan is offline; apply requires separate approval.
import assert from 'node:assert/strict';
import {realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sourcePlan,offlinePlan,preparedActivation,assertEvidenceUnchanged,stageDeletion,promoteDeletion,verifyLockedBaseline,verifyActivated} from './activation.mjs';
import {inspectReadiness} from './readiness.mjs';
import {validateInput,connection} from '../phase6a-local/policy.mjs';
import {sterileEnvironment,protectOperatorFolder} from '../question-bank-disposable-access.mjs';
import {transactionClient} from '../lesson-activation/transaction-client.mjs';
import {withReadOnlyUtc} from '../study-activation/read-only-utc.mjs';
export function executionIntent(args) {
  assert.equal(args.length,6);assert.deepEqual(args.slice(0,3),['--apply','--confirm-reviewed-lesson-deletion','--backup']);assert.equal(args[4],'--rehearsal');
  assert(args[3]&&args[5]);return {backup:args[3],rehearsal:args[5]};
}
export async function main(args=process.argv.slice(2)) {
  let client,reportPath,stage='offline-source-gates',transactionOpen=false,migrationAttempted=false,sourcePromotionAttempted=false,sourcePromoted=false,commitOutcome='NOT_COMMITTED';
  let evidence={};
  const receipt=extra=>({...evidence,stage,commitOutcome,committed:commitOutcome==='COMMITTED',migrationAttempted,sourcePromotionAttempted,sourcePromoted,...extra,report:reportPath??null});
  const write=result=>{if(reportPath)writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');};
  try {
    const root=realpathSync(process.cwd()),env=sterileEnvironment();
    assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8',env}).trim(),'main');
    assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env}).trim(),'3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
    if(args.length===1&&args[0]==='--plan'){
      console.log(JSON.stringify({stage:'plan',...offlinePlan(root),databaseWrites:0,approvalRequired:true}));return;
    }
    const intent=executionIntent(args),plan=preparedActivation(root,intent.backup,intent.rehearsal);
    evidence={target:plan.target,proposal:plan.proposal,backupSha256:plan.report.backup.sha256,backupReceiptHash:plan.backupReceiptHash,rehearsalHash:plan.rehearsalHash};
    stage='installed-service-identity';execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:30000,windowsHide:true});
    stage='application-quiescence';
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',applicationQuiescenceScript()],{env,stdio:'pipe',timeout:30000,windowsHide:true});
    const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
    const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const req=createRequire(path.join(root,'lib/db/package.json')),{drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');
    client=new(req('pg').Client)({...connection(config),application_name:'ccna-approved-lesson-delete-0016-activation'});client.on('error',()=>{});
    stage='main-read-only-readiness';await client.connect();await inspectReadiness(client,config,{...plan,manifest:plan.manifest.slice(0,15)},root);
    const run=path.join(plan.folder,'lesson-delete-activation-'+randomUUID());mkdirSync(run);protectOperatorFolder(run,env);reportPath=path.join(run,'activation.json');write(receipt({}));
    const staging=path.join(run,'migrations');stageDeletion(root,staging,plan);
    stage='locked-baseline';await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');transactionOpen=true;
    await client.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'");
    assert.equal((await client.query('SELECT pg_try_advisory_xact_lock(7130016) AS locked')).rows[0].locked,true);
    const tables=Object.keys(plan.report.rowProof).sort();assert(tables.length===22&&tables.every(t=>/^[a-z_]+$/.test(t)));
    await client.query('LOCK TABLE '+tables.map(t=>'public."'+t+'"').join(',')+', drizzle.__drizzle_migrations IN SHARE MODE');
    await verifyLockedBaseline(client,config,root,plan);assertEvidenceUnchanged(root,plan);
    stage='dedicated-drizzle-0016';migrationAttempted=true;write(receipt({}));
    await migrate(drizzle(transactionClient(client)),{migrationsFolder:staging,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});
    stage='precommit-verification';const verified=await verifyActivated(client,config,root,plan);
    assertEvidenceUnchanged(root,plan);
    stage='source-promotion';sourcePromotionAttempted=true;write(receipt({}));promoteDeletion(root,plan);sourcePromoted=true;
    await verifyActivated(client,config,root,plan,true);write(receipt({verified}));
    stage='commit';commitOutcome='UNKNOWN';await client.query('COMMIT');transactionOpen=false;commitOutcome='COMMITTED';
    stage='postcommit-read-only-utc';write(receipt({}));
    const postcommit=await withReadOnlyUtc(client,()=>verifyActivated(client,config,root,plan,true));
    stage='complete';const result=receipt({...postcommit,classification:'DATABASE_VERIFIED',applicationVerification:'PENDING',servicesChanged:false,storageConfiguredByExecutor:false});write(result);console.log(JSON.stringify(result));
  } catch(error) {
    if(client&&transactionOpen)await client.query('ROLLBACK').catch(()=>{});
    const code=error?.code??error?.cause?.code;
    const result=receipt({classification:commitOutcome==='NOT_COMMITTED'?'BLOCKED':'PARTIAL',ledgerSequenceMayHaveAdvanced:migrationAttempted,failure:{invariant:stage,sqlState:/^[A-Z0-9]{5}$/.test(code??'')?code:null,message:error?.code==='LOCAL_EVIDENCE_REQUIRED'?'Approved local evidence is missing. See docs/maintenance/milestone-local-evidence.md; restore it locally without bypassing guards.':'Stopped. Preserve receipts; no automatic retry, source repair or sequence reset. Raw diagnostics withheld.'}});
    try{write(result);}catch{}console.log(JSON.stringify(result));process.exitCode=1;
  } finally {if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
