// Read-only verification only. Never invokes an activation/migrator or grants.
import assert from 'node:assert/strict';
import { readFileSync,realpathSync,mkdirSync,writeFileSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { policy,validateInput,connection,assertIdentity,migrationManifest } from '../phase6a-local/policy.mjs';
import { approvedBackup,verifyActivated,readSequences } from './activation.mjs';
import { withReadOnlyUtc } from './read-only-utc.mjs';
import { sterileEnvironment,protectOperatorFolder } from '../question-bank-disposable-access.mjs';
let raw,stage='offline-preflight',reportPath;
const hash=b=>createHash('sha256').update(b).digest('hex');
try {
  assert.deepEqual(process.argv.slice(2),['--verify']);
  const root=realpathSync(process.cwd()),env=sterileEnvironment();
  assert.equal(root.replaceAll('\\','/').toLowerCase(),policy.root.toLowerCase());
  assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8',env}).trim(),'main');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env}).trim(),'3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
  assert.equal(migrationManifest(root).length,14);
  const receipt=path.join(root,approvedBackup.receipt),bytes=readFileSync(receipt);
  assert.equal(hash(bytes),approvedBackup.receiptHash);
  const backup=JSON.parse(bytes);assert.equal(hash(readFileSync(backup.backup.path)),approvedBackup.archiveHash);
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
  const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const require=createRequire(path.join(root,'lib/db/package.json'));
  raw=new (require('pg').Client)({...connection(config),application_name:'ccna-study-final-read-only-verification',options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=120000'});
  raw.on('error',()=>{});
  stage='read-only-connect';await raw.connect();
  const client={query(query,params){const sql=typeof query==='string'?query:query.text;assert(/^\s*SELECT\b/i.test(sql)&&!/;\s*\S/.test(sql),'Only single SELECT statements permitted');return raw.query(query,params);}};
  stage='fixed-postcommit-verifier';
  const result=await withReadOnlyUtc(raw,async()=>{
    const identity=(await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0].identity;
    assertIdentity(identity,config);assert.equal(identity.versionNumber,180006);
    const settings=(await client.query("SELECT current_setting('TimeZone') AS timezone,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation")).rows[0];
    assert.equal(settings.timezone,'UTC');assert.equal(settings.read_only,'on');
    const verified=await verifyActivated(client,config,root,{report:backup},true);
    return{...verified,identity,settings,sequences:await readSequences(client),originalFingerprintsMatched:19};
  });
  const folder=path.join(path.dirname(realpathSync(receipt)),'final-verification-'+randomUUID());mkdirSync(folder);protectOperatorFolder(folder,env);
  reportPath=path.join(folder,'verification.json');stage='complete';
  const report={stage,...result,databaseWrites:0,migrationExecuted:false,grantsExecuted:false,servicesChanged:false,verifier:'withReadOnlyUtc + unchanged verifyActivated',report:reportPath};
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(error){
  const code=error?.code??error?.cause?.code;
  console.log(JSON.stringify({stage,databaseWrites:0,migrationExecuted:false,report:reportPath??null,failure:{sqlState:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:null,message:'Read-only verification stopped; raw diagnostics and credentials withheld. Do not retry automatically.'}}));process.exitCode=1;
}finally{if(raw)await raw.end().catch(()=>{});}
