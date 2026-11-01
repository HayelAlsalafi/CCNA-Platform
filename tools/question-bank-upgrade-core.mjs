// Inert guarded planning, source promotion and catalog validators.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { migrationManifest, assertLedger, policy } from './phase6a-local/policy.mjs';
import { assertSchemaCatalog, readSchemaCatalog } from './phase6a-local/upgrade.mjs';
import { assertControlledDeleteState } from './phase8a-cleanup/controlled-delete.mjs';
import {
  nexusMigration,
  nexusSnapshot,
  assertNexusSource,
  assertNexusFunction,
  assertNexusPrivileges,
} from './nexus-policy.mjs';
import {
  learningMigration,
  learningSnapshot,
  assertLearningSource,
  assertLearningPrivileges,
} from './learning-policy.mjs';
import {
  multipleAnswerMigration,
  universalDeleteMigration,
  assertQuestionBankSource,
  questionBankSnapshot,
  assertQuestionBankFunctions,
} from './question-bank-policy.mjs';
export function questionBankPlan(root) {
  const official = migrationManifest(root);
  assert([7, 8, 9, 10, 11].includes(official.length));
  assertNexusSource(root);
  assertLearningSource(root);
  assertQuestionBankSource(root);
  const journal = JSON.parse(
    readFileSync(path.join(root, 'lib/db/drizzle/proposed/meta/0010_journal.json'), 'utf8'),
  );
  const current = JSON.parse(
    readFileSync(path.join(root, 'lib/db/drizzle/meta/_journal.json'), 'utf8'),
  );
  assert.equal(journal.entries.length, 11);
  assert.deepEqual(journal.entries.slice(0, current.entries.length), current.entries);
  assert.deepEqual({...current,entries:journal.entries},journal,'Official/proposed journal metadata differs');
  const all = [
    ...official.slice(0, 7),
    ...[nexusMigration, learningMigration, multipleAnswerMigration, universalDeleteMigration].map(
      ([tag, when, hash], i) => {
        assert.deepEqual(journal.entries[i + 7], {
          idx: i + 7,
          version: '7',
          when,
          tag,
          breakpoints: true,
        });
        return { tag, when, hash };
      },
    ),
  ];
  for (const [i, e] of all.entries()) {
    const location = i < 7 ? 'lib/db/drizzle/' : 'lib/db/drizzle/proposed/';
    const source = readFileSync(path.join(root, location + e.tag + '.sql'));
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      e.hash,
      'Raw migration bytes mismatch',
    );
    const staged = path.join(root, '.local/question-bank-migration', e.tag + '.sql');
    assert(readFileSync(staged).equals(source), 'Staged migration differs from proposal');
  }
  assert.deepEqual(
    JSON.parse(
      readFileSync(path.join(root, '.local/question-bank-migration/meta/_journal.json'), 'utf8'),
    ),
    journal,
  );
  return {
    manifest: all,
    journal,
    sourceCount: official.length,
    pendingSource: all.slice(official.length).map((e) => e.tag),
    target: {
      host: policy.host,
      port: policy.port,
      database: policy.database,
      owner: policy.migrationRole,
      systemIdentifier: policy.upgradeSystemIdentifier,
    },
    databaseOperations: 0,
  };
}
export function snapshotForCount(root, count) {
  assert([7, 8, 9, 10, 11].includes(count), 'Unexpected ledger entry count');
  return count === 7
    ? JSON.parse(readFileSync(path.join(root, 'lib/db/drizzle/meta/0006_snapshot.json'), 'utf8'))
    : count === 8
      ? nexusSnapshot(root)
      : count === 9
        ? learningSnapshot(root)
        : questionBankSnapshot(root, count === 10 ? 9 : 10);
}
// Only this older, previously rehearsed disposable ledger used the reviewed CRLF
// bytes for 0004. Never used for the application target and never rewrites a ledger.
export function assertDisposableLedger(ledger, manifest) {
  const expected = manifest.map((m, i) =>
    i === 4
      ? { ...m, hash: '5c6614d26e7d37171fb66f86c05d646ce83b81861a0c4f964c720b2f193abcd5' }
      : m,
  );
  assert.equal(
    manifest[4].hash,
    '74584d593471b633abd8387f44d15c19b9cdd49b3fa54cfaa26712d1c043b495',
  );
  assertLedger(ledger, expected);
}
export function promoteQuestionBankSource(root, plan) {
  assert.deepEqual(questionBankPlan(root), plan, 'Source changed since preflight');
  for (let i = plan.sourceCount; i < 11; i++) {
    const e = plan.manifest[i],
      tag = String(i).padStart(4, '0');
    for (const relative of [e.tag + '.sql', 'meta/' + tag + '_snapshot.json']) {
      const bytes = readFileSync(path.join(root, 'lib/db/drizzle/proposed', relative)),
        target = path.join(root, 'lib/db/drizzle', relative);
      if (existsSync(target))
        assert(readFileSync(target).equals(bytes), 'Refuse overwriting existing migration work');
      else writeFileSync(target, bytes, { flag: 'wx' });
    }
  }
  // Journal is written last. Earlier failures cannot make Drizzle execute a partial inventory.
  writeFileSync(
    path.join(root, 'lib/db/drizzle/meta/_journal.json'),
    JSON.stringify(plan.journal, null, 2) + '\n',
  );
  assert.deepEqual(migrationManifest(root), plan.manifest);
}
export async function assertBankState(
  client,
  root,
  plan,
  { owner = policy.migrationRole, runtimeRole = policy.appRole } = {},
) {
  const ledger = (
    await client.query(
      'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
    )
  ).rows;
  const count = ledger.length;
  assert([7, 8, 9, 10, 11].includes(count), 'Unreviewed ledger inventory');
  if (runtimeRole === null) {
    assert.equal(owner, 'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170');
    const target = (
      await client.query(
        'SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port',
      )
    ).rows[0];
    assert.deepEqual(target, {
      database: 'ccna_drizzle_check_20261012_c08f12ad34b6',
      host: '127.0.0.1',
      port: 55440,
    });
    assertDisposableLedger(ledger, plan.manifest.slice(0, count));
  } else assertLedger(ledger, plan.manifest.slice(0, count));
  assert.equal(new Set(ledger.map((r) => String(r.id))).size, count);
  assert(
    ledger.every((r) => Number.isSafeInteger(r.id) && r.id > 0),
    'Invalid ledger identities',
  );
  const catalog = await readSchemaCatalog(client);
  assert(catalog.tables.every((t) => t.owner === owner));
  assertSchemaCatalog(
    { ...catalog, tables: catalog.tables.map((t) => ({ ...t, owner: policy.migrationRole })) },
    snapshotForCount(root, count),
  );
  assert.equal(
    (
      await client.query(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()',
      )
    ).rows[0]?.owner,
    owner,
    'Unexpected database owner',
  );
  const namespaces = (
    await client.query(
      "SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner FROM pg_namespace n WHERE n.nspname IN ('public','drizzle') ORDER BY n.nspname",
    )
  ).rows;
  assert.deepEqual(namespaces, [
    { nspname: 'drizzle', owner },
    { nspname: 'public', owner: namespaces[1]?.owner },
  ]);
  assert(
    [owner, 'pg_database_owner'].includes(namespaces[1].owner),
    'Unexpected public schema owner',
  );
  if (count >= 10)
    await assertQuestionBankFunctions(client, root, count === 10 ? 9 : 10, owner, runtimeRole);
  else if (runtimeRole !== null) await assertControlledDeleteState(client, true);
  if (count >= 8) await assertNexusFunction(client, root, owner);
  if (runtimeRole !== null) {
    if (count >= 8) await assertNexusPrivileges(client);
    if (count >= 9) await assertLearningPrivileges(client);
  }
  const triggers = (
    await client.query(
      `SELECT c.relname AS table,t.tgname AS name,t.tgenabled AS enabled,p.proname AS function,t.tgtype AS kind,t.tgnargs AS arguments,t.tgqual IS NULL AS unconditional,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=t.tgrelid AND a.attnum=ANY(t.tgattr::smallint[]) ORDER BY a.attnum) AS columns FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relnamespace='public'::regnamespace AND p.pronamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    )
  ).rows;
  const expected = [
    ['questions', 'questions_question_code_immutable', 'prevent_question_code_update', 19],
    ...['question_revisions', 'practice_deliveries', 'practice_attempts'].flatMap((t) => [
      [t, t + '_immutable', 'reject_revision_history_change', 27],
      [t, t + '_no_truncate', 'reject_revision_history_change', 34],
    ]),
    ['question_revisions', 'question_revisions_validate', 'validate_question_snapshot', 7],
    ['practice_attempts', 'practice_attempts_validate_revision', 'validate_revision_attempt', 7],
    ...(count >= 8
      ? [['practice_attempts', 'nexus_deferred_grading', 'nexus_guard_deferred_attempt', 7]]
      : []),
    ...(count === 11
      ? [
          [
            'question_deletion_audits',
            'question_deletion_audits_immutable',
            'reject_revision_history_change',
            27,
          ],
          [
            'question_deletion_audits',
            'question_deletion_audits_no_truncate',
            'reject_revision_history_change',
            34,
          ],
        ]
      : []),
  ]
    .map(([table, name, fn, kind]) => ({
      table,
      name,
      enabled: 'O',
      function: fn,
      kind,
      arguments: 0,
      unconditional: true,
      deferrable:false,
      deferred:false,
      columns:name==='questions_question_code_immutable'?['question_code']:[],
    }))
    .sort((a, b) => (a.table + '/' + a.name).localeCompare(b.table + '/' + b.name));
  assert.deepEqual(triggers, expected, 'Unexpected trigger binding/disabled trigger');
  const codeBody=readFileSync(path.join(root,'lib/db/drizzle/0002_question_code_immutable.sql'),'utf8').match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];assert(codeBody,'Missing reviewed question-code guard');
  const codeGuard=(await client.query("SELECT p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid='public.prevent_question_code_update()'::regprocedure")).rows[0];assert.deepEqual(codeGuard,{body:codeBody,definer:false,config:null,owner},'Question-code immutable guard differs');
  if (count < 10) {
    const original = readFileSync(
      path.join(root, 'lib/db/drizzle/0004_question_revisions.sql'),
      'utf8',
    );
    for (const name of ['validate_question_snapshot', 'validate_revision_attempt']) {
      const body = original.match(
        new RegExp(
          'CREATE FUNCTION public\\.' + name + '\\(\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
        ),
      )?.[1];
      assert(body, 'Expected original grading function');
      const r = (
        await client.query(
          'SELECT p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid=$1::regprocedure',
          ['public.' + name + '()'],
        )
      ).rows[0];
      assert.deepEqual(r, {
        body,
        definer: false,
        config: ['search_path=pg_catalog, public'],
        owner,
      });
    }
  }
  return {
    count,
    ledger,
    catalog,
    tables: Object.values(snapshotForCount(root, count).tables).map((t) => t.name),
  };
}
export async function rowProof(client, tables, snapshot) {
  const proof = {};
  for (const table of tables) {
    assert(/^[a-z_][a-z_0-9]*$/.test(table));
    const columns = snapshot ? Object.keys(snapshot.tables['public.' + table].columns) : null;
    if (columns) assert(columns.every((c) => /^[a-z_][a-z_0-9]*$/.test(c)));
    const source = columns
      ? '(SELECT ' + columns.map((c) => '"' + c + '"').join(',') + ' FROM public."' + table + '")'
      : 'public."' + table + '"';
    proof[table] = (
      await client.query(
        `SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM ${source} t`,
      )
    ).rows[0];
  }
  return proof;
}
