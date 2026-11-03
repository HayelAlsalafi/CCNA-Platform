// Private fixture only. All shared-role changes MUST be inside the caller's
// outer transaction and rolled back; never adopt or alter an existing role.
import assert from 'node:assert/strict';
export const fixtureRoles=['ccna_phase6a_app','ccna_phase6a_migrator'];
export async function prepareFixtureRoles(client,database) {
 assert.match(database,/^ccna_exam_0017_restore_[a-f0-9]{24}$/);
 const identity=(await client.query("SELECT current_database() AS database,inet_server_port() AS port,(pg_control_system()).system_identifier::text AS system")).rows[0];
 assert.deepEqual(identity,{database,port:55440,system:'7695735287099484548'});
 assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[fixtureRoles])).rows[0].n,0,'Private fixture role names already exist; stop without altering them');
 for(const role of fixtureRoles)await client.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
 // Required CONNECT/CREATE settings are confined to the disposable database.
 await client.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
 // The main migrator owns its database and therefore has database-level
 // CREATE (distinct from the cluster CREATEDB role attribute). Drizzle checks
 // this even for CREATE SCHEMA IF NOT EXISTS on an existing owned schema.
 // Main migrator is the database owner: TEMP is implicit there and is used by
 // the controlled-deletion definer's private permit table. Match that privilege
 // only on this verified new disposable database; the app still has no TEMP.
 await client.query(`GRANT CREATE,TEMP ON DATABASE "${database}" TO ccna_phase6a_migrator`);
 for(const schema of ['public','drizzle']){
  const objects=(await client.query("SELECT c.relname AS name,c.relkind AS kind,EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')) AS \"ownedByTable\" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','S') ORDER BY CASE WHEN c.relkind='r' THEN 0 ELSE 1 END,c.relname",[schema])).rows;
  for(const o of objects){
   assert(/^[a-z_][a-z_0-9]*$/.test(o.name));
   if(o.kind==='S'&&o.ownedByTable){
    // Serial/identity sequences follow their table's owner. PostgreSQL rejects
    // changing their owner independently; verify instead of weakening ownership.
    const row=(await client.query('SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass',[`"${schema}"."${o.name}"`])).rows[0];
    assert.equal(row?.owner,'ccna_phase6a_migrator','Owned sequence did not follow its table owner');
   }else await client.query(`ALTER ${o.kind==='S'?'SEQUENCE':'TABLE'} "${schema}"."${o.name}" OWNER TO ccna_phase6a_migrator`);
  }
  const functions=(await client.query("SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind='f' ORDER BY p.oid",[schema])).rows;
  for(const f of functions){assert(!/[;\r\n]/.test(f.signature));await client.query(`ALTER FUNCTION ${f.signature} OWNER TO ccna_phase6a_migrator`);}
  const types=(await client.query("SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typtype='e'",[schema])).rows;
  for(const t of types){assert(/^[a-z_][a-z_0-9]*$/.test(t.name));await client.query(`ALTER TYPE "${schema}"."${t.name}" OWNER TO ccna_phase6a_migrator`);}
  await client.query(`ALTER SCHEMA "${schema}" OWNER TO ccna_phase6a_migrator`);
 }
 const profiles=(await client.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[fixtureRoles])).rows;
 assert.equal(profiles.length,2);for(const {rolname,...flags} of profiles)assert(Object.values(flags).every(v=>v===false));
}
export function aclSelection(toc){
 const selected=toc.split(/\r?\n/).filter(line=>/^\d+; \d+ \d+ ACL (?:(?:public|drizzle) |-(?: )SCHEMA (?:public|drizzle) )/.test(line));
 assert(selected.length>0,'No scoped ACL archive entries');return selected.join('\n')+'\n';
}
export function aclSql(decoded){
 // pg_restore's psql-only \restrict marker is not SQL. Only metadata ACL
 // entries were selected; database ACLs/main database names are excluded.
 const sql=decoded.split(/\r?\n/).filter(line=>!/^\\(?:un)?restrict\s+\S+$/.test(line)).join('\n');
 const statements=sql.replace(/--[^\n]*/g,'').replace(/'[^']*'/g,"''").split(';').map(s=>s.trim()).filter(Boolean);
 assert(statements.length>0&&statements.every(s=>/^(?:SET\s|SELECT pg_catalog\.set_config\(|GRANT\s|REVOKE\s)/.test(s)),'Unexpected statement in scoped ACL restore');
 return sql;
}
