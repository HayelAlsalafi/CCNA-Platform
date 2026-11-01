// Operator entry point. --plan is offline; --check is SELECT-only. --apply requires
// separate explicit approval and the migrator credential supplied through stdin.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { policy, validateInput, connection, assertIdentity } from './phase6a-local/policy.mjs';
import { migratorClient } from './phase6a-local/upgrade.mjs';
import {
  questionBankPlan,
  assertBankState,
  snapshotForCount,
  rowProof,
  promoteQuestionBankSource,
} from './question-bank-upgrade-core.mjs';
import { restoreBackupProof } from './question-bank-restore.mjs';
import { sterileEnvironment, protectOperatorFolder } from './question-bank-disposable-access.mjs';
const root = realpathSync(process.cwd()),
  mode = process.argv[2],
  env = sterileEnvironment(),
  bin = 'C:/Program Files/PostgreSQL/18/bin/';
let stage = 'source-check',
  client,
  committed = false,
  commitAttempted = false,
  reportPath,
  result = {};
function record(value) {
  result = { ...result, ...value, stage, committed };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
}
async function sequence() {
  return (await client.query('SELECT last_value::text,is_called FROM public.question_code_seq'))
    .rows;
}
async function identity(config) {
  const r = (await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]
    ?.identity;
  assertIdentity(r, config);
  assert.equal(r.versionNumber, 180006, 'Expected PostgreSQL 18.6');
  return r;
}
async function roleChecks() {
  const rows = (
    await client.query(
      `SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
      [[policy.appRole, policy.migrationRole]],
    )
  ).rows;
  assert.equal(rows.length, 2, 'Both reviewed roles are required');
  for (const { rolname, rolcanlogin, ...flags } of rows) {
    assert.equal(rolcanlogin, true);
    assert(
      Object.values(flags).every((v) => v === false),
      'Unexpected role attributes: ' + rolname,
    );
  }
  assert.equal(
    (
      await client.query(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()',
      )
    ).rows[0]?.owner,
    policy.migrationRole,
  );
}
async function main() {
  assert.equal(root.replaceAll('\\', '/').toLowerCase(), policy.root.toLowerCase());
  assert.equal(
    execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    'main',
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    '03b14526aae448e49eacd602a43bfb0e355aca4d',
  );
  assert(
    process.argv.length === 3 && ['--plan', '--check', '--apply'].includes(mode),
    'Use --plan, --check or separately approved --apply',
  );
  const plan = questionBankPlan(root);
  if (mode === '--plan') {
    console.log(
      JSON.stringify(
        { ...plan, liveExecution: false, backupRequired: true, restoreTestRequired: true },
        null,
        2,
      ),
    );
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert(size <= 16384);
    chunks.push(chunk);
  }
  const config = validateInput(
    'upgrade-verify',
    JSON.parse(Buffer.concat(chunks).toString('utf8')),
  );
  stage = 'installed-service-identity';
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-File', 'tools/phase6a-local/verify-service.ps1'],
    { env, stdio: 'pipe', timeout: 15000, windowsHide: true },
  );
  for (const tool of ['pg_dump', 'pg_restore'])
    assert.match(
      execFileSync(bin + tool + '.exe', ['--version'], {
        env,
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      }),
      /18\.6/,
    );
  const require = createRequire(path.join(root, 'lib/db/package.json')),
    { Client } = require('pg');
  client = new Client({
    ...connection(config),
    application_name: 'ccna-question-bank-guarded-upgrade',
  });
  client.on('error', () => {});
  stage = 'postgres-connect';
  await client.connect();
  await client.query(mode === '--check' ? 'BEGIN READ ONLY' : 'BEGIN');
  await client.query(
    "SET LOCAL TimeZone='UTC'; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='300s'",
  );
  stage = 'identity-and-role-checks';
  const server = await identity(config);
  await roleChecks();
  stage = 'ledger-schema-function-privilege-preflight';
  let before = await assertBankState(client, root, plan);
  if (mode === '--check') {
    await client.query('ROLLBACK');
    console.log(
      JSON.stringify({
        stage: 'complete',
        databaseWrites: 0,
        identity: server,
        ledgerEntries: before.count,
        pending: plan.manifest.slice(before.count).map((e) => e.tag),
        sourcePromotionPending: plan.pendingSource,
        ready: before.count < 11,
      }),
    );
    return;
  }
  assert(before.count < 11, 'Already upgraded. Refuse duplicate execution; use -Check.');
  stage = 'preservation-locks';
  assert.equal(
    (await client.query('SELECT pg_try_advisory_xact_lock(20261015,9010) AS locked')).rows[0]
      .locked,
    true,
  );
  await client.query(
    'LOCK TABLE ' +
      before.tables
        .map((t) => 'public."' + t + '"')
        .concat('drizzle.__drizzle_migrations')
        .join(',') +
      ' IN SHARE MODE',
  );
  // Recheck after acquiring locks. All application rows remain locked through commit.
  before = await assertBankState(client, root, plan);
  const snapshot = snapshotForCount(root, before.count),
    rows = await rowProof(client, before.tables),
    codeSequence = await sequence();
  const folder = path.join(
    root,
    '.local/question-bank-upgrade',
    new Date().toISOString().replaceAll(':', '-'),
  );
  mkdirSync(folder, { recursive: true });
  protectOperatorFolder(folder, env);
  reportPath = path.join(folder, 'report.json');
  record({ identity: server, baselineLedger: before.ledger, baselineCount: before.count });
  stage = 'full-backup';
  const dump = path.join(folder, 'before-upgrade.dump'),
    snapshotId = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  assert(/^[0-9A-F-]+$/.test(snapshotId));
  execFileSync(
    bin + 'pg_dump.exe',
    [
      '--host=127.0.0.1',
      '--port=5432',
      '--username=' + policy.migrationRole,
      '--dbname=' + policy.database,
      '--no-password',
      '--format=custom',
      '--snapshot=' + snapshotId,
      '--file=' + dump,
    ],
    {
      env: {
        ...env,
        PGPASSWORD: config.password,
        PGCONNECT_TIMEOUT: '5',
        PGOPTIONS: '-c statement_timeout=120000 -c lock_timeout=5000',
      },
      stdio: 'pipe',
      windowsHide: true,
      timeout: 150000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert(statSync(dump).size > 0);
  const sha256 = createHash('sha256').update(readFileSync(dump)).digest('hex');
  const toc = execFileSync(bin + 'pg_restore.exe', ['--list', dump], {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(
    toc.includes('TABLE DATA public questions') &&
      toc.includes('TABLE DATA drizzle __drizzle_migrations'),
    'Incomplete backup inventory',
  );
  execFileSync(bin + 'pg_restore.exe', ['--file=NUL', dump], {
    env,
    stdio: 'pipe',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  const proofFile = path.join(folder, 'restore-proof.json');
  writeFileSync(
    proofFile,
    JSON.stringify({ sha256, baselineCount: before.count, tables: rows }, null, 2) + '\n',
  );
  record({
    backup: {
      path: dump,
      sha256,
      bytes: statSync(dump).size,
      tocVerified: true,
      fullArchiveDecodeVerified: true,
    },
  });
  stage = 'isolated-restoration-proof';
  const restoration = await restoreBackupProof(root, dump, proofFile);
  record({ restoration });
  assert.deepEqual(await rowProof(client, before.tables), rows);
  assert.deepEqual(await sequence(), codeSequence);
  await identity(config);
  stage = 'source-promotion';
  promoteQuestionBankSource(root, plan);
  record({ promoted: plan.pendingSource });
  stage = 'official-drizzle-migrator';
  const { drizzle } = require('drizzle-orm/node-postgres'),
    { migrate } = require('drizzle-orm/node-postgres/migrator');
  await migrate(drizzle(migratorClient(client)), {
    migrationsFolder: path.join(root, 'lib/db/drizzle'),
  });
  stage = 'narrow-runtime-grants';
  if (before.count < 8) {
    await client.query(
      'GRANT SELECT,INSERT ON public.learning_sessions,public.learning_session_items TO ccna_phase6a_app',
    );
    await client.query(
      'GRANT UPDATE(status,completed_at) ON public.learning_sessions TO ccna_phase6a_app',
    );
    await client.query(
      'GRANT UPDATE(selected_option_key,flagged) ON public.learning_session_items TO ccna_phase6a_app',
    );
  }
  if (before.count < 9) {
    await client.query('GRANT SELECT ON public.achievement_definitions TO ccna_phase6a_app');
    await client.query('GRANT SELECT,INSERT ON public.learner_achievements TO ccna_phase6a_app');
  }
  await client.query(
    'GRANT EXECUTE ON FUNCTION public.delete_question_without_learner_history(uuid,uuid) TO ccna_phase6a_app',
  );
  await client.query('GRANT USAGE ON TYPE public.question_type_v2 TO ccna_phase6a_app');
  stage = 'schema-history-and-ledger-preservation';
  const after = await assertBankState(client, root, plan);
  assert.equal(after.count, 11);
  assert.deepEqual(after.ledger.slice(0, before.count), before.ledger);
  assert.deepEqual(await rowProof(client, before.tables, snapshot), rows);
  assert.deepEqual(await sequence(), codeSequence);
  const ledger = after.ledger;
  await migrate(drizzle(migratorClient(client)), {
    migrationsFolder: path.join(root, 'lib/db/drizzle'),
  });
  assert.deepEqual(
    (await assertBankState(client, root, plan)).ledger,
    ledger,
    'Repeat migrator must be a no-op',
  );
  assert.deepEqual(await rowProof(client, before.tables, snapshot), rows);
  assert.deepEqual(await sequence(), codeSequence);
  stage = 'commit';
  commitAttempted = true;
  await client.query('COMMIT');
  committed = true;
  stage = 'post-commit-read-only-verification';
  await client.query('BEGIN READ ONLY');
  await identity(config);
  assert.deepEqual((await assertBankState(client, root, plan)).ledger, ledger);
  await client.query('ROLLBACK');
  stage = 'complete';
  record({
    ledgerEntries: 11,
    preservedTables: before.tables,
    originalRowsAndCodeSequencePreserved: true,
    realQuestionsDeleted: 0,
    multipleAnswersReady: true,
    controlledDeletionReady: true,
  });
  console.log(JSON.stringify({ ...result, report: reportPath }));
}
try {
  await main();
} catch (error) {
  if (client && !committed) await client.query('ROLLBACK').catch(() => {});
  record({
    failure: {
      stage,
      sqlState: /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : undefined,
      message: 'Guarded operation stopped; credentials and raw driver output withheld.',
    },
    commitOutcome: committed
      ? 'COMMITTED'
      : commitAttempted
        ? 'UNKNOWN_VERIFY_DO_NOT_RETRY'
        : 'NOT_COMMITTED',
  });
  console.log(JSON.stringify({ ...result, report: reportPath }));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
