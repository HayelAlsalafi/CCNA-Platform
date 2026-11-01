// SELECT-only role authentication diagnosis. Never imports the cleanup executor.
import { createRequire } from 'node:module';
import { readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { policy, assertWorkspace, assertIdentity, connection, cleanEnvironment } from '../phase6a-local/policy.mjs';
export function authenticationInput(input) {
  const keys=['host','port','database','role','password','systemIdentifier'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!keys.includes(k)) ||
    input.host!==policy.host || input.port!==policy.port || input.database!==policy.database ||
    ![policy.appRole,policy.migrationRole].includes(input.role) || input.systemIdentifier!==policy.upgradeSystemIdentifier ||
    typeof input.password!=='string' || !input.password.length || input.password.includes('\0')) throw Error('Authentication profile mismatch.');
  return Object.freeze({...input});
}
export async function diagnoseAuthentication(input, createClient) {
  const config=authenticationInput(input), client=createClient(connection(config));
  client.on?.('error',()=>{}); // Query/connect promises provide sanitized failures.
  const result={role:config.role,host:policy.host,port:policy.port,database:policy.database,authenticated:false,authenticationMechanism:'NOT_OBSERVED',databaseWrites:0,stage:'connect'};
  // Observe only the protocol request TYPE, never challenge/response/password data.
  client.connection?.on('authenticationSASL',message=>{result.authenticationMechanism=message?.mechanisms?.includes('SCRAM-SHA-256')?'SCRAM-SHA-256':'OTHER_SASL';});
  client.connection?.on('authenticationMD5Password',()=>{result.authenticationMechanism='MD5';});
  client.connection?.on('authenticationCleartextPassword',()=>{result.authenticationMechanism='PASSWORD';});
  try {
    await client.connect();result.authenticated=true;result.stage='read-only-identity';
    await client.query('BEGIN READ ONLY');
    const identity=(await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]?.identity;
    assertIdentity(identity,config);result.identity=identity;
    result.stage='role-metadata';
    result.roles=(await client.query('SELECT rolname,rolcanlogin,rolvaliduntil,(rolvaliduntil IS NOT NULL AND rolvaliduntil<=CURRENT_TIMESTAMP) AS expired FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[[policy.appRole,policy.migrationRole]])).rows;
    await client.query('ROLLBACK');result.stage='complete';
  } catch(error) {
    if(result.authenticated)try { await client.query('ROLLBACK'); } catch {}
    result.sqlState=/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:null;
    result.error='Authentication/identity check failed; raw server and credential details withheld.';
  } finally { await client.end(); }
  return result;
}
async function main() {
  const root=realpathSync(process.cwd());
  assertWorkspace(root,root,execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim());
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!=='03b14526aae448e49eacd602a43bfb0e355aca4d')throw Error('HEAD mismatch.');
  let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>16000)throw Error('Private input too large.');}
  const input=authenticationInput(JSON.parse(text));text='';
  const env=cleanEnvironment(process.env,'check',{});
  execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1')],{env,stdio:'pipe',timeout:15000});
  const pg=readdirSync(path.join(root,'node_modules/.pnpm')).find(p=>p.startsWith('pg@'));
  if(!pg)throw Error('Installed PostgreSQL driver unavailable.');
  const {Client}=createRequire(import.meta.url)(path.join(root,'node_modules/.pnpm',pg,'node_modules/pg'));
  const result=await diagnoseAuthentication(input,options=>new Client(options));
  console.log(JSON.stringify(result));if(result.stage!=='complete')process.exitCode=1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.log(JSON.stringify({authenticated:false,stage:'configuration/service-check',databaseWrites:0,error:'Diagnostic could not proceed; raw details withheld.'}));process.exitCode=1;
});
