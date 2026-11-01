import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Explicitly approved one-database Drizzle test; default mode is offline.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateHba, bounded, disconnect, protectedSession } from './taxonomy-rehearsal/safety.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
assert.equal(root, portableRoot);
assert.equal(
  execFileSync('git', ['--no-optional-locks', 'branch', '--show-current'], {
    encoding: 'utf8',
  }).trim(),
  'main',
);
assert.equal(
  execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  '03b14526aae448e49eacd602a43bfb0e355aca4d',
);
const inputs = [
  {
    path: 'lib/db/drizzle/0000_baseline.sql',
    sha256: 'b39fe82f5797542f49912d07408d96f8bac49a592263dde8082505ccea8d9bd4',
  },
  {
    path: 'lib/db/drizzle/0001_question_domain.sql',
    sha256: 'b3fee57baf66f4cb0d3cd27efee61d5508e93123b4ea6f42b120a78173a88a58',
  },
  {
    path: 'lib/db/drizzle/0002_question_code_immutable.sql',
    sha256: '63dd70e696142401560e5d5063ca39d0498107b9e67ae8cdf2756c352709b28f',
  },
  {
    path: 'lib/db/drizzle/0003_practice_attempts.sql',
    sha256: '0117dfe4623e214b59f806b70dc684bdc963c25bb83895c327ea86b10fbc6a3d',
  },
  {
    path: 'lib/db/drizzle/0004_question_revisions.sql',
    sha256: '5c6614d26e7d37171fb66f86c05d646ce83b81861a0c4f964c720b2f193abcd5',
  },
  {
    path: 'lib/db/drizzle/0005_exam_taxonomy.sql',
    sha256: 'd1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226',
  },
];
for (const e of inputs)
  assert.equal(createHash('sha256').update(readFileSync(e.path)).digest('hex'), e.sha256);
