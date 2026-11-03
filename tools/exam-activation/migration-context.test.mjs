// Actual Drizzle on a query-recording fake client, never a PostgreSQL connection.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {isolatedMigrationClient} from './migration-context.mjs';
import {examSourceFixture} from '../test-support/exam-source-fixture.mjs';
import {assertExamProposal} from './proposal.mjs';
const database='ccna_exam_0017_restore_'+'a'.repeat(24);
function fixture(overrides={},ignoreSetting=false) {
  const state={database,port:55440,role:'ccna_phase6a_migrator',schema:'pg_catalog',search_path:'pg_catalog',can_create:true,can_use:true,owner:'ccna_phase6a_migrator',...overrides};
  const calls=[],targets=[];
  return {state,calls,targets,query:async(query,params)=>{
    const sql=typeof query==='string'?query:query.text;calls.push(sql);
    if(sql.includes('current_database() AS database'))return {rows:[{...state}]};
    if(sql==='SET LOCAL search_path = public, pg_catalog'&&!ignoreSetting){state.search_path='public, pg_catalog';state.schema='public';}
    const table=sql.match(/CREATE TABLE "(exam_sessions|exam_session_items)"/);
    if(table)targets.push({table:table[1],schema:state.schema,path:state.search_path});
    if(/select id, hash, created_at from/i.test(sql))return {rows:[{id:16,hash:'baseline-fixture',created_at:'1793145600002'}]};
    return {rows:[]};
  }};
}
test('actual staged Drizzle statements target public, retain the setting through savepoints and keep ledger in drizzle',async()=>{
  const repository=process.cwd(),{root,work,plan,activation}=await examSourceFixture(repository),req=createRequire(path.join(repository,'lib/db/package.json'));
  const {drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');
  const folder=path.join(work,'migrations');
  activation.stageExam(root,folder,plan);const c=fixture(),guarded=await isolatedMigrationClient(c,database);
  await migrate(drizzle(guarded),{migrationsFolder:folder,migrationsSchema:'drizzle',migrationsTable:'__drizzle_migrations'});
  assert.deepEqual(c.targets,[{table:'exam_sessions',schema:'public',path:'public, pg_catalog'},{table:'exam_session_items',schema:'public',path:'public, pg_catalog'}]);
  assert(c.calls.some(s=>s==='SAVEPOINT ccna_lesson_transaction'));assert(c.calls.some(s=>s==='RELEASE SAVEPOINT ccna_lesson_transaction'));
  assert(c.calls.some(s=>/insert into "drizzle"\."__drizzle_migrations"/i.test(s)));
  assert(!c.calls.some(s=>/"public"\."__drizzle_migrations"/.test(s)));
  assert(!c.calls.some(s=>/^GRANT .*pg_catalog/i.test(s.trim())));
  assert.equal(c.state.search_path,'public, pg_catalog');
  assertExamProposal(root); // Exact SQL, chain and snapshot pins still enforced.
});
test('missing public CREATE/USAGE, wrong migrator/owner and wrong private target fail before SET or DDL',async()=>{
  for(const overrides of [{can_create:false},{can_use:false},{role:'ccna_phase6a_app'},{owner:'other'},{port:5432},{database:'ccna_phase6a_dev'}]){
    const c=fixture(overrides);await assert.rejects(()=>isolatedMigrationClient(c,database));
    assert.equal(c.calls.length,1);assert.equal(c.targets.length,0);
  }
  const c=fixture();await assert.rejects(()=>isolatedMigrationClient(c,'ccna_phase6a_dev'));assert.equal(c.calls.length,0);
});
test('unexpected schema resolution after SET fails closed without DDL or grants',async()=>{
  const c=fixture({},true);await assert.rejects(()=>isolatedMigrationClient(c,database),/Unqualified DDL must resolve to public/);
  assert.equal(c.targets.length,0);assert(!c.calls.some(s=>/^GRANT|^CREATE/.test(s)));
});
test('path or privilege drift is checked before every forwarded migration statement',async()=>{
  for(const overrides of [{schema:'pg_catalog'},{search_path:'other, public'},{can_create:false}]){
    const c=fixture(),guarded=await isolatedMigrationClient(c,database);Object.assign(c.state,overrides);
    await assert.rejects(()=>guarded.query('CREATE TABLE "exam_sessions" (id uuid)'));
    assert.equal(c.targets.length,0);
  }
});
test('function-local security paths and existing rehearsal identity/safety guards are preserved',()=>{
  const sql=readFileSync('lib/db/drizzle/proposed/0017_exam_simulator.sql','utf8');
  assert(sql.includes('CREATE FUNCTION public.guard_exam_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog'));
  assert(sql.includes('SECURITY DEFINER SET search_path=pg_catalog'));
  const runner=readFileSync('tools/exam-activation/rehearse-backup.mjs','utf8');
  assert(runner.indexOf('assertPrivateIdentity(c,name,state.data)')<runner.indexOf('const migrationClient=await isolatedMigrationClient'));
  assert(runner.includes('SET LOCAL ROLE ccna_phase6a_migrator'));
  assert.equal((runner.match(/migrate\(drizzle\(migrationClient\)/g)??[]).length,2);
  assert(runner.includes('await runSafetyAssertions('));assert(runner.includes('assertSafetyCoverage(report.safetyAssertions)'));
});
