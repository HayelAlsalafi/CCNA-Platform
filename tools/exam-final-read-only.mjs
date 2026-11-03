// Final SELECT-only baseline/fingerprint check. Kept outside the rehearsed tool bundle.
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {preparedActivation} from './exam-activation/activation.mjs';
import {inspectReadiness} from './exam-activation/readiness.mjs';
import {validateInput,connection} from './phase6a-local/policy.mjs';
import {rowProof} from './question-bank-upgrade-core.mjs';
import {readSequences} from './study-activation/activation.mjs';
import {protectOperatorFolder,sterileEnvironment} from './question-bank-disposable-access.mjs';
let client,stage='offline-final-evidence';
try {
 assert.equal(process.argv.length,5);assert.equal(process.argv[2],'--verify');const root=realpathSync(process.cwd());
 assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'848dfadf79397d0cc71e617ef76195fe2987bbf4');
 const plan=preparedActivation(root,process.argv[3],process.argv[4]);
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
 const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
 const req=createRequire(path.join(root,'lib/db/package.json'));client=new(req('pg').Client)({...connection(config),application_name:'ccna-exam-final-select-only',options:'-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000'});client.on('error',()=>{});
 stage='main-read-only-connect';await client.connect();
 const result=await inspectReadiness(client,config,{...plan,manifest:plan.manifest.slice(0,16)},root,async baseline=>{
  stage='main-read-only-fingerprints';const proof=await rowProof(client,Object.keys(plan.report.rowProof).sort(),plan.baseline);assert.deepEqual(proof,plan.report.rowProof,'Main differs from backup');assert.deepEqual(await readSequences(client),plan.report.sequences,'Sequences differ from backup');
  return {stage:'complete',classification:'VERIFIED',identity:baseline.identity,ledgerEntries:baseline.ledgerEntries,tables:Object.keys(proof).length,originalFingerprintsMatched:Object.keys(proof).length,securityVerified:true,examObjectsAbsent:baseline.examObjectsAbsent,backupSha256:plan.report.backup.sha256,rehearsalReceiptHash:plan.rehearsalHash,toolingHash:plan.toolingHash,databaseWrites:0,migrationExecuted:false,servicesChanged:false};
 });
 const folder=path.join(root,'.local/exam-0017-final-read-only',randomUUID());mkdirSync(folder,{recursive:true});protectOperatorFolder(folder,sterileEnvironment());result.report=path.join(folder,'verification.json');writeFileSync(result.report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
} catch(e){console.log(JSON.stringify({stage,classification:'BLOCKED',databaseWrites:0,migrationExecuted:false,failure:{sqlState:/^[0-9A-Z]{5}$/.test(e.code??e.cause?.code??'')?(e.code??e.cause.code):null,message:'Final read-only verification stopped. Raw diagnostics, credentials and records withheld; no automatic retry.'}}));process.exitCode=1;}
finally {if(client)await client.end().catch(()=>{});}
