// Isolated rehearsal only. No connection, grant or operation on import.
import assert from 'node:assert/strict';
import {transactionClient} from '../lesson-activation/transaction-client.mjs';

const contextSql=`SELECT current_database() AS database,inet_server_port() AS port,
 current_user AS role,current_schema() AS schema,current_setting('search_path') AS search_path,
 has_schema_privilege(current_user,'public','CREATE') AS can_create,
 has_schema_privilege(current_user,'public','USAGE') AS can_use,
 (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public') AS owner`;
function assertContext(row,database,configured) {
  assert(row,'Missing migration context');
  assert.equal(row.database,database);assert.equal(row.port,55440);
  assert.equal(row.role,'ccna_phase6a_migrator');
  assert.equal(row.owner,'ccna_phase6a_migrator');
  assert.equal(row.can_create,true,'Migrator lacks CREATE on public');
  assert.equal(row.can_use,true,'Migrator lacks USAGE on public');
  if(configured){assert.equal(row.schema,'public','Unqualified DDL must resolve to public');assert.equal(row.search_path,'public, pg_catalog','Migration search_path changed');}
}
export async function isolatedMigrationClient(client,database) {
  assert.match(database,/^ccna_exam_0017_restore_[a-f0-9]{24}$/);
  assertContext((await client.query(contextSql)).rows[0],database,false);
  await client.query('SET LOCAL search_path = public, pg_catalog');
  assertContext((await client.query(contextSql)).rows[0],database,true);
  const tx=transactionClient(client);
  return {
    async query(query,params) {
      // Use the same physical connection; savepoints cannot discard the setting
      // made before Drizzle's nested migration transaction. Recheck every call.
      assertContext((await client.query(contextSql)).rows[0],database,true);
      return tx.query(query,params);
    },
  };
}
