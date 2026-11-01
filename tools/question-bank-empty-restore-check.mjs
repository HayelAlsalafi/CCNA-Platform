// Self-test of the archive decoding/restore workflow using ONLY the existing
// empty disposable DB. It is not a backup or restoration test of application data.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  withDisposableAccess,
  disposable,
  protectOperatorFolder,
} from './question-bank-disposable-access.mjs';
import {
  questionBankPlan,
  assertDisposableLedger,
  rowProof,
  snapshotForCount,
} from './question-bank-upgrade-core.mjs';
import { restoreBackupProof } from './question-bank-restore.mjs';
export async function emptyRestoreCheck(root) {
  const folder = path.join(
    root,
    '.local/question-bank-upgrade',
    'empty-self-test-' + new Date().toISOString().replaceAll(':', '-'),
  );
  let archive, proofFile;
  await withDisposableAccess(root, async ({ data, env }) => {
    const require = createRequire(path.join(root, 'lib/db/package.json')),
      { Client } = require('pg'),
      client = new Client({ ...disposable, application_name: 'ccna-empty-backup-self-test' });
    client.on('error', () => {});
    try {
      await client.connect();
      const identity = (
        await client.query(
          "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner",
        )
      ).rows[0];
      assert.deepEqual(identity, {
        database: disposable.database,
        owner: disposable.user,
        host: '127.0.0.1',
        port: 55440,
        directory: data.replaceAll('\\', '/'),
        version: 180006,
        database_owner: disposable.user,
      });
      const ledger = (
        await client.query(
          'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
        )
      ).rows;
      assert.equal(ledger.length, 7);
      assertDisposableLedger(ledger, questionBankPlan(root).manifest.slice(0, 7));
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL TimeZone='UTC'");
      const tables = Object.values(snapshotForCount(root, 7).tables).map((t) => t.name),
        proof = await rowProof(client, tables);
      assert(
        Object.values(proof).every((r) => r.count === 0),
        'Self-test requires empty disposable public tables',
      );
      const id = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
      assert(/^[0-9A-F-]+$/.test(id));
      mkdirSync(folder, { recursive: true });
      protectOperatorFolder(folder, env);
      archive = path.join(folder, 'before-upgrade.dump');
      proofFile = path.join(folder, 'restore-proof.json');
      execFileSync(
        'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',
        [
          '--host=127.0.0.1',
          '--port=55440',
          '--username=' + disposable.user,
          '--dbname=' + disposable.database,
          '--no-password',
          '--format=custom',
          '--snapshot=' + id,
          '--file=' + archive,
        ],
        {
          env: { ...env, PGCONNECT_TIMEOUT: '5' },
          stdio: 'pipe',
          windowsHide: true,
          timeout: 60000,
        },
      );
      writeFileSync(
        proofFile,
        JSON.stringify(
          {
            sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
            baselineCount: 7,
            tables: proof,
          },
          null,
          2,
        ) + '\n',
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });
  const restoration = await restoreBackupProof(root, archive, proofFile);
  return {
    purpose: 'EMPTY_DISPOSABLE_RESTORE_SELF_TEST_ONLY',
    ...restoration,
    applicationDatabaseConnections: 0,
  };
}
