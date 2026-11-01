import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixtureRoles,fixtureRoles} from './restore-roles.mjs';
const database='ccna_lesson_delete_restore_'+'a'.repeat(24);
function fixture(follow=true){
 const calls=[];let tableTransferred=false;
 return {calls,query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('current_database()'))return{rows:[{database,port:55440,system:'7695735287099484548'}]};
  if(sql.includes('count(*)::int'))return{rows:[{n:0}]};
  if(sql.includes('c.relname AS name'))return{rows:args[0]==='public'?[{name:'questions',kind:'r',ownedByTable:false},{name:'question_code_seq',kind:'S',ownedByTable:false}]:[{name:'__drizzle_migrations',kind:'r',ownedByTable:false},{name:'__drizzle_migrations_id_seq',kind:'S',ownedByTable:true}]};
  if(sql==='ALTER TABLE "drizzle"."__drizzle_migrations" OWNER TO ccna_phase6a_migrator')tableTransferred=true;
  if(sql.includes('pg_get_userbyid(relowner)'))return{rows:[{owner:tableTransferred&&follow?'ccna_phase6a_migrator':'unexpected_owner'}]};
  if(sql.includes('SELECT rolname,rolsuper'))return{rows:fixtureRoles.map(rolname=>({rolname,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false,rolcanlogin:false}))};
  return{rows:[]};
 }};
}
test('table-owned sequence ownership is verified after its table; only standalone sequence is altered',async()=>{
 const c=fixture();await prepareFixtureRoles(c,database);
 const table=c.calls.findIndex(q=>q.sql.startsWith('ALTER TABLE "drizzle"'));
 const check=c.calls.findIndex(q=>q.sql.includes('pg_get_userbyid(relowner)'));
 assert(table>=0&&check>table);
 assert(c.calls.some(q=>q.sql==='ALTER SEQUENCE "public"."question_code_seq" OWNER TO ccna_phase6a_migrator'));
 assert(!c.calls.some(q=>q.sql.startsWith('ALTER SEQUENCE "drizzle"."__drizzle_migrations_id_seq"')));
 assert.deepEqual(c.calls[check].args,['"drizzle"."__drizzle_migrations_id_seq"']);
 // Both serial ('a') and identity ('i') dependency kinds must be discovered.
 assert(c.calls.find(q=>q.sql.includes('c.relname AS name')).sql.includes("d.deptype IN ('a','i')"));
});
test('fixture models database-owner CREATE for only the migrator without global CREATEDB or table DELETE grants',async()=>{
 const c=fixture();await prepareFixtureRoles(c,database);
 const grants=c.calls.filter(q=>q.sql.startsWith('GRANT ')).map(q=>q.sql);
 assert.deepEqual(grants,[`GRANT CREATE ON DATABASE "${database}" TO ccna_phase6a_migrator`]);
 assert(!grants.some(sql=>sql.includes('ccna_phase6a_app')||sql.includes('DELETE')||sql.includes('ALL')));
 const creates=c.calls.filter(q=>q.sql.startsWith('CREATE ROLE'));
 assert.equal(creates.length,2);assert(creates.every(q=>q.sql.includes('NOCREATEDB')&&q.sql.includes('NOSUPERUSER')&&q.sql.includes('NOLOGIN')));
 const revoke=c.calls.findIndex(q=>q.sql===`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
 const grant=c.calls.findIndex(q=>q.sql===grants[0]);assert(revoke>=0&&grant>revoke);
});
test('unexpected owned-sequence owner still fails closed without attempting an independent ALTER',async()=>{
 const c=fixture(false);await assert.rejects(prepareFixtureRoles(c,database),/Owned sequence did not follow its table owner/);
 assert(!c.calls.some(q=>q.sql.startsWith('ALTER SEQUENCE "drizzle"')));
});
test('private identity and pre-existing role safeguards remain enforced before any ownership changes',async()=>{
 for(const mode of ['identity','roles']){
  const calls=[];const c={query:async sql=>{calls.push(sql);return{rows:sql.includes('current_database()')?[{database,port:mode==='identity'?5432:55440,system:'7695735287099484548'}]:[{n:1}]};}};
  await assert.rejects(prepareFixtureRoles(c,database));assert(!calls.some(q=>q.startsWith('CREATE ROLE')||q.startsWith('ALTER ')));
 }
});
