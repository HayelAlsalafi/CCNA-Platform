import {applicationQuiescenceScript} from '../workspace-root.mjs';
import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// Only the explicit hidden-prompt wrapper may supply main credentials on stdin.
import assert from 'node:assert/strict';
import { realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { executionIntent, preparedActivation, approvedBackup, stageStudy, promoteStudy, verifyLockedBaseline, verifyActivated, studyGrants } from './activation.mjs';
import { inspectReadiness } from './readiness.mjs';
import { validateInput, connection, migrationManifest, serviceFailureInvariant } from '../phase6a-local/policy.mjs';
import { transactionClient } from '../lesson-activation/transaction-client.mjs';
import { sterileEnvironment, protectOperatorFolder } from '../question-bank-disposable-access.mjs';
import { withReadOnlyUtc } from './read-only-utc.mjs';
let client, reportPath, stage='offline-approval-gates',commitOutcome='NOT_COMMITTED',sourcePromoted=false,sourcePromotionAttempted=false,migrationAttempted=false,transactionOpen=false;
let evidence={};
const receipt = extra => ({...evidence,stage,committed:commitOutcome==='COMMITTED',commitOutcome,sourcePromoted,sourcePromotionAttempted,migrationAttempted,...extra,report:reportPath??null});
const write = result => {if(reportPath)writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');};
try {
  const args=process.argv.slice(2),planOnly=args.length===1&&args[0]==='--plan';
  if(!planOnly)executionIntent(args);
  const root=realpathSync(process.cwd()),env=sterileEnvironment();
  assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8',env}).trim(),'main');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env}).trim(),'3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
  const plan=preparedActivation(root);
  evidence={target:plan.target,proposal:plan.proposal,backup:plan.report.backup,backupReceipt:approvedBackup.receipt,backupArchiveVerified:true,rehearsalReused:true,freshArchiveRestorationRepeated:false,baselineLedgerEntries:13,baselineTables:19};
  if(planOnly){console.log(JSON.stringify({...evidence,stage:'plan',databaseConnections:0,databaseWrites:0,pending:['0014_interactive_study'],expectedLedgerEntries:14,expectedTables:22,mediaActivation:false}));}
  else {
    stage='installed-postgres-service-identity';
    execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:30000,windowsHide:true});
    stage='application-quiescence';
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',applicationQuiescenceScript()],{env,stdio:'pipe',timeout:30000,windowsHide:true});
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
    const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const require=createRequire(path.join(root,'lib/db/package.json'));
    const {drizzle}=require('drizzle-orm/node-postgres'),{migrate}=require('drizzle-orm/node-postgres/migrator');
    client=new (require('pg').Client)({...connection(config),application_name:'ccna-approved-study-0014-activation'});
    client.on('error',()=>{});
    stage='main-read-only-readiness';
    await client.connect();
    await inspectReadiness(client,config,{...plan,manifest:plan.manifest.slice(0,13)},root);
    const run=path.join(plan.folder,'study-activation-'+randomUUID());mkdirSync(run);protectOperatorFolder(run,env);
    reportPath=path.join(run,'activation.json');
    write(receipt({}));
    const migrations=path.join(run,'migrations');stageStudy(root,migrations,plan);
    stage='locked-main-backup-verification';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');transactionOpen=true;
    await client.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'");
    assert.equal((await client.query('SELECT pg_try_advisory_xact_lock(7130014) AS locked')).rows[0].locked,true,'Another controlled activation is running');
    const tables=Object.keys(plan.report.rowProof).sort();assert(tables.every(t=>/^[a-z_]+$/.test(t)));
    await client.query('LOCK TABLE '+tables.map(t=>'public."'+t+'"').join(',')+', drizzle.__drizzle_migrations IN SHARE MODE');
    await verifyLockedBaseline(client,config,root,plan);
    stage='official-drizzle-0014-only';migrationAttempted=true;write(receipt({}));
    await migrate(drizzle(transactionClient(client)),{migrationsFolder:migrations});
    stage='exact-three-study-table-grants';
    await client.query(studyGrants);
    stage='precommit-schema-security-and-data-verification';
    const verified=await verifyActivated(client,config,root,plan);
    stage='reviewed-source-promotion';
    preparedActivation(root); // Recheck evidence, sources and freshness before filesystem changes.
    sourcePromotionAttempted=true;write(receipt({}));
    promoteStudy(root,plan);sourcePromoted=true;
    assert.deepEqual(migrationManifest(root),plan.manifest,'Promoted startup chain mismatch');
    await verifyActivated(client,config,root,plan,true);
    stage='verified-before-commit';write(receipt({verified}));
    stage='commit';commitOutcome='UNKNOWN';
    await client.query('COMMIT');transactionOpen=false;commitOutcome='COMMITTED';
    stage='postcommit-read-only-verification';write(receipt({verified}));
    const postcommit=await withReadOnlyUtc(client,()=>verifyActivated(client,config,root,plan,true));
    stage='complete';
    const result=receipt({...postcommit,ledgerEntries:14,tables:22,studyActivated:true,mediaStorageActivated:false,existingDataWrites:0,sequenceEffects:{questionCode:'unchanged',drizzleLedger:'13 to 14'},databaseVerification:'PASS',applicationVerification:'PENDING',classification:'PARTIAL'});
    write(result);console.log(JSON.stringify(result));
  }
} catch(error) {
  if(client&&transactionOpen)await client.query('ROLLBACK').catch(()=>{});
  const code=error?.code??error?.cause?.code;
  const candidate=String(error?.stderr??'').match(/Invariant: ([a-z-]+)/)?.[1];
  const invariant=stage==='installed-postgres-service-identity'?serviceFailureInvariant(error):stage==='application-quiescence'&&['application-listeners','guarded-application-processes'].includes(candidate)?candidate:stage;
  const result=receipt({classification:commitOutcome==='NOT_COMMITTED'?'BLOCKED':'PARTIAL',ledgerSequenceMayHaveAdvanced:migrationAttempted,failure:{invariant,sqlState:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:null,message:error?.code==='LOCAL_EVIDENCE_REQUIRED'?'Approved local evidence is missing. See docs/maintenance/milestone-local-evidence.md; restore it locally without bypassing guards.':'Stopped; credentials, rows and raw driver output withheld. Preserve receipts; do not retry automatically.'}});
  try{write(result);}catch{}
  console.log(JSON.stringify(result));process.exitCode=1;
} finally {if(client)await client.end().catch(()=>{});}
