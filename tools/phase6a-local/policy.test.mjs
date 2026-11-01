import {portableRoot} from "../workspace-root.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { policy, LocalRuntimeError, validateInput, assertIdentity, cleanEnvironment, applicationUrl,
  assertWorkspace, migrationManifest, assertLedger, assertRuntimePrivileges, preflight, safeError, serviceFailureInvariant } from './policy.mjs';

const publicKey = ['pk','test',Buffer.from(policy.clerkInstance+'$').toString('base64url')].join('_');
const fixture = mode => ({host:policy.host,port:policy.port,database:policy.database,
  role:mode==='migrate'?policy.migrationRole:policy.appRole,
  password:'<configuration-only test fixture; never connects>', systemIdentifier:'1234567890123456789',
  ...(mode==='migrate'?{}:{publishableKey:publicKey,...(mode==='web'?{}:{secretKey:['sk','test','configuration_fixture'].join('_')})})});
const identity = input => ({database:policy.database,sessionRole:input.role,host:policy.host,port:policy.port,
  versionNumber:180006,dataDirectory:policy.dataDirectory,systemIdentifier:input.systemIdentifier,neon:null});
const reviewedSource=migrationManifest(policy.root);
const expectedTables=['exam_blueprints','exam_domains','exam_objectives','practice_attempts','practice_deliveries','question_objectives','question_options','question_revisions','questions','topics','users',...(reviewedSource.length>=8?['learning_sessions','learning_session_items']:[]),...(reviewedSource.length>=9?['achievement_definitions','learner_achievements']:[]),...(reviewedSource.length>=11?['question_deletion_audits']:[]),...(reviewedSource.length>=12?['curriculum_chapters']:[]),...(reviewedSource.length===13?['exam_sessions','exam_session_items']:[])].sort();
const attrs={rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false,membership:false};
const permissions=()=>Object.fromEntries([
  ...['catalog_select','catalog_insert','catalog_update','options_delete','attempt_select','attempt_insert','user_select','user_insert','profile_update','code_usage','revision_select','revision_insert','delivery_select','delivery_insert'].map(k=>[k,true]),
  ...['superuser','createdb','createrole','replication','bypassrls','inherited_membership','database_create','temp','schema_create','ledger_access','role_update','status_update','user_delete','history_update','history_delete','question_delete','topic_delete','code_update','revision_update','revision_delete','revision_truncate','delivery_update','delivery_delete','delivery_truncate'].map(k=>[k,false]),
]);
function mock(mode='check', change={}) {
  const input=fixture(mode), calls=[], state={created:0,connected:0,ended:0};
  const client={connect:async()=>{state.connected++},end:async()=>{state.ended++},query:async sql=>{
    calls.push(sql);
    if(sql.includes('identity()'))return {rows:[{identity:{...identity(input),...change}}]};
    if(sql.includes('pg_auth_members'))return {rows:[attrs]};
    if(sql.includes('information_schema.tables'))return {rows:mode==='migrate'?[]:expectedTables.map(table_name=>({table_name}))};
    if(sql.includes('pg_catalog.pg_class'))return {rows:expectedTables.map(table_name=>({table_name,relation_kind:'r'}))};
    if(sql.includes('to_regclass'))return {rows:[{ledger:null}]};
    return {rows:[]};
  }};
  return {input,calls,state,client,deps:{verifyLocalService:async()=>calls.push('OS local service check'),
    createClient:cfg=>{state.created++;assert.equal(cfg.host,policy.host);assert.equal(cfg.port,5432);assert.equal(cfg.ssl,false);return client;},
    runtimePrivileges:async()=>permissions()}};
}
const phase7aRequired = [
  'revision_select',
  'revision_insert',
  'delivery_select',
  'delivery_insert'
];

const phase7aForbidden = [
  'revision_update',
  'revision_delete',
  'revision_truncate',
  'delivery_update',
  'delivery_delete',
  'delivery_truncate'
];

