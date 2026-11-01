// SELECT-only operator diagnostic. No migration, backup, grant or apply mode.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { policy, migrationManifest, assertLedger, assertIdentity, validateInput, connection } from '../phase6a-local/policy.mjs';
import { readSchemaCatalog, assertSchemaCatalog } from '../phase6a-local/upgrade.mjs';
import { assertLessonPrivileges, assertLessonRevisionGuard } from '../lesson-activation/policy.mjs';
import { assertStudyProposal } from './proposal.mjs';

export const proposal = Object.freeze({
  file: 'lib/db/drizzle/proposed/0014_interactive_study.sql',
  sha256: 'c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893',
});
export function readinessPlan(root) {
  assert.equal(realpathSync(root).replaceAll('\\', '/').toLowerCase(), policy.root.toLowerCase());
  const bytes = readFileSync(path.join(root, proposal.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), proposal.sha256, 'Lesson proposal drift');
  const manifest = migrationManifest(root);
  assert.equal(manifest.length, 13, 'Review the changed official migration chain before study activation');
  assert.equal(manifest.at(-1).tag, '0013_learning_lessons');
  assertStudyProposal(root);
  return { target: { host: policy.host, port: policy.port, database: policy.database,
    owner: policy.migrationRole, systemIdentifier: policy.upgradeSystemIdentifier }, proposal,
    manifest, databaseWrites: 0, applySupported: false };
}
export async function inspectReadiness(client, config, plan, root, afterInspection) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL TIME ZONE 'UTC'");
    const identity = (await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]?.identity;
    assertIdentity(identity, config);
    assert.equal(identity.versionNumber, 180006, 'PostgreSQL version changed; review required');
    const ledger = (await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
    assertLedger(ledger, plan.manifest);
    assert.deepEqual(ledger.map(row => row.id), Array.from({ length: 13 }, (_, i) => i + 1), 'Unexpected ledger identities');
    const roles = (await client.query(`SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership
      FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [[policy.appRole, policy.migrationRole]])).rows;
    assert.equal(roles.length, 2);
    for (const {rolname, rolcanlogin, ...flags} of roles) {
      assert.equal(rolcanlogin, true);
      assert(Object.values(flags).every(value => value === false), 'Unexpected role capabilities');
    }
    const databaseOwner = (await client.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()')).rows[0]?.owner;
    assert.equal(databaseOwner, policy.migrationRole);
    const snapshot = JSON.parse(readFileSync(path.join(root, 'lib/db/drizzle/meta/0013_snapshot.json'), 'utf8'));
    assertSchemaCatalog(await readSchemaCatalog(client), snapshot);
    await assertLessonRevisionGuard(client, root);
    await assertLessonPrivileges(client);
    const objects = (await client.query(`SELECT to_regclass('public.lesson_annotations')::text AS annotations,
      to_regclass('public.lesson_progress')::text AS progress,
      to_regclass('public.lesson_media')::text AS media`)).rows[0];
    assert(objects && Object.keys(objects).length === 3 && Object.values(objects).every(value => value === null), 'Study objects already exist; stop for state review');
    const schemaPrivileges = (await client.query(`SELECT
      has_schema_privilege($1,'public','CREATE') AS "migratorCreate",
      has_schema_privilege($1,'public','USAGE') AS "migratorUsage",
      has_schema_privilege($2,'public','USAGE') AS "appUsage",
      has_schema_privilege($1,'drizzle','USAGE') AS "ledgerUsage"`, [policy.migrationRole, policy.appRole])).rows[0];
    assert(Object.values(schemaPrivileges).every(value => value === true), 'Required schema privileges missing');
    const counts = {};
    for (const table of Object.values(snapshot.tables).map(t => t.name).sort()) {
      assert.match(table, /^[a-z_]+$/);
      counts[table] = (await client.query(`SELECT count(*)::int AS n FROM public."${table}"`)).rows[0].n;
    }
    const result = { stage: 'complete', identity, ledgerEntries: ledger.length, baselineSchemaMatched: true,
      roles, schemaPrivileges, studyObjectsAbsent: true, lessonRevisionGuardMatched: true, lessonPrivilegesMatched: true, counts,
      databaseWrites: 0, backupVerified: false, rehearsalVerified: false,
      recommendation: 'NO-GO', activationAuthorized: false };
    return afterInspection ? await afterInspection(result, ledger) : result;
  } finally { await client.query('ROLLBACK'); }
}

async function main() {
  let stage = 'offline-preflight', client;
  try {
    assert.equal(process.argv.length, 3);
    const mode = process.argv[2];
    assert(['--plan', '--check'].includes(mode), 'Only --plan or SELECT-only --check is supported');
    const root = realpathSync(process.cwd());
    assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), '3c07b4bb7fe807e60dcbcd5539c046b919a9956f');
    const plan = readinessPlan(root);
    if (mode === '--plan') { console.log(JSON.stringify(plan)); return; }
    stage = 'private-input';
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; assert(size <= 16384); chunks.push(chunk); }
    const config = validateInput('upgrade-verify', JSON.parse(Buffer.concat(chunks).toString('utf8')));
    stage = 'postgres-connect';
    const require = createRequire(path.join(root, 'lib/db/package.json'));
    client = new (require('pg').Client)({ ...connection(config), application_name: 'ccna-study-select-only' });
    client.on('error', () => {});
    await client.connect();
    stage = 'identity-ledger-schema-role-readiness';
    console.log(JSON.stringify(await inspectReadiness(client, config, plan, root)));
  } catch (error) {
    const candidate = error?.code ?? error?.cause?.code;
    const sqlState = typeof candidate === 'string' && /^[0-9A-Z]{5}$/.test(candidate) ? candidate : null;
    console.log(JSON.stringify({stage, databaseWrites: 0, recommendation: 'NO-GO', failure: {sqlState, message: 'Readiness check stopped; credentials, row data and raw driver diagnostics withheld.'}}));
    process.exitCode = 1;
  } finally { if (client) await client.end().catch(() => {}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
