// ONE diagnostic connection, READ ONLY snapshot; no activation/repair entry point.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { policy, validateInput, connection, assertIdentity, migrationManifest, assertLedger } from '../phase6a-local/policy.mjs';
import { approvedBackup, verifyActivated, readSequences } from './activation.mjs';
import { assertStudyProposal } from './proposal.mjs';
import { sterileEnvironment } from '../question-bank-disposable-access.mjs';

const activationRelative='.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/study-activation-d93ef695-b3c7-4dda-b74f-1601809a8355/activation.json';
const activationHash='ddc23d8ea914940ea7df6a6f31d097bd815803686e0daebdc1b706132c6e7c95';
const digest=b=>createHash('sha256').update(b).digest('hex');
let raw,stage='offline-source-and-receipts',reportPath,identityVerified=false,opened=false;
const result={classification:'INCONCLUSIVE',databaseWrites:0,activationRetried:false,repairsPerformed:false,servicesChanged:false,checks:{}};
const save=()=>{if(reportPath)writeFileSync(reportPath,JSON.stringify({...result,stage},null,2)+'\n');};
const differences=(actual,expected)=>Object.keys(expected).filter(t=>actual?.[t]?.count!==expected[t].count||actual?.[t]?.hash!==expected[t].hash).map(t=>({table:t,expected:expected[t],actual:actual?.[t]??null}));
function selectOnly(client) {
  return {query(query,params){
    const sql=typeof query==='string'?query:query.text;
    assert(/^\s*SELECT\b/i.test(sql),'Diagnostic helper attempted non-SELECT SQL');
    assert(!/;\s*\S/.test(sql),'Multiple diagnostic statements refused');
    return client.query(query,params);
  }};
}
try {
  assert.deepEqual(process.argv.slice(2),['--diagnose']);
  const root=realpathSync(process.cwd()),env=sterileEnvironment();
  assert.equal(root.replaceAll('\\','/').toLowerCase(),policy.root.toLowerCase());
  assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8',env}).trim(),'main');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env}).trim(),'3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
  const manifest=migrationManifest(root);assert.equal(manifest.length,14);assertStudyProposal(root);
  const activationBytes=readFileSync(path.join(root,activationRelative));assert.equal(digest(activationBytes),activationHash,'Activation receipt drift');
  const activation=JSON.parse(activationBytes);
  assert.equal(activation.committed,true);assert.equal(activation.commitOutcome,'COMMITTED');assert.equal(activation.sourcePromoted,true);assert.equal(activation.stage,'postcommit-read-only-verification');
  const backupBytes=readFileSync(path.join(root,approvedBackup.receipt));assert.equal(digest(backupBytes),approvedBackup.receiptHash);
  const backup=JSON.parse(backupBytes);
  assert.equal(digest(readFileSync(backup.backup.path)),approvedBackup.archiveHash);
  assert.equal(Object.keys(backup.rowProof).length,19);
  result.sourceEntries=14;result.backupHashVerified=true;result.activationReceiptHashVerified=true;
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
  const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
  reportPath=path.join(path.dirname(realpathSync(path.join(root,activationRelative))),'postcommit-diagnosis.json');
  assert(!existsSync(reportPath),'The one-pass diagnostic receipt already exists; stop instead of retrying');
  writeFileSync(reportPath,JSON.stringify({...result,stage})+'\n',{flag:'wx'});
  const require=createRequire(path.join(root,'lib/db/package.json'));
  raw=new (require('pg').Client)({...connection(config),application_name:'ccna-study-postcommit-select-only',
    options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=120000'});
  raw.on('error',()=>{});
  stage='read-only-connect';await raw.connect();
  await raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');opened=true;
  const client=selectOnly(raw);
  stage='main-identity';
  const identity=(await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity;
  assertIdentity(identity,config);assert.equal(identity.versionNumber,180006);identityVerified=true;result.identity=identity;
  const owner=(await client.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()')).rows[0].owner;
  assert.equal(owner,policy.migrationRole);
  const settings=(await client.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('TimeZone') AS timezone")).rows[0];
  assert.equal(settings.read_only,'on');assert.equal(settings.isolation,'repeatable read');result.settings=settings;
  stage='ledger';
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertLedger(ledger,manifest);assert.deepEqual(ledger.map(r=>r.id),Array.from({length:14},(_,i)=>i+1));
  result.ledgerEntries=14;result.checks.ledger='PASS';
  stage='role-profile';
  const roles=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname',[[policy.appRole,policy.migrationRole]])).rows;
  assert.equal(roles.length,2);for(const {rolname,rolcanlogin,...flags} of roles){assert.equal(rolcanlogin,true);assert(Object.values(flags).every(v=>v===false));}
  result.checks.roleProfile='PASS';
  stage='original-postcommit-verifier/default-timezone';
  let originalError;
  try {result.originalVerifierResult=await verifyActivated(client,config,root,{report:backup},true);result.checks.originalVerifier='PASS';}
  catch(error){
    if(error?.code!=='ERR_ASSERTION')throw error;
    originalError=error;
    const rowMismatch=error.message.startsWith('Existing rows changed');
    result.originalFailure={subcheck:rowMismatch?'verifyActivated.originalRowFingerprints':'other-assertion',sqlState:null};
    result.checks.originalVerifier='FAILED';
    if(rowMismatch){assert.deepEqual(error.expected,backup.rowProof);result.defaultTimezoneDifferences=differences(error.actual,backup.rowProof);}
  }
  // This SELECT changes only a transaction-local rendering parameter, not stored
  // values or role/database configuration. Same MVCC snapshot; ROLLBACK restores it.
  stage='transaction-local-timezone-control';
  assert.equal((await client.query("SELECT set_config('TimeZone','UTC',true) AS timezone")).rows[0].timezone,'UTC');
  stage='full-verifier/UTC-same-snapshot';
  const verified=await verifyActivated(client,config,root,{report:backup},true);
  result.utcVerifierResult=verified;result.checks.utcVerifier='PASS';
  result.originalCounts=Object.fromEntries(Object.entries(backup.rowProof).map(([t,p])=>[t,p.count]));
  result.originalFingerprintsMatchedInUtc=19;result.utcDifferences=[];
  result.sequences=await readSequences(client);
  result.tableInventory=(await client.query("SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','c') ORDER BY c.relname")).rows;
  assert.equal(result.tableInventory.length,22);
  if(originalError&&result.originalFailure.subcheck==='verifyActivated.originalRowFingerprints'&&settings.timezone!=='UTC'&&result.defaultTimezoneDifferences.length){
    result.classification='VERIFIED';
    result.rootCause='Postcommit transaction omitted transaction-local UTC; timezone-dependent JSON row hashing differed from the UTC backup without stored-data changes.';
  }else if(!originalError){
    result.classification='INCONCLUSIVE';result.rootCause='Database checks pass now, but the original failure did not reproduce; no repair inferred.';
  }else{
    result.classification='INCONCLUSIVE';result.rootCause='UTC verifier passed, but the original assertion was not the confirmed row fingerprint subcheck.';
  }
  await raw.query('ROLLBACK');opened=false;
  stage='complete';result.report=reportPath;save();
  console.log(JSON.stringify({stage,...result,tableInventory:undefined,originalCounts:result.originalCounts}));
}catch(error){
  const code=error?.code??error?.cause?.code;
  result.classification=identityVerified&&code==='ERR_ASSERTION'?'INCONSISTENT':'INCONCLUSIVE';
  result.failure={subcheck:stage,sqlState:typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?code:null,message:'Diagnostic stopped; private rows, credentials and raw driver output withheld. Do not retry automatically.'};
  if(stage==='full-verifier/UTC-same-snapshot'&&error?.message?.startsWith('Existing rows changed'))result.utcDifferences=differences(error.actual,error.expected);
  result.report=reportPath??null;
  if(raw&&opened){await raw.query('ROLLBACK').catch(()=>{});opened=false;}
  try{save();}catch{}
  console.log(JSON.stringify({stage,...result,tableInventory:undefined}));process.exitCode=1;
}finally{if(raw)await raw.end().catch(()=>{});}