for (const key of phase7aRequired) {
  test(`rejects missing Phase 7A privilege: ${key}`, () => {
    assert.throws(
      () => assertRuntimePrivileges({...permissions(), [key]: false}),
      LocalRuntimeError
    );
  });
}

for (const key of phase7aForbidden) {
  test(`rejects dangerous Phase 7A privilege: ${key}`, () => {
    assert.throws(
      () => assertRuntimePrivileges({...permissions(), [key]: true}),
      LocalRuntimeError
    );
  });
}
const flags = mode => mode==='migrate'?{apply:true}:['api','web'].includes(mode)?{start:true}:{};
for(const mode of ['check','migrate','api','web'])test('accepts exact reviewed configuration: '+mode,()=>{
  const next=validateInput(mode,fixture(mode),flags(mode));assert(Object.isFrozen(next));
});
const invalid=[
 ['external host',{host:'db.example.invalid'}], ['Neon host',{host:'fixture.neon.tech'}],
 ['DNS localhost',{host:'localhost'}], ['IPv6 alias',{host:'::1'}],
 ['test port',{port:55433}], ['string port',{port:'5432'}], ['other port',{port:5433}],
 ['test database',{database:'ccna_clerk_isolation_test'}], ['maintenance database',{database:'postgres'}],
 ['missing database',{database:undefined}], ['operator role',{role:'postgres'}],
 ['migration role in app',{role:policy.migrationRole}], ['missing password',{password:''}],
 ['NUL password',{password:'a\0b'}], ['missing fingerprint',{systemIdentifier:undefined}],
 ['malformed fingerprint',{systemIdentifier:'unconfirmed'}], ['URL override',{DATABASE_URL:'rejected'}],
 ['PG options',{options:'rejected'}], ['connection URL',{connectionString:'rejected'}],
 ['wrong Clerk instance',{publishableKey:['pk','test',Buffer.from('other.clerk.accounts.dev$').toString('base64url')].join('_')}],
 ['production public key',{publishableKey:publicKey.replace('_test_','_live_')}],
 ['production secret',{secretKey:['sk','live','fixture'].join('_')}],
 ['missing secret',{secretKey:undefined}], ['unknown input',{unknown:true}],
];
for(const [name,change] of invalid)test('rejects '+name+' before service/client/connect',async()=>{
  const m=mock();await assert.rejects(()=>preflight('check',{...m.input,...change},m.deps,{}),LocalRuntimeError);
  assert.equal(m.state.created,0);assert.equal(m.state.connected,0);assert.deepEqual(m.calls,[]);
});
for(const mode of ['migrate','api','web'])test('explicit operation gate before connection: '+mode,async()=>{
  const m=mock(mode);await assert.rejects(()=>preflight(mode,m.input,m.deps,{}),LocalRuntimeError);assert.equal(m.state.created,0);
});
test('rejects frontend secret before connect',async()=>{
  const m=mock('web');await assert.rejects(()=>preflight('web',{...m.input,secretKey:'not allowed'},m.deps,{start:true}),LocalRuntimeError);assert.equal(m.state.created,0);
});
test('local service failure creates no client',async()=>{
  const m=mock();m.deps.verifyLocalService=async()=>{throw Error('wrong listener')};
  await assert.rejects(()=>preflight('check',m.input,m.deps,{}));assert.equal(m.state.created,0);
});
for(const [name,change] of [
 ['database',{database:'postgres'}],['session role',{sessionRole:'postgres'}],['address',{host:'external.invalid'}],
 ['port',{port:55433}],['version',{versionNumber:170006}],['directory',{dataDirectory:'C:/other/data'}],
 ['fingerprint',{systemIdentifier:'9999999999999999999'}],['Neon metadata',{neon:'branch'}],
])test('rejects actual server '+name+' and closes connection without writes',async()=>{
  const m=mock('check',change);await assert.rejects(()=>preflight('check',m.input,m.deps,{}),LocalRuntimeError);
  assert.equal(m.state.ended,1);assert.equal(m.calls[0],'OS local service check');assert(m.calls.includes('BEGIN READ ONLY'));assert(m.calls.includes('ROLLBACK'));
  assert(!m.calls.some(sql=>/^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|DROP)/.test(sql)));
});
test('privilege mismatch rolls back and closes before startup',async()=>{
  const m=mock();m.deps.runtimePrivileges=async()=>({...permissions(),role_update:true});
  await assert.rejects(()=>preflight('check',m.input,m.deps,{}),LocalRuntimeError);assert.equal(m.state.ended,1);
});
test('approved app preflight is read-only and returns verified client for caller cleanup',async()=>{
  const m=mock();const r=await preflight('check',m.input,m.deps,{});assert.equal(r.client,m.client);assert.equal(m.state.connected,1);
  assert.equal(m.calls.at(-1),'ROLLBACK');assert(!m.calls.some(sql=>/^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|DROP)/.test(sql)));
});
test('initial migration rejects existing application tables',async()=>{
  const m=mock('migrate'),query=m.client.query;
  m.client.query=async sql=>sql.includes('information_schema.tables')?{rows:[{table_name:'users'}]}:query(sql);
  await assert.rejects(()=>preflight('migrate',m.input,m.deps,{apply:true}),LocalRuntimeError);assert.equal(m.state.ended,1);
});
test('runtime inventory sees the restricted audit table without requiring row privileges',async()=>{
  const m=mock('web'),query=m.client.query;
  m.client.query=async sql=>sql.includes('information_schema.tables')?{rows:expectedTables.filter(name=>name!=='question_deletion_audits').map(table_name=>({table_name}))}:query(sql);
  const checked=await preflight('web',m.input,m.deps,{start:true});await checked.client.end();
  assert(m.calls.some(sql=>sql.includes('pg_catalog.pg_class')));
  assert(!m.calls.some(sql=>sql.includes('information_schema.tables')||/GRANT|SELECT \* FROM public.question_deletion_audits/.test(sql)));
});
test('runtime catalog inventory still rejects an actually missing audit table',async()=>{
  const m=mock('web'),query=m.client.query;
  m.client.query=async sql=>sql.includes('pg_catalog.pg_class')?{rows:expectedTables.filter(name=>name!=='question_deletion_audits').map(table_name=>({table_name,relation_kind:'r'}))}:query(sql);
  await assert.rejects(()=>preflight('web',m.input,m.deps,{start:true}),/Missing: question_deletion_audits/);assert.equal(m.state.ended,1);
});
test('runtime catalog inventory rejects unexpected tables with a safe diagnostic',async()=>{
  const m=mock('web'),query=m.client.query;
  m.client.query=async sql=>sql.includes('pg_catalog.pg_class')?{rows:[...expectedTables,'unexpected_fixture'].sort().map(table_name=>({table_name,relation_kind:'r'}))}:query(sql);
  await assert.rejects(()=>preflight('web',m.input,m.deps,{start:true}),/Unexpected: unexpected_fixture/);
});
test('runtime inventory rejects partitioned or foreign replacements of an expected ordinary table',async()=>{
  for(const kind of ['p','f',undefined]){const m=mock('web'),query=m.client.query;
    m.client.query=async sql=>sql.includes('pg_catalog.pg_class')?{rows:expectedTables.map(table_name=>({table_name,relation_kind:table_name==='topics'?kind:'r'}))}:query(sql);
    await assert.rejects(()=>preflight('web',m.input,m.deps,{start:true}),/Unexpected application relation kind: topics/);
  }
});
test('runtime inventory diagnostics redact unsafe unexpected relation identifiers',async()=>{
  const m=mock('web'),query=m.client.query;
  m.client.query=async sql=>sql.includes('pg_catalog.pg_class')?{rows:[...expectedTables,'postgres://private-value'].sort().map(table_name=>({table_name,relation_kind:'r'}))}:query(sql);
  await assert.rejects(()=>preflight('web',m.input,m.deps,{start:true}),error=>{const message=safeError(error);assert(message.includes('<invalid-identifier>'));assert(!message.includes('private-value'));return true;});
});
test('initial migration rejects an existing ledger',async()=>{
  const m=mock('migrate'),query=m.client.query;
  m.client.query=async sql=>sql.includes('to_regclass')?{rows:[{ledger:'drizzle.__drizzle_migrations'}]}:query(sql);
  await assert.rejects(()=>preflight('migrate',m.input,m.deps,{apply:true}),LocalRuntimeError);assert.equal(m.state.ended,1);
});
test('environment whitelist prevents inherited DB, PG, preload, Clerk and Vite overrides',()=>{
  const parent={PATH:'safe path',DATABASE_URL:'blocked',PGHOST:'blocked',PGOPTIONS:'blocked',NODE_OPTIONS:'blocked',DOTENV_CONFIG_PATH:'blocked',CLERK_SECRET_KEY:'blocked',VITE_OTHER_SECRET:'blocked',REPL_ID:'blocked',TEST_DATABASE_URL:'blocked'};
  const api=cleanEnvironment(parent,'api',fixture('api'));assert.equal(api.PATH,'safe path');assert(api.DATABASE_URL.startsWith('postgresql://'));
  for(const key of ['PGHOST','PGOPTIONS','NODE_OPTIONS','DOTENV_CONFIG_PATH','VITE_OTHER_SECRET','REPL_ID','TEST_DATABASE_URL'])assert.equal(api[key],undefined);
  const web=cleanEnvironment(parent,'web',fixture('web'));assert.equal(web.DATABASE_URL,undefined);assert.equal(web.CLERK_SECRET_KEY,undefined);assert.equal(web.PORT,'8080');
});
test('password reserved characters cannot change fixed connection target',()=>{
  const u=new URL(applicationUrl({...fixture('api'),password:'a@/?:#% b'}));assert.equal(u.hostname,policy.host);assert.equal(u.port,'5432');assert.equal(u.pathname,'/'+policy.database);assert.equal(u.search,'');assert.equal(decodeURIComponent(u.password),'a@/?:#% b');
});
test('wrong worktree and branch rejected',()=>{
  assertWorkspace(policy.root,policy.root,policy.branch);
  assert.throws(()=>assertWorkspace(policy.root,portableRoot + '/wrong-checkout',policy.branch),LocalRuntimeError);
  assert.throws(()=>assertWorkspace(policy.root,policy.root,'feature/phase-6a-question-bank-foundation'),LocalRuntimeError);
});
test('reviewed migration inventory matches the complete pinned source chain and ledger hashes',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const manifest=migrationManifest(root);
  assert([7,8,9,10,11,12,13].includes(manifest.length));assert.equal(manifest[5].tag,'0005_exam_taxonomy');assert.equal(manifest[6].tag,'0006_controlled_history_delete');const rows=manifest.map(x=>({hash:x.hash,created_at:String(x.when)}));assertLedger(rows,manifest);
  assert.throws(()=>assertLedger(rows.slice(1),manifest),LocalRuntimeError);
  assert.throws(()=>assertLedger(rows.map((r,i)=>i? r:{...r,hash:'changed'}),manifest),LocalRuntimeError);
});
test('raw driver messages containing secrets never enter diagnostic output',()=>{
  assert.equal(safeError(Error('private password/connection string')), 'Local operation failed; no credentials or driver error details are printed.');
  assert.equal(safeError(new LocalRuntimeError('Wrong local target.')),'Wrong local target.');
});

