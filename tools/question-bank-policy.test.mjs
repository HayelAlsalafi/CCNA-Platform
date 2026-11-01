// Offline only: no connection, no secret files, no source mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  questionBankPlan,
  snapshotForCount,
  assertDisposableLedger,
  promoteQuestionBankSource,
} from './question-bank-upgrade-core.mjs';
import {
  assertQuestionBankSource,
  questionBankSnapshot,
  assertQuestionBankFunctions,
} from './question-bank-policy.mjs';
import { assertLedger } from './phase6a-local/policy.mjs';
const root = process.cwd(),
  plan = questionBankPlan(root),
  read = (f) => readFileSync(f, 'utf8');
test('offline plan pins the exact local target and ordered complete 0000-0010 chain', () => {
  assert.equal(plan.databaseOperations, 0);
  assert.deepEqual(plan.target, {
    host: '127.0.0.1',
    port: 5432,
    database: 'ccna_phase6a_dev',
    owner: 'ccna_phase6a_migrator',
    systemIdentifier: '7694701597474139084',
  });
  assert.equal(plan.manifest.length, 11);
  assertQuestionBankSource(root);
  for (let i = 1; i < 11; i++) assert(plan.manifest[i].when > plan.manifest[i - 1].when);
});
function promotionFixture() {
  const folder = path.join(root, '.local/question-bank-promotion-tests');
  mkdirSync(folder, { recursive: true });
  const target = mkdtempSync(path.join(folder, 'offline-'));
  mkdirSync(path.join(target, 'lib/db'), { recursive: true });
  cpSync(path.join(root, 'lib/db/drizzle'), path.join(target, 'lib/db/drizzle'), {
    recursive: true,
  });
  // Test promotion from the historical prefix even after the real source is
  // promoted. This changes only the uniquely created offline fixture copy.
  const journalFile=path.join(target,'lib/db/drizzle/meta/_journal.json'),journal=JSON.parse(read(journalFile));
  writeFileSync(journalFile,JSON.stringify({...journal,entries:journal.entries.slice(0,7)},null,2)+'\n');
  mkdirSync(path.join(target, '.local'), { recursive: true });
  cpSync(
    path.join(root, '.local/question-bank-migration'),
    path.join(target, '.local/question-bank-migration'),
    { recursive: true },
  );
  return target;
}
test('source promotion copies exact proposals and ordered metadata, then repeats without overwriting work', () => {
  const target = promotionFixture(),
    before = questionBankPlan(target);
  promoteQuestionBankSource(target, before);
  const after = questionBankPlan(target);
  assert.equal(after.sourceCount, 11);
  assert.deepEqual(after.pendingSource, []);
  assert.deepEqual(after.manifest, plan.manifest);
  promoteQuestionBankSource(target, after);
  assert.deepEqual(questionBankPlan(target), after);
});
test('source promotion refuses an existing conflicting migration without replacing it or changing the journal', () => {
  const target = promotionFixture(),
    before = questionBankPlan(target),
    file = path.join(target, 'lib/db/drizzle', before.pendingSource[0] + '.sql'),
    journal = read(path.join(target, 'lib/db/drizzle/meta/_journal.json'));
  writeFileSync(file, 'UNRELATED LOCAL WORK');
  assert.throws(() => promoteQuestionBankSource(target, before));
  assert.equal(read(file), 'UNRELATED LOCAL WORK');
  assert.equal(read(path.join(target, 'lib/db/drizzle/meta/_journal.json')), journal);
});
test('application ledgers remain exact, duplicate-sensitive and never accept the disposable CRLF hash', () => {
  const ledger = plan.manifest
    .slice(0, 7)
    .map((m, i) => ({ id: i + 1, hash: m.hash, created_at: String(m.when) }));
  assertLedger(ledger, plan.manifest.slice(0, 7));
  for (const mutate of [
    (l) => (l[4].hash = '5c6614d26e7d37171fb66f86c05d646ce83b81861a0c4f964c720b2f193abcd5'),
    (l) => (l[2].created_at = '0'),
    (l) => (l[3] = { ...l[2] }),
    (l) => l.push({ ...l[0] }),
  ]) {
    const altered = structuredClone(ledger);
    mutate(altered);
    assert.throws(() => assertLedger(altered, plan.manifest.slice(0, 7)));
  }
  const historical = structuredClone(ledger);
  historical[4].hash = '5c6614d26e7d37171fb66f86c05d646ce83b81861a0c4f964c720b2f193abcd5';
  assertDisposableLedger(historical, plan.manifest.slice(0, 7));
  historical[4].hash = '0'.repeat(64);
  assert.throws(() => assertDisposableLedger(historical, plan.manifest.slice(0, 7)));
});
test('only exact disposable function owner may omit the live runtime-role assertions', async () => {
  let queried = false;
  await assert.rejects(
    assertQuestionBankFunctions(
      {
        query: async () => {
          queried = true;
        },
      },
      root,
      10,
      'ccna_phase6a_migrator',
      null,
    ),
  );
  assert.equal(queried, false);
});
function functions() {
  const definitions = new Map();
  for (const name of [
    'lib/db/drizzle/0004_question_revisions.sql',
    'lib/db/drizzle/0006_controlled_history_delete.sql',
    'lib/db/drizzle/proposed/0009_multiple_answer_questions.sql',
    'lib/db/drizzle/proposed/0010_universal_question_deletion.sql',
  ])
    for (const m of read(name).matchAll(
      /CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g,
    ))
      definitions.set(m[1], m[2]);
  return [
    'validate_question_snapshot',
    'validate_revision_attempt',
    'reject_revision_history_change',
    'delete_question_with_history',
    'execute_question_deletion',
    'delete_question_without_learner_history',
  ].map((name) => {
    const grading = name.startsWith('validate_');
    return {
      name,
      body: definitions.get(name),
      definer: !grading,
      config: [grading ? 'search_path=pg_catalog, public' : 'search_path=pg_catalog'],
      owner: 'ccna_phase6a_migrator',
      arguments:
        grading || name === 'reject_revision_history_change'
          ? ''
          : name === 'execute_question_deletion'
            ? '2950 2950 16'
            : '2950 2950',
      result: grading || name === 'reject_revision_history_change' ? 'trigger' : 'jsonb',
      public_execute: false,
      runtime_execute: name.startsWith('delete_question_'),
    };
  });
}
test('accepts the exact function definitions and restricted recovery table privileges', async () => {
  await assertQuestionBankFunctions(
    {
      query: async (q) => ({
        rows: q.includes('FROM pg_proc p')
          ? functions()
          : q.includes('has_type_privilege') ? [{type_usage:true}] : [{ unsafe: false, public_access: false }],
      }),
    },
    root,
  );
});
for (const [field, value] of [
  ['body', 'tampered body'],
  ['owner', 'postgres'],
  ['definer', false],
  ['config', ['search_path=public']],
  ['arguments', '2950'],
  ['public_execute', true],
  ['runtime_execute', true],
])
  test('rejects altered controlled function ' + field, async () => {
    const rows = functions();
    rows.find((r) => r.name === 'execute_question_deletion')[field] = value;
    await assert.rejects(assertQuestionBankFunctions({ query: async () => ({ rows }) }, root));
  });
