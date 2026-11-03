import {assertStudyPrivileges,assertStudyPolicies} from '../study-activation/proposed-runtime-guard.mjs';
import {assertExamPrivileges} from '../exam-policy.mjs';
import {assertLessonPrivileges,assertLessonRevisionGuard,isLessonChain} from '../lesson-activation/policy.mjs';
import {assertCanonicalPrivileges} from "../canonical-chapters-policy.mjs";
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createProbe } from 'node:net';
import { policy, LocalRuntimeError, assertWorkspace, assertIdentity, cleanEnvironment,
  migrationManifest, assertLedger, preflight, safeError, serviceFailureInvariant } from './policy.mjs';
import { upgradeHead, upgradeSnapshots, verifyUpgradeState, executeUpgrade, taxonomyPrivileges } from './upgrade.mjs';
import {assertQuestionBankFunctions} from '../question-bank-policy.mjs';
import { assertControlledDeleteState } from '../phase8a-cleanup/controlled-delete.mjs';
import { verifyRuntimeLedger } from './runtime-ledger.mjs';
import {assertNexusPrivileges} from '../nexus-policy.mjs';
import {assertLearningPrivileges} from '../learning-policy.mjs';
import {loadFrontendDependencies} from './frontend.mjs';

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const dbRequire = createRequire(path.join(root,'lib/db/package.json'));
const scriptsRequire = createRequire(path.join(root,'scripts/package.json'));
const fail = message => { throw new LocalRuntimeError(message); };
function serviceCheck(checkApi=false) {
  try {
    execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/phase6a-local/verify-service.ps1'),...(checkApi?['-CheckApi']:[])],
      { windowsHide:true, stdio:'pipe', env:cleanEnvironment(process.env,'check',{}) });
  } catch (error) {
    // Only emit a known invariant label, never the child command or raw stderr.
    fail('Local service/listener verification failed. Invariant: ' + serviceFailureInvariant(error) + '. Stop.');
  }
}
function setEnvironment(mode, config) {
  const env = cleanEnvironment(process.env, mode, config);
  const native = path.join(root,'.local/native-deps/node_modules');
  const binary = path.join(native,'.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
  if (existsSync(binary)) { env.NODE_PATH=native; env.ESBUILD_BINARY_PATH=binary; }
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env,env);
}
async function portsFree(port) {
  for (const host of ['127.0.0.1','::1']) await new Promise((resolve,reject) => {
    const probe=createProbe();
    probe.once('error',reject); probe.listen(port,host,()=>probe.close(error=>error?reject(error):resolve()));
  });
}
async function runtimePrivileges(client) {
  stage='runtime-controlled-delete-functions';
  const count=migrationManifest(root).length;
  const lessonOnly=isLessonChain(migrationManifest(root));
  if(count>=12)await assertCanonicalPrivileges(client);
  if(count===13){if(lessonOnly){await assertLessonPrivileges(client);await assertLessonRevisionGuard(client,root);}else await assertExamPrivileges(client);}
  if(count===14||count===15||count===16||count===17){await assertLessonPrivileges(client);await assertLessonRevisionGuard(client,root);await assertStudyPrivileges(client,'ccna_phase6a_app');await assertStudyPolicies(client);}
  if(count===17)await assertExamPrivileges(client);
  if(count>=10)await assertQuestionBankFunctions(client,root,count===17||count===13&&!lessonOnly?12:count===10?9:10);
  else await assertControlledDeleteState(client);
  stage='runtime-catalog-privileges';
  const old = (await client.query(`SELECT
    r.rolsuper AS superuser, r.rolcreatedb AS createdb, r.rolcreaterole AS createrole,
    r.rolreplication AS replication, r.rolbypassrls AS bypassrls,
    EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS inherited_membership,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    has_database_privilege(current_user,current_database(),'TEMP') AS temp,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_schema_privilege(current_user,'drizzle','USAGE') AS ledger_access,
    has_table_privilege(current_user,'topics','SELECT') AND has_table_privilege(current_user,'questions','SELECT')
      AND has_table_privilege(current_user,'question_options','SELECT') AS catalog_select,
    has_table_privilege(current_user,'topics','INSERT') AND has_table_privilege(current_user,'questions','INSERT')
      AND has_table_privilege(current_user,'question_options','INSERT') AS catalog_insert,
    has_table_privilege(current_user,'topics','UPDATE') AND has_table_privilege(current_user,'questions','UPDATE')
      AND has_table_privilege(current_user,'question_options','UPDATE') AS catalog_update,
    has_table_privilege(current_user,'question_options','DELETE') AS options_delete,
    has_table_privilege(current_user,'question_revisions','SELECT') AS revision_select,
    has_table_privilege(current_user,'question_revisions','INSERT') AS revision_insert,
    has_table_privilege(current_user,'question_revisions','UPDATE') AS revision_update,
    has_table_privilege(current_user,'question_revisions','DELETE') AS revision_delete,
    has_table_privilege(current_user,'question_revisions','TRUNCATE') AS revision_truncate,
    has_table_privilege(current_user,'practice_deliveries','SELECT') AS delivery_select,
    has_table_privilege(current_user,'practice_deliveries','INSERT') AS delivery_insert,
    has_table_privilege(current_user,'practice_deliveries','UPDATE') AS delivery_update,
    has_table_privilege(current_user,'practice_deliveries','DELETE') AS delivery_delete,
    has_table_privilege(current_user,'practice_deliveries','TRUNCATE') AS delivery_truncate,
    has_table_privilege(current_user,'practice_attempts','SELECT') AS attempt_select,
    has_table_privilege(current_user,'practice_attempts','INSERT') AS attempt_insert,
    has_table_privilege(current_user,'users','SELECT') AS user_select,
    has_table_privilege(current_user,'users','INSERT') AS user_insert,
    has_column_privilege(current_user,'users','email','UPDATE')
      AND has_column_privilege(current_user,'users','display_name','UPDATE')
      AND has_column_privilege(current_user,'users','updated_at','UPDATE')
      AND has_column_privilege(current_user,'users','last_login_at','UPDATE') AS profile_update,
    has_column_privilege(current_user,'users','role','UPDATE') AS role_update,
    has_column_privilege(current_user,'users','status','UPDATE') AS status_update,
    has_table_privilege(current_user,'users','DELETE') AS user_delete,
    has_table_privilege(current_user,'practice_attempts','UPDATE') AS history_update,
    has_table_privilege(current_user,'practice_attempts','DELETE') AS history_delete,
    has_table_privilege(current_user,'questions','DELETE') AS question_delete,
    has_table_privilege(current_user,'topics','DELETE') AS topic_delete,
    has_sequence_privilege(current_user,'question_code_seq','USAGE') AS code_usage,
    has_sequence_privilege(current_user,'question_code_seq','UPDATE') AS code_update
    FROM pg_catalog.pg_roles r WHERE rolname=current_user`)).rows[0];
  stage='runtime-taxonomy-privileges';
  await assertNexusPrivileges(client);
  await assertLearningPrivileges(client);
  const taxonomy=await taxonomyPrivileges(client);
  if(!taxonomy.ready) fail('Taxonomy runtime privileges differ from the approved scope. Missing: ' +
    (taxonomy.missing.join(', ') || 'none') + '. Unsafe: ' + (taxonomy.unsafe.join(', ') || 'none') + '. Stop; no automatic grants.');
  stage='runtime-catalog-privileges';
  return old;
}
function report(mode, identity, extra={}) {
  console.log(JSON.stringify({mode,worktree:root,database:identity.database,address:identity.host,
    port:identity.port,role:identity.sessionRole,clusterFingerprintVerified:true,...extra}));
}
let stage='input';
async function main() {
  const [mode,...args]=process.argv.slice(2);
  if (args.some(x=>!['--apply','--start'].includes(x)) || new Set(args).size!==args.length) fail('Unexpected arguments.');
  stage='workspace-verification';
  const branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
  assertWorkspace(root,realpathSync(process.cwd()),branch);
  if(mode?.startsWith('upgrade') && execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim()!==upgradeHead)
    fail('Upgrade requires the reviewed HEAD; stop.');
  stage='configuration-input';
  const raw=readFileSync(0,'utf8'); if(raw.length>16384) fail('Configuration input is too large.');
  let input; try { input=JSON.parse(raw); } catch { fail('Configuration must be supplied privately as JSON on stdin.'); }
  const runtimeMode=['api','web','check'].includes(mode);
  if(!runtimeMode&&Object.hasOwn(input,'ledgerPassword'))fail('Unexpected runtime ledger credential for a migration operation.');
  const ledgerPassword=input.ledgerPassword;
  delete input.ledgerPassword; // Never pass the migrator credential to app config or environment.
  stage='migration-source-manifest';
  const manifest=migrationManifest(root);
  const snapshots=mode?.startsWith('upgrade')||runtimeMode?upgradeSnapshots(root):null;
  if(runtimeMode)await verifyRuntimeLedger(mode,input,ledgerPassword,manifest,snapshots,{
    verifyLocalService:()=>serviceCheck(),createClient:cfg=>new (dbRequire('pg').Client)(cfg),onStage:next=>{stage=next;},
  },{apply:args.includes('--apply'),start:args.includes('--start')});
  stage='postgres-preflight';
  const checked=await preflight(mode,input,{
    onStage:next=>{stage=next;},
    verifyLocalService:()=>serviceCheck(),
    createClient:cfg=>new (dbRequire('pg').Client)(cfg),
    runtimePrivileges,
    upgradeState:(client,phase)=>verifyUpgradeState(client,manifest,snapshots,phase,false),
  },{apply:args.includes('--apply'),start:args.includes('--start')});
  const {client,config,identity}=checked;
  if(mode.startsWith('upgrade')) {
    try {
      if(mode==='upgrade') {
        const {drizzle}=dbRequire('drizzle-orm/node-postgres');
        const {migrate}=dbRequire('drizzle-orm/node-postgres/migrator');
        stage='upgrade-0005';
        const result=await executeUpgrade(client,config,manifest,snapshots,{
          migrate:boundClient=>migrate(drizzle(boundClient),{migrationsFolder:path.join(root,'lib/db/drizzle'),migrationsTable:'__drizzle_migrations',migrationsSchema:'drizzle'}),
        });
        report(mode,identity,result);
      } else if(mode==='upgrade-check') report(mode,identity,{pending:['0005_exam_taxonomy'],ledgerEntries:5,databaseWrites:false});
      else {
        await client.query('BEGIN READ ONLY');
        try { const privileges=await taxonomyPrivileges(client);
          if(privileges.unsafe.length)fail('Unexpected taxonomy runtime privileges.');
          report(mode,identity,{ledgerEntries:manifest.length,taxonomyTablesVerified:true,runtimePrivileges:privileges,databaseWrites:false});
        } finally {await client.query('ROLLBACK');}
      }
    } finally {await client.end();}
    return;
  }
  if (mode==='check') { await client.end(); report(mode,identity,{clerkDevelopmentConfigurationChecked:true,serversStarted:false}); return; }
  if (mode==='migrate') {
    try {
      const {drizzle}=dbRequire('drizzle-orm/node-postgres');
      const {migrate}=dbRequire('drizzle-orm/node-postgres/migrator');
      // Same verified connection; no CLI fallback, application pool or seed.
      stage='apply-migrations';
      await migrate(drizzle(client),{migrationsFolder:path.join(root,'lib/db/drizzle'),migrationsTable:'__drizzle_migrations',migrationsSchema:'drizzle'});
      const rows=(await client.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
      stage='ledger-check'; assertLedger(rows,manifest); report(mode,identity,{migrations:manifest.map(x=>x.tag)});
    } finally { await client.end(); }
    return;
  }
  stage='postgres-client-close'; await client.end();
  if(mode==='api') { stage='api-port-availability'; await portsFree(3000); }
  else { stage='api-service-identity'; serviceCheck(true); stage='frontend-port-availability'; await portsFree(8080); }
  stage='runtime-environment';
  setEnvironment(mode,config);
  if (mode==='api') {
    stage='api-import'; scriptsRequire('tsx/esm/api').register();
    const {assertEnv}=await import(pathToFileURL(path.join(root,'artifacts/api-server/src/lib/env.ts')).href); assertEnv();
    const {default:app}=await import(pathToFileURL(path.join(root,'artifacts/api-server/src/app.ts')).href);
    const {pool}=await import(pathToFileURL(path.join(root,'lib/db/src/index.ts')).href);
    stage='api-pool-check';
    if(pool.options.connectionString!==process.env.DATABASE_URL) fail('Unexpected application pool configuration.');
    try {
      const c=await pool.connect();
      try { await c.query('BEGIN READ ONLY'); assertIdentity((await c.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]?.identity,config);
        await c.query('ROLLBACK'); } finally { c.release(); }
    } catch(error) { await pool.end(); throw error; }
    const server=app.listen(3000,'127.0.0.1',()=>report(mode,identity,{apiPort:3000}));
    server.on('error',()=>{console.error('Local API listener failed.');void pool.end();process.exitCode=1;});
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{void pool.end();}));
  } else {
    stage='frontend-import';
    const {createServer,react,tailwindcss}=await loadFrontendDependencies(root,next=>{stage=next;});
    const artifact=path.join(root,'artifacts/ccna-learning');
    stage='frontend-config';
    const server=await createServer({configFile:false,envDir:false,root:artifact,base:'/',mode:'local-development',
      cacheDir:path.join(root,'.local/phase6a-runtime/vite-cache'),plugins:[react(),tailwindcss()],
      resolve:{alias:{'@':path.join(artifact,'src'),'@assets':path.join(root,'attached_assets')},dedupe:['react','react-dom']},
      server:{host:'127.0.0.1',port:8080,strictPort:true,allowedHosts:['127.0.0.1','localhost'],
        proxy:{'/api':{target:'http://127.0.0.1:3000',changeOrigin:true}},fs:{strict:true,allow:[root]}}});
    stage='frontend-listen'; await server.listen(); report(mode,identity,{frontendPort:8080,proxyTarget:'127.0.0.1:3000'});
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void server.close();});
  }
}
main().catch(error=>{console.error(safeError(error));console.error('Startup phase: '+stage);if(['Error','TypeError','ReferenceError','SyntaxError','LocalRuntimeError'].includes(error?.name))console.error('Error type: '+error.name);if(typeof error?.code==='string' && /^[A-Z_0-9]{3,40}$/.test(error.code))console.error('Diagnostic code: '+error.code);process.exitCode=1;});