for (const attribute of ['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls','membership']) test('rejects unexpected role attribute: '+attribute,async()=>{
  const m=mock(),query=m.client.query;
  m.client.query=async sql=>sql.includes('pg_auth_members')?{rows:[{...attrs,[attribute]:true}]}:query(sql);
  await assert.rejects(()=>preflight('check',m.input,m.deps,{}),LocalRuntimeError);assert.equal(m.state.ended,1);
});
test('missing verified role attribute fails closed',async()=>{
  const m=mock(),query=m.client.query;
  m.client.query=async sql=>sql.includes('pg_auth_members')?{rows:[{rolsuper:false}]}:query(sql);
  await assert.rejects(()=>preflight('check',m.input,m.deps,{}),LocalRuntimeError);assert.equal(m.state.ended,1);
});
test('connection failure closes client and does not print raw error',async()=>{
  const m=mock();m.client.connect=async()=>{throw Error('private connection failure')};
  await assert.rejects(()=>preflight('check',m.input,m.deps,{}));assert.equal(m.state.ended,1);
});

for (const mode of ['api','web']) test('approved startup stages distinguish preflight from later runtime checks: '+mode, async()=>{
  const m=mock(mode),stages=[];m.deps.onStage=value=>stages.push(value);
  const checked=await preflight(mode,m.input,m.deps,{start:true});
  assert.deepEqual(stages,['configuration-validation','postgres-service','postgres-client','postgres-connect','postgres-read-only','postgres-identity','postgres-role','postgres-table-inventory','postgres-runtime-privileges','postgres-read-only-finish']);
  await checked.client.end();
});
for(const [label,change,expected] of [
 ['connection',m=>{m.client.connect=async()=>{throw Error('private driver text')};},'postgres-connect'],
 ['OS inspection',m=>{m.deps.verifyLocalService=async()=>{throw Error('private OS text')};},'postgres-service'],
 ['identity',m=>{m.client.query=async()=>({rows:[{identity:{database:'unexpected'}}]});},'postgres-identity'],
 ['table inventory',m=>{const query=m.client.query;m.client.query=async sql=>sql.includes('pg_catalog.pg_class')?{rows:[]}:query(sql);},'postgres-table-inventory'],
 ['privileges',m=>{m.deps.runtimePrivileges=async()=>({...permissions(),role_update:true});},'postgres-runtime-privileges'],
])test('failed '+label+' preserves its sanitized stage through cleanup',async()=>{
 const m=mock('web'),stages=[];m.deps.onStage=value=>stages.push(value);change(m);
 await assert.rejects(()=>preflight('web',m.input,m.deps,{start:true}));assert.equal(stages.at(-1),expected);
});
for(const [key,value] of Object.entries(permissions()))test('runtime privilege diagnostic identifies only the reviewed check: '+key,()=>{
 assert.throws(()=>assertRuntimePrivileges({...permissions(),[key]:!value}),error=>{
  assert(error instanceof LocalRuntimeError);assert(safeError(error).includes(key));return true;
 });
});
test('missing boolean privilege still fails closed with its reviewed check name',()=>{
 const p=permissions();delete p.revision_insert;assert.throws(()=>assertRuntimePrivileges(p),/revision_insert/);
});
test('accepts only the paired reviewed catalog DELETE profile without history privileges',()=>{
 assert.doesNotThrow(()=>assertRuntimePrivileges({...permissions(),question_delete:true,topic_delete:true}));
 for(const key of ['history_delete','revision_delete','delivery_delete','user_delete'])
  assert.throws(()=>assertRuntimePrivileges({...permissions(),question_delete:true,topic_delete:true,[key]:true}),LocalRuntimeError);
});
test('rejects partial or unverified catalog DELETE profiles',()=>{
 for(const changes of [{question_delete:true},{topic_delete:true},{question_delete:undefined,topic_delete:undefined},{question_delete:'true',topic_delete:'true'}])
  assert.throws(()=>assertRuntimePrivileges({...permissions(),...changes}),LocalRuntimeError);
});
test('service diagnostics emit only known labels, never child stderr or command lines',()=>{
 for(const label of ['postgres-service-inspection','postgres-service-identity','postgres-listener-inspection','postgres-loopback-listener','postgres-listener-ownership','api-listener-inspection','api-listener-identity','api-process-inspection','api-process-metadata','api-process-identity'])
  assert.equal(serviceFailureInvariant({stderr:Buffer.from('private command/password Invariant: '+label+'; stop.')}),label);
 for(const stderr of ['private connection string','Invariant: password-leak','Invariant: API-UNKNOWN'])assert.equal(serviceFailureInvariant({stderr}),'service-check');
 assert.equal(serviceFailureInvariant(null),'service-check');
});