for (const denied of [
  { unsafe: true, public_access: false },
  { unsafe: false, public_access: true },
])
  test('rejects recovery table privilege exposure ' + JSON.stringify(denied), async () => {
    await assert.rejects(
      assertQuestionBankFunctions(
        { query: async (q) => ({ rows: q.includes('FROM pg_proc p') ? functions() : q.includes('has_type_privilege') ? [{type_usage:true}] : [denied] }) },
        root,
      ),
      /Recovery\/audit table must be operator-restricted/,
    );
  });
test('rejects PUBLIC execution of application grading triggers instead of granting it',async()=>{
 const rows=functions();rows.find(r=>r.name==='validate_question_snapshot').public_execute=true;await assert.rejects(assertQuestionBankFunctions({query:async()=>({rows})},root),/Unexpected public execution/);
});
test('rejects missing exact runtime usage on the multiple-answer enum',async()=>{
 await assert.rejects(assertQuestionBankFunctions({query:async q=>({rows:q.includes('FROM pg_proc p')?functions():[{type_usage:false}]})},root),/Missing runtime usage/);
});
test('snapshots retain revision/attempt/delivery schema and represent only intentional session tombstones', () => {
  const before = questionBankSnapshot(root, 9),
    after = questionBankSnapshot(root, 10);
  for (const name of [
    'questions',
    'topics',
    'practice_attempts',
    'practice_deliveries',
    'question_revisions',
    'question_options',
    'question_objectives',
  ])
    assert.deepEqual(after.tables['public.' + name], before.tables['public.' + name]);
  assert.equal(after.prevId, before.id);
  assert.equal(after.tables['public.learning_session_items'].columns.question_id.notNull, false);
  assert(after.tables['public.question_deletion_audits']);
  for (const count of [7, 8, 9, 10, 11])
    assert(snapshotForCount(root, count).tables['public.questions']);
  for (const count of [0, 6, 12]) assert.throws(() => snapshotForCount(root, count));
});
test('activation is guarded, stdin-only, backup-before-promotion and uses the official migrator', () => {
  const source = read('tools/execute-question-bank-upgrade.mjs');
  assert(source.indexOf("stage = 'full-backup'") < source.indexOf('await restoreBackupProof'));
  assert(
    source.indexOf('await restoreBackupProof') <
      source.indexOf('promoteQuestionBankSource(root, plan)'),
  );
  assert(source.includes("mode === '--check' ? 'BEGIN READ ONLY' : 'BEGIN'"));
  assert(source.includes('drizzle-orm/node-postgres/migrator'));
  assert(source.includes('migratorClient(client)'));
  assert(source.includes('pg_export_snapshot()'));
  assert(source.includes('originalRowsAndCodeSequencePreserved: true'));
  assert(
    !/DROP DATABASE|TRUNCATE TABLE|readFileSync\([^\n]*[\x27\x22]\.env|DATABASE_URL/.test(source),
  );
  const wrapper = read('tools/invoke-question-bank-upgrade.ps1');
  assert(wrapper.includes('-AsSecureString'));
  assert(wrapper.includes('$info.RedirectStandardInput=$true'));
  assert(wrapper.includes('$info.EnvironmentVariables.Clear()'));
  assert(!wrapper.includes('ReadAllText'));
});
test('migration never deletes on installation, permits only explicit active Admin calls and never disables constraints', () => {
  const source = read('lib/db/drizzle/proposed/0010_universal_question_deletion.sql');
  assert(source.includes("actor.role::text<>'ADMIN' OR actor.status::text<>'ACTIVE'"));
  assert(source.includes('question_history_confirmation_required'));
  assert(source.includes('question_delete_unowned_dependency'));
  assert(source.includes('REVOKE ALL ON FUNCTION public.execute_question_deletion'));
  assert(source.includes('payload_hash=encode(sha256'));
  assert(
    !/DISABLE TRIGGER|session_replication_role|CASCADE;|GRANT DELETE|sprint7|pilotQuestionIds/i.test(
      source,
    ),
  );
  assert(
    source.indexOf('DELETE FROM public.questions') >
      source.indexOf('CREATE FUNCTION public.execute_question_deletion'),
  );
});
test('restoration runs only decoded values with rollback, exact target, row hashes and no sequence execution', () => {
  const source = read('tools/question-bank-restore.mjs');
  assert(source.includes('withDisposableAccess'));
  assert(source.includes('assert.equal(originalLedger.length, 7)'));
  assert(source.includes('decodeArchiveTables'));
  assert(source.includes('jsonb_populate_recordset'));
  assert(source.includes("await client.query('ROLLBACK')"));
  assert(source.includes('proof.tables'));
  assert(!/client\.query\(sql\)|setval\(|DROP DATABASE|TRUNCATE TABLE/.test(source));
});
