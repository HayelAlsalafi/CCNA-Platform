// Restores only decoded COPY values into the exact disposable target, then ROLLBACK.
// Never executes archive DDL, setval, arbitrary SQL, cleanup or application connections.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { decodeArchiveTables } from './phase8a-cleanup/final-planner.mjs';
import {
  questionBankPlan,
  snapshotForCount,
  rowProof,
  assertDisposableLedger,
} from './question-bank-upgrade-core.mjs';
import { withDisposableAccess, disposable } from './question-bank-disposable-access.mjs';
import { migratorClient,readSchemaCatalog,assertSchemaCatalog } from './phase6a-local/upgrade.mjs';
export async function restoreBackupProof(root, archivePath, proofPath, afterRestore) {
  assert(afterRestore === undefined || typeof afterRestore === 'function');
  const archive = realpathSync(archivePath),
    proofFile = realpathSync(proofPath),
    parent = realpathSync(path.join(root, '.local/question-bank-upgrade'));
  const canonical = (s) => s.replaceAll('\\', '/').toLowerCase();
  for (const file of [archive, proofFile])
    assert(canonical(file).startsWith(canonical(parent) + '/'), 'Unexpected archive/proof path');
  assert.equal(path.dirname(archive), path.dirname(proofFile));
  assert.equal(path.basename(archive), 'before-upgrade.dump');
  assert.equal(path.basename(proofFile), 'restore-proof.json');
  const proof = JSON.parse(readFileSync(proofFile, 'utf8')),
    plan = questionBankPlan(root);
  assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), proof.sha256);
  assert([7, 8, 9, 10, 11].includes(proof.baselineCount));
  const snapshot = snapshotForCount(root, proof.baselineCount),
    tables = Object.values(snapshot.tables)
      .map((t) => t.name)
      .sort();
  assert.deepEqual(Object.keys(proof.tables).sort(), tables);
  for (const p of Object.values(proof.tables))
    assert(Number.isSafeInteger(p.count) && p.count >= 0 && /^[a-f0-9]{64}$/.test(p.hash));
  const require = createRequire(path.join(root, 'lib/db/package.json')),
    { Client } = require('pg'),
    { drizzle } = require('drizzle-orm/node-postgres'),
    { migrate } = require('drizzle-orm/node-postgres/migrator');
  return withDisposableAccess(root, async ({ data, env }) => {
    const client = new Client({
      ...disposable,
      application_name: 'ccna-question-bank-restore-proof',
    });
    client.on('error', () => {});
    let originalLedger;
    try {
      await client.connect();
      const r = (
        await client.query(
          "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner",
        )
      ).rows[0];
      assert.deepEqual(r, {
        database: disposable.database,
        owner: disposable.user,
        host: disposable.host,
        port: 55440,
        directory: data.replaceAll('\\', '/'),
        version: 180006,
        database_owner: disposable.user,
      });
      originalLedger = (
        await client.query(
          'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
        )
      ).rows;
      assert.equal(originalLedger.length, 7);
      assertDisposableLedger(originalLedger, plan.manifest.slice(0, 7));
      const initial = snapshotForCount(root, 7);
      const initialCatalog=await readSchemaCatalog(client);assert(initialCatalog.tables.every(t=>t.owner===disposable.user),'Unexpected disposable table owner');assertSchemaCatalog({...initialCatalog,tables:initialCatalog.tables.map(t=>({...t,owner:'ccna_phase6a_migrator'}))},initial);
      for (const table of Object.values(initial.tables).map((t) => t.name))
        assert.equal(
          (await client.query('SELECT count(*)::int AS n FROM public."' + table + '"')).rows[0].n,
          0,
          'Disposable data is not empty',
        );
      await client.query('BEGIN');
      await client.query(
        "SET LOCAL TimeZone='UTC'; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='180s'",
      );
      const folder = path.join(path.dirname(archive), 'restore-schema');
      mkdirSync(folder, { recursive: true });
      for (const e of plan.journal.entries.slice(0, proof.baselineCount))
        writeFileSync(
          path.join(folder, e.tag + '.sql'),
          readFileSync(path.join(root, '.local/question-bank-migration', e.tag + '.sql')),
        );
      mkdirSync(path.join(folder, 'meta'), { recursive: true });
      writeFileSync(
        path.join(folder, 'meta/_journal.json'),
        JSON.stringify({
          ...plan.journal,
          entries: plan.journal.entries.slice(0, proof.baselineCount),
        }),
      );
      await migrate(drizzle(migratorClient(client)), { migrationsFolder: folder });
      const sql = execFileSync(
          'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',
          ['--data-only', '--schema=public', '--no-owner', '--no-privileges', '--file=-', archive],
          {
            env,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 120000,
            maxBuffer: 128 * 1024 * 1024,
          },
        ),
        decoded = decodeArchiveTables(sql);
      assert.deepEqual(Object.keys(decoded).sort(), tables, 'Unexpected backup COPY inventory');
      const order = [
        'users',
        'topics',
        'questions',
        'question_options',
        'exam_blueprints',
        'exam_domains',
        'exam_objectives',
        'question_objectives',
        'question_revisions',
        'practice_deliveries',
        'practice_attempts',
        'learning_sessions',
        'achievement_definitions',
        'learner_achievements',
        'question_deletion_audits',
        'learning_session_items',
      ].filter((t) => tables.includes(t));
      // Only disposable INSERT-time policies are suspended for historical restoration.
      // Every FK, CHECK, append-only UPDATE/DELETE/TRUNCATE guard stays enabled.
      await client.query(
        'ALTER TABLE public.practice_attempts DISABLE TRIGGER practice_attempts_validate_revision',
      );
      if (proof.baselineCount >= 8)
        await client.query(
          'ALTER TABLE public.practice_attempts DISABLE TRIGGER nexus_deferred_grading',
        );
      for (const table of order) {
        const model = snapshot.tables['public.' + table],
          rows = decoded[table];
        for (const row of rows) {
          assert.deepEqual(
            Object.keys(row).sort(),
            Object.keys(model.columns).sort(),
            'Unexpected COPY column inventory',
          );
          for (const [key, column] of Object.entries(model.columns)) {
            if (row[key] !== null && column.type === 'jsonb') row[key] = JSON.parse(row[key]);
          }
        }
        for (let start = 0; start < rows.length; start += 250) {
          const updates =
            table === 'achievement_definitions'
              ? ' ON CONFLICT(id) DO UPDATE SET ' +
                Object.keys(model.columns)
                  .filter((c) => c !== 'id')
                  .map((c) => '"' + c + '"=excluded."' + c + '"')
                  .join(',')
              : '';
          await client.query(
            'INSERT INTO public."' +
              table +
              '" SELECT * FROM jsonb_populate_recordset(NULL::public."' +
              table +
              '",$1::jsonb)' +
              updates,
            [JSON.stringify(rows.slice(start, start + 250))],
          );
        }
      }
      await client.query(
        'ALTER TABLE public.practice_attempts ENABLE TRIGGER practice_attempts_validate_revision',
      );
      if (proof.baselineCount >= 8)
        await client.query(
          'ALTER TABLE public.practice_attempts ENABLE TRIGGER nexus_deferred_grading',
        );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.deepEqual(
        await rowProof(client, tables),
        proof.tables,
        'Restored table counts/hashes differ',
      );
      // Optional developer rehearsal runs ONLY after exact restored-row proofs,
      // inside this same disposable transaction. It can never commit here.
      const rehearsal = afterRestore ? await afterRestore(client) : undefined;
      await client.query('ROLLBACK');
      assert.deepEqual(
        (
          await client.query(
            'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
          )
        ).rows,
        originalLedger,
      );
      assert.deepEqual(await readSchemaCatalog(client),initialCatalog,'Disposable schema differs after restore rollback');
      for (const table of Object.values(initial.tables).map((t) => t.name))
        assert.equal(
          (await client.query('SELECT count(*)::int AS n FROM public."' + table + '"')).rows[0].n,
          0,
        );
      return {
        restoreVerified: true,
        allRowsAndHashesMatched: true,
        rolledBack: true,
        database: disposable.database,
        port: 55440,
        tablesVerified: tables.length,
        sequenceRestored: false,
        ...(rehearsal === undefined ? {} : { rehearsal }),
      };
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end().catch(() => {});
    }
  });
}
