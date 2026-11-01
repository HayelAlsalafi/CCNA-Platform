// SELECT-only diagnosis of a stopped activation. No apply, grant or backup mode.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {preparedPlan,verifyFreshBackup} from './staging.mjs';
import {verifyRehearsal} from './activation.mjs';
import {inspectReadiness} from './readiness.mjs';
import {rowProof} from '../question-bank-upgrade-core.mjs';
import {connection,validateInput} from '../phase6a-local/policy.mjs';

export function compareState(expected,actual){
 const tables=Object.keys(expected.rowProof).sort();
 assert.deepEqual(Object.keys(actual.rowProof).sort(),tables);
 const tableDifferences=tables.filter(name=>!isDeepStrictEqual(expected.rowProof[name],actual.rowProof[name])).map(table=>({table,expected:expected.rowProof[table],actual:actual.rowProof[table]}));
 const sequenceDifferences=Object.keys(expected.sequences).filter(name=>!isDeepStrictEqual(expected.sequences[name],actual.sequences[name])).map(sequence=>({sequence,expected:expected.sequences[sequence],actual:actual.sequences[sequence]}));
 return {otherDatabaseConnections:actual.otherDatabaseConnections,ledgerMatchesBackup:isDeepStrictEqual(expected.baselineLedger,actual.ledger),tableDifferences,sequenceDifferences};
}
async function main(){
 let client,stage='offline-preflight';
 try{
  assert.deepEqual(process.argv.slice(2),['--diagnose']);
  assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
  const root=realpathSync(process.cwd()),plan=preparedPlan(root),fresh=verifyFreshBackup(root);verifyRehearsal(fresh.folder);
  const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;assert(size<=16384);chunks.push(chunk);}
  const config=validateInput('upgrade-verify',JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const require=createRequire(path.join(root,'lib/db/package.json'));
  stage='postgres-connect';client=new (require('pg').Client)({...connection(config),application_name:'ccna-lesson-stopped-activation-diagnosis'});client.on('error',()=>{});await client.connect();
  stage='read-only-identity-ledger-schema-role-preflight';
  const result=await inspectReadiness(client,config,{...plan,manifest:plan.manifest.slice(0,12)},root,async(readiness,ledger)=>{
   stage='read-only-backup-state-comparison';
   const proof=await rowProof(client,Object.keys(fresh.report.rowProof).sort()),sequences={};
   for(const qualified of ['public.question_code_seq','drizzle.__drizzle_migrations_id_seq'])sequences[qualified]=(await client.query(`SELECT last_value::text,is_called FROM ${qualified}`)).rows[0];
   const otherDatabaseConnections=(await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n;
   const comparison=compareState(fresh.report,{rowProof:proof,sequences,ledger,otherDatabaseConnections});
   return {stage:'complete',identity:readiness.identity,baselineSchemaMatched:true,lessonObjectsAbsent:true,ledgerEntries:ledger.length,...comparison,databaseWrites:0,migrationExecuted:false,activationRetried:false};
  });
  console.log(JSON.stringify(result));
 }catch(error){
  const code=error?.code??error?.cause?.code;
  console.log(JSON.stringify({stage,databaseWrites:0,migrationExecuted:false,activationRetried:false,failure:{sqlState:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:null,message:'Read-only diagnosis stopped; credentials, row data and raw driver output withheld.'}}));process.exitCode=1;
 }finally{if(client)await client.end().catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