const journal = JSON.parse(readFileSync('lib/db/drizzle/meta/_journal.json', 'utf8'));
assert.deepEqual(
  journal.entries.map((e) => e.tag),
  [
    '0000_baseline',
    '0001_question_domain',
    '0002_question_code_immutable',
    '0003_practice_attempts',
    '0004_question_revisions',
    '0005_exam_taxonomy',
  ],
);
const database = 'ccna_drizzle_check_20261012_c08f12ad34b6';
const owner = 'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170';
const existing = 'ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170';
const data = path.join(root, '.local/taxonomy-rehearsal', existing, 'data');
const canonical = (s) => s.replaceAll('\\', '/').toLowerCase();
const mode = process.argv[2] ?? '--plan';
assert(process.argv.length <= 3 && ['--plan', '--execute'].includes(mode));
if (mode === '--plan') {
  console.log(
    JSON.stringify({
      database,
      owner,
      host: '127.0.0.1',
      port: 55440,
      validatedSql: 6,
      databaseOperations: 0,
    }),
  );
} else {
  assert.equal(canonical(realpathSync(data)), canonical(data));
  const marker = JSON.parse(
    readFileSync(path.join(data, '../owner.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  assert.deepEqual(marker, {
    nonce: '8e6c4b9a2170',
    database: existing,
    owner,
    port: 55440,
    dataDirectory: data,
  });
  const pid = readFileSync(path.join(data, 'postmaster.pid'), 'utf8').trim().split(/\r?\n/);
  assert.equal(Number(pid[0]), 16996);
  assert.equal(Number(pid[3]), 55440);
  assert.equal(canonical(pid[1]), canonical(data));
  const listener = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "$migratorListeners=@(Get-NetTCPConnection -LocalPort 55440 -State Listen -ErrorAction Stop); if($migratorListeners.Count -ne 1){throw 'Wrong listener'}; [pscustomobject]@{Host=$migratorListeners[0].LocalAddress;Pid=$migratorListeners[0].OwningProcess;Exe=(Get-Process -Id $migratorListeners[0].OwningProcess).Path}|ConvertTo-Json -Compress",
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(listener.Host, '127.0.0.1');
  assert.equal(listener.Pid, 16996);
  assert.equal(canonical(listener.Exe), 'c:/program files/postgresql/18/bin/postgres.exe');
  const hbaFile = path.join(data, 'pg_hba.conf'),
    original = readFileSync(hbaFile);
  assert.deepEqual(original.toString('utf8').trim().split(/\r?\n/), privateHba(existing, owner));
  for (const name of [
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGDATABASE',
    'PGPASSWORD',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGPASSFILE',
    'PGOPTIONS',
    'PGSSLMODE',
    'PGREPLICATION',
  ])
    delete process.env[name];
  const require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
  const { Client } = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const { readMigrationFiles } = require('drizzle-orm/migrator');
  const config = {
    host: '127.0.0.1',
    port: 55440,
    user: owner,
    password: 'unused-private-cluster-trust',
    ssl: false,
    sslnegotiation: 'postgres',
    connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=15000 -c lock_timeout=5000',
    application_name: 'ccna-drizzle-check-c08f12ad34b6',
  };
  async function connect(dbName) {
    assert(['postgres', database].includes(dbName));
    const raw = new Client({ ...config, database: dbName });
    raw.on('error', () => disconnect(raw));
    const safe = protectedSession(raw);
    try {
      await bounded(raw.connect(), 6000, 'connect', { onTimeout: () => disconnect(raw) });
      const identity = (
        await safe.query(
          "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version",
        )
      ).rows[0];
      assert.equal(identity.database, dbName);
      assert.equal(identity.owner, owner);
      assert.equal(identity.host, '127.0.0.1');
      assert.equal(identity.port, 55440);
      assert.equal(identity.version, 180006);
      assert.equal(canonical(identity.directory), canonical(data));
      return { raw, safe };
    } catch (error) {
      await safe.close();
      throw error;
    }
  }
  const maintenance = await connect('postgres');
  let target;
  let changed = false;
  const reload = () =>
    execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe', ['-D', data, 'reload'], {
      encoding: 'utf8',
    });
  try {
    assert.equal(
      (
        await maintenance.safe.query(
          'SELECT count(*)::int AS n FROM pg_database WHERE datname=$1',
          [database],
        )
      ).rows[0].n,
      0,
      'Test DB already exists; refuse reuse',
    );
    const rules = privateHba(existing, owner);
    rules[2] = rules[2].replace(existing + ',postgres', existing + ',postgres,' + database);
    writeFileSync(hbaFile, rules.join('\n') + '\n');
    changed = true;
    reload();
    assert.equal(
      (
        await maintenance.safe.query(
          "SELECT count(*)::int AS n FROM pg_hba_file_rules WHERE $1=ANY(database) AND user_name=ARRAY[$2]::text[] AND address='127.0.0.1' AND netmask='255.255.255.255' AND auth_method='trust' AND error IS NULL",
          [database, owner],
        )
      ).rows[0].n,
      1,
    );
    await maintenance.safe.query(
      'CREATE DATABASE "' + database + '" OWNER "' + owner + '" TEMPLATE template0',
    );
    target = await connect(database);
    assert.equal(
      (
        await target.safe.query(
          "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public'",
        )
      ).rows[0].n,
      0,
    );
    const options = {
      migrationsFolder: path.join(root, 'lib/db/drizzle'),
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    };
    await bounded(migrate(drizzle(target.raw), options), 30000, 'first migrate', {
      onTimeout: () => disconnect(target.raw),
    });
    const ledgerSql = 'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id';
    const ledger = (await target.safe.query(ledgerSql)).rows;
    const files = readMigrationFiles(options);
    assert.equal(ledger.length, 6);
    assert.deepEqual(
      ledger.map((r) => r.hash),
      files.map((f) => f.hash),
    );
    assert.deepEqual(
      ledger.map((r) => String(r.created_at)),
      files.map((f) => String(f.folderMillis)),
    );
    const schemaSql =
      "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','drizzle') ORDER BY table_schema,table_name,ordinal_position";
    const before = (await target.safe.query(schemaSql)).rows;
    const sequence = (
      await target.safe.query('SELECT last_value,is_called FROM public.question_code_seq')
    ).rows;
    await bounded(migrate(drizzle(target.raw), options), 30000, 'repeat migrate', {
      onTimeout: () => disconnect(target.raw),
    });
    assert.deepEqual((await target.safe.query(ledgerSql)).rows, ledger);
    assert.deepEqual((await target.safe.query(schemaSql)).rows, before);
    assert.deepEqual(
      (await target.safe.query('SELECT last_value,is_called FROM public.question_code_seq')).rows,
      sequence,
    );
    const tables = (
      await target.safe.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      )
    ).rows.map((r) => r.table_name);
    assert.equal(tables.length, 11);
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          database,
          owner,
          host: '127.0.0.1',
          port: 55440,
          pid: 16996,
          firstRunMigrations: ledger.length,
          repeatRun: 'NO_CHANGES',
          publicTables: tables,
          sequence,
          populatedRehearsalDatabases: 'NO_CONNECTIONS_OR_WRITES',
        },
        null,
        2,
      ),
    );
  } finally {
    if (target) await target.safe.close();
    if (changed) {
      writeFileSync(hbaFile, original);
      reload();
      assert(readFileSync(hbaFile).equals(original));
    }
    await maintenance.safe.close();
  }
}
