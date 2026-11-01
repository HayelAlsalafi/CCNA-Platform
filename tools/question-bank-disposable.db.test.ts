import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Explicit opt-in, exact existing empty target, outer rollback for every test.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as schema from '@workspace/db/schema';
import { disposable } from './question-bank-disposable-access.mjs';
import { migratorClient } from './phase6a-local/upgrade.mjs';
import {
  questionBankPlan,
  assertBankState,
  rowProof,
  snapshotForCount,
  assertDisposableLedger,
} from './question-bank-upgrade-core.mjs';
vi.mock('@workspace/db', async () => ({
  ...(await import('@workspace/db/schema')),
  db: undefined,
}));
import {
  deleteQuestionsOrdinary,
  previewHistoryDeletion,
  confirmHistoryDeletion,
  historyDeleteConfirmation,
} from '../artifacts/api-server/src/lib/admin-history-delete';
import { startPracticeBatch } from '../artifacts/api-server/src/lib/practice-batch';
import { submitPracticeAnswer } from '../artifacts/api-server/src/lib/practice';
import {
  nexusStartSession,
  nexusSaveSelection,
  nexusFinish,
  nexusSession,
  nexusSessionHistory,
} from '../artifacts/api-server/src/lib/nexus';
const root = portableRoot,
  plan = questionBankPlan(root),
  enabled = process.env.RUN_QUESTION_BANK_DISPOSABLE_TESTS === '1';
let client: Client, db: any, ledger: any, admin: any, learner: any, topic: any;
const identity = () => ({ actorId: admin.id, sessionId: 'sess_bank_test' });
async function question(type = 'MULTIPLE_CHOICE_SINGLE', status = 'ACTIVE', id?: string) {
  const [q] = await db
    .insert(schema.questionsTable)
    .values({
      ...(id ? { id } : {}),
      topicId: topic.id,
      text: 'Synthetic networking fixture ' + randomUUID(),
      type,
      difficulty: 'EASY',
      explanation: 'Synthetic explanation',
      status,
    })
    .returning();
  await db
    .insert(schema.questionOptionsTable)
    .values(
      ['A', 'B', 'C', 'D'].map((optionKey, i) => ({
        questionId: q.id,
        optionKey,
        text: optionKey,
        isCorrect: i === 0 || (type === 'MULTIPLE_CHOICE_MULTIPLE' && i === 1),
        displayOrder: i,
      })),
    );
  return q;
}
async function absent(id: string) {
  for (const table of [
    'questions',
    'question_options',
    'question_objectives',
    'question_revisions',
    'practice_deliveries',
    'practice_attempts',
  ])
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM public."' +
            table +
            '" WHERE ' +
            (table === 'questions' ? 'id' : 'question_id') +
            '=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
}
async function rejected(fn: () => Promise<unknown>, code: string, constraint?: string) {
  await client.query('SAVEPOINT expected_failure');
  try {
    await expect(fn()).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
  }
}
describe.skipIf(!enabled)('Question bank: isolated persistence and universal deletion', () => {
  beforeAll(async () => {
    client = new Client({ ...disposable, application_name: 'ccna-question-bank-isolated-fixture' });
    client.on('error', () => {});
    await client.connect();
    const r = (
      await client.query(
        "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner",
      )
    ).rows[0];
    expect(r).toEqual({
      database: disposable.database,
      owner: disposable.user,
      host: '127.0.0.1',
      port: 55440,
      directory:
        root + '/.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data',
      version: 180006,
      database_owner: disposable.user,
    });
    ledger = (
      await client.query(
        'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
      )
    ).rows;
    expect(ledger).toHaveLength(7);
    assertDisposableLedger(ledger, plan.manifest.slice(0, 7));
    for (const table of Object.values(snapshotForCount(root, 7).tables) as any[])
      expect(
        (await client.query('SELECT count(*)::int AS n FROM public."' + table.name + '"')).rows[0]
          .n,
      ).toBe(0);
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.learning_sessions') IS NULL AND to_regclass('public.question_deletion_audits') IS NULL AS absent",
        )
      ).rows[0].absent,
    ).toBe(true);
  });
  beforeEach(async () => {
    await client.query('BEGIN');
    await client.query(
      "SET LOCAL TimeZone='UTC';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s'",
    );
    await migrate(drizzle(migratorClient(client)), {
      migrationsFolder: root + '/.local/question-bank-migration',
    });
    // Explicit adapter: even BEGIN ISOLATION LEVEL from services must never commit
    // the fixture. Every service/nested transaction is a named SAVEPOINT.
    db = drizzle(client, { schema });
    let savepoint = 0;
    db.transaction = async (fn: any) => {
      const name = 'bank_fixture_' + ++savepoint;
      await client.query('SAVEPOINT ' + name);
      try {
        const result = await fn(db);
        await client.query('RELEASE SAVEPOINT ' + name);
        return result;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT ' + name);
        await client.query('RELEASE SAVEPOINT ' + name);
        throw e;
      }
    };
    [admin, learner] = await db
      .insert(schema.usersTable)
      .values([
        {
          clerkUserId: 'admin-' + randomUUID(),
          email: 'admin@example.invalid',
          displayName: 'Synthetic admin',
          role: 'ADMIN',
        },
        {
          clerkUserId: 'learner-' + randomUUID(),
          email: 'learner@example.invalid',
          displayName: 'Synthetic learner',
        },
      ])
      .returning();
    [topic] = await db
      .insert(schema.topicsTable)
      .values({ slug: 'bank-' + randomUUID(), name: 'Synthetic networking fixture' })
      .returning();
  });
  afterEach(async () => {
    if (client) await client.query('ROLLBACK');
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.query('ROLLBACK');
      expect(
        (
          await client.query(
            'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
          )
        ).rows,
      ).toEqual(ledger);
      for (const table of Object.values(snapshotForCount(root, 7).tables) as any[])
        expect(
          (await client.query('SELECT count(*)::int AS n FROM public."' + table.name + '"')).rows[0]
            .n,
        ).toBe(0);
      expect(
        (
          await client.query(
            "SELECT to_regclass('public.learning_sessions') IS NULL AND to_regclass('public.question_deletion_audits') IS NULL AS absent",
          )
        ).rows[0].absent,
      ).toBe(true);
    } finally {
      await client.end();
    }
  });
  it('applies 0007-0010 through Drizzle, verifies exact schema/functions/triggers and repeats without changes', async () => {
    const state = await assertBankState(client, root, plan, {
      owner: disposable.user,
      runtimeRole: null,
    });
    expect(state.count).toBe(11);
    const rows = await rowProof(client, state.tables);
    await migrate(drizzle(migratorClient(client)), {
      migrationsFolder: root + '/.local/question-bank-migration',
    });
    expect(
      (await assertBankState(client, root, plan, { owner: disposable.user, runtimeRole: null }))
        .ledger,
    ).toEqual(state.ledger);
    expect(await rowProof(client, state.tables)).toEqual(rows);
  });
  it('preserves populated questions, attempts, immutable revisions, deliveries, shared sessions and sequence when applying 0010', async () => {
    // Return to the unchanged seven-entry outer baseline, then create synthetic
    // history under 0009 before applying 0010. No transaction can commit.
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query(
      "SET LOCAL TimeZone='UTC';SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='5s'",
    );
    for (const entry of plan.manifest.slice(0, 10))
      expect(readFileSync(root + '/.local/editor-migration/' + entry.tag + '.sql')).toEqual(
        readFileSync(root + '/.local/question-bank-migration/' + entry.tag + '.sql'),
      );
    expect(
      JSON.parse(readFileSync(root + '/.local/editor-migration/meta/_journal.json', 'utf8')),
    ).toEqual({ ...plan.journal, entries: plan.journal.entries.slice(0, 10) });
    await migrate(drizzle(migratorClient(client)), {
      migrationsFolder: root + '/.local/editor-migration',
    });
    [admin, learner] = await db
      .insert(schema.usersTable)
      .values([
        {
          clerkUserId: 'pre-admin-' + randomUUID(),
          email: 'admin@example.invalid',
          displayName: 'Synthetic preexisting admin',
          role: 'ADMIN',
        },
        {
          clerkUserId: 'pre-user-' + randomUUID(),
          email: 'learner@example.invalid',
          displayName: 'Synthetic preexisting learner',
        },
      ])
      .returning();
    [topic] = await db
      .insert(schema.topicsTable)
      .values({ slug: 'pre-' + randomUUID(), name: 'Preexisting synthetic topic' })
      .returning();
    await question();
    await question('MULTIPLE_CHOICE_MULTIPLE');
    const run = await nexusStartSession(
      { topicId: topic.id, count: 2, mode: 'PRACTICE', requestId: randomUUID() },
      learner.id,
      'sess_bank_test',
      db,
    );
    for (const q of run.questions)
      await nexusSaveSelection(
        run.id,
        {
          questionId: q.id,
          optionKey: q.type === 'MULTIPLE_CHOICE_MULTIPLE' ? '["B","A"]' : 'A',
          flagged: false,
        },
        learner.id,
        'sess_bank_test',
        db,
      );
    await nexusFinish(run.id, learner.id, 'sess_bank_test', false, db);
    const snapshot = snapshotForCount(root, 10),
      tables = (Object.values(snapshot.tables) as any[]).map((t) => t.name),
      before = await rowProof(client, tables),
      sequence = (
        await client.query('SELECT last_value::text,is_called FROM public.question_code_seq')
      ).rows,
      oldLedger = (
        await client.query(
          'SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
        )
      ).rows;
    expect(before.practice_attempts.count).toBe(2);
    expect(before.learning_session_items.count).toBe(2);
    await migrate(drizzle(migratorClient(client)), {
      migrationsFolder: root + '/.local/question-bank-migration',
    });
    expect(await rowProof(client, tables, snapshot)).toEqual(before);
    expect(
      (await client.query('SELECT last_value::text,is_called FROM public.question_code_seq')).rows,
    ).toEqual(sequence);
    expect(
      (
        await assertBankState(client, root, plan, { owner: disposable.user, runtimeRole: null })
      ).ledger.slice(0, 10),
    ).toEqual(oldLedger);
    expect(
      (await nexusSession(run.id, learner.id, 'sess_bank_test', db)).questions.every(
        (q: any) => q.result.isCorrect,
      ),
    ).toBe(true);
  });
  it('physically deletes published, draft, single and multiple new questions and records immutable recovery receipts', async () => {
    for (const type of ['MULTIPLE_CHOICE_SINGLE', 'MULTIPLE_CHOICE_MULTIPLE'])
      for (const status of ['ACTIVE', 'DISABLED']) {
        const q = await question(type, status),
          preview = await previewHistoryDeletion({ ids: [q.id] }, identity(), db);
        expect(preview.requiresHistory).toBe(false);
        expect(preview.records[0].questionCode).toBe(q.questionCode);
        expect(await deleteQuestionsOrdinary({ ids: [q.id] }, identity(), db)).toMatchObject({
          deleted: 1,
          blocked: 0,
          failed: 0,
          items: [{ outcome: 'DELETED', auditId: expect.any(String) }],
        });
        await absent(q.id);
        const audit = (
          await client.query(
            "SELECT *,payload_hash=encode(sha256(convert_to(recovery_payload::text,'UTF8')),'hex') AS verified FROM public.question_deletion_audits WHERE question_id=$1",
            [q.id],
          )
        ).rows[0];
        expect(audit.verified).toBe(true);
        expect(audit.history_authorized).toBe(false);
        expect(audit.recovery_payload.question.id).toBe(q.id);
        expect(audit.recovery_payload.options).toHaveLength(4);
        await rejected(
          () => client.query('DELETE FROM public.question_deletion_audits WHERE id=$1', [audit.id]),
          '23514',
        );
      }
  });
  it('deletes revision-only questions without learner-history confirmation and has no fixed pilot UUID denylist', async () => {
    const q = await question(
      'MULTIPLE_CHOICE_SINGLE',
      'ACTIVE',
      'ca685e22-dabf-435c-be83-254a42ef81cd',
    );
    const snap = {
      questionCode: q.questionCode,
      topic: { id: topic.id, name: topic.name, slug: topic.slug },
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      explanation: q.explanation,
      imageKey: null,
      referenceNotes: null,
      options: ['A', 'B', 'C', 'D'].map((optionKey, i) => ({
        optionKey,
        text: optionKey,
        isCorrect: i === 0,
      })),
    };
    await db
      .insert(schema.questionRevisionsTable)
      .values({
        questionId: q.id,
        snapshot: snap,
        contentHash: sql`encode(sha256(convert_to(${JSON.stringify(snap)}::jsonb::text,'UTF8')),'hex')`,
      });
    expect((await previewHistoryDeletion({ ids: [q.id] }, identity(), db)).requiresHistory).toBe(
      false,
    );
    expect(await deleteQuestionsOrdinary({ ids: [q.id] }, identity(), db)).toMatchObject({
      deleted: 1,
    });
    await absent(q.id);
  });
  it('blocks ordinary history deletion, then physically removes selected history with explicit actor/session-bound confirmation', async () => {
    const q = await question('MULTIPLE_CHOICE_MULTIPLE'),
      other = await question(),
      batch = await startPracticeBatch(
        { topicId: topic.id, count: 2 },
        learner.id,
        'sess_bank_test',
        db,
      ),
      d = batch.questions.find((v: any) => v.id === q.id)!;
    expect(
      await submitPracticeAnswer(q.id, ['B', 'A'], learner.id, db, d.deliveryId, 'sess_bank_test'),
    ).toMatchObject({ isCorrect: true });
    const before = await rowProof(client, [
      'practice_attempts',
      'practice_deliveries',
      'question_revisions',
      'questions',
    ]);
    expect(await deleteQuestionsOrdinary({ ids: [q.id] }, identity(), db)).toMatchObject({
      deleted: 0,
      blocked: 1,
      items: [{ outcome: 'BLOCKED', constraint: 'question_history_confirmation_required' }],
    });
    expect(
      await rowProof(client, [
        'practice_attempts',
        'practice_deliveries',
        'question_revisions',
        'questions',
      ]),
    ).toEqual(before);
    const p = await previewHistoryDeletion({ ids: [q.id] }, identity(), db);
    expect(p.requiresHistory).toBe(true);
    expect(p.records[0]).toMatchObject({
      questionCode: q.questionCode,
      attempts: [expect.any(String)],
    });
    const result = await confirmHistoryDeletion(
      { token: p.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
      identity(),
      db,
    );
    expect(result).toMatchObject({ deleted: 1, blocked: 0, failed: 0 });
    await absent(q.id);
    expect(
      (await client.query('SELECT id FROM public.questions WHERE id=$1', [other.id])).rows,
    ).toHaveLength(1);
  });
  it('preserves shared sessions and unrelated items, exposes a tombstone and blocks resuming/grading removed content', async () => {
    const q = await question(),
      other = await question(),
      run = await nexusStartSession(
        { topicId: topic.id, count: 2, mode: 'PRACTICE', requestId: randomUUID() },
        learner.id,
        'sess_bank_test',
        db,
      );
    const parent = (
      await client.query('SELECT to_jsonb(s) AS row FROM public.learning_sessions s WHERE id=$1', [
        run.id,
      ])
    ).rows;
    const sibling = (
      await client.query(
        'SELECT to_jsonb(i) AS row FROM public.learning_session_items i WHERE question_id=$1',
        [other.id],
      )
    ).rows;
    const p = await previewHistoryDeletion({ ids: [q.id] }, identity(), db);
    expect(p.records[0]).toMatchObject({ sessionItems: 1, sessions: 1 });
    expect(
      await confirmHistoryDeletion(
        { token: p.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
        identity(),
        db,
      ),
    ).toMatchObject({ deleted: 1 });
    await absent(q.id);
    expect(
      (
        await client.query(
          'SELECT to_jsonb(s) AS row FROM public.learning_sessions s WHERE id=$1',
          [run.id],
        )
      ).rows,
    ).toEqual(parent);
    expect(
      (
        await client.query(
          'SELECT to_jsonb(i) AS row FROM public.learning_session_items i WHERE question_id=$1',
          [other.id],
        )
      ).rows,
    ).toEqual(sibling);
    const view = await nexusSession(run.id, learner.id, 'sess_bank_test', db);
    expect(view).toMatchObject({
      canResume: false,
      status: 'CONTENT_DELETED',
      removedQuestions: [{ questionCode: q.questionCode }],
    });
    expect(view.questions).toHaveLength(1);
    expect(JSON.stringify(view)).not.toMatch(/recovery_payload|admin_actor|isCorrect/);
    await expect(
      nexusFinish(run.id, learner.id, 'sess_bank_test', false, db),
    ).rejects.toMatchObject({ code: 'SESSION_CONTENT_DELETED' });
    expect((await nexusSessionHistory(learner.id, {}, db)).items[0]).toMatchObject({
      removedCount: 1,
    });
    expect((await nexusFinish(run.id, learner.id, 'sess_bank_test', true, db)).status).toBe(
      'ABANDONED',
    );
  });
  it('supports bulk physical deletion with mixed BLOCKED results and preserves unrelated records', async () => {
    const a = await question(),
      b = await question(),
      c = await question(),
      other = await question();
    const delivery = (
      await startPracticeBatch({ topicId: topic.id, count: 4 }, learner.id, 'sess_bank_test', db)
    ).questions.find((v: any) => v.id === c.id)!;
    // a and b have deliveries too, so this bulk explicitly confirms their history.
    const p = await previewHistoryDeletion({ ids: [a.id, b.id, c.id] }, identity(), db);
    expect(
      await confirmHistoryDeletion(
        { token: p.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
        identity(),
        db,
      ),
    ).toMatchObject({ deleted: 3, blocked: 0 });
    for (const q of [a, b, c]) await absent(q.id);
    expect(
      (await client.query('SELECT id FROM public.questions WHERE id=$1', [other.id])).rows,
    ).toHaveLength(1);
    const fresh = await question();
    expect(
      await deleteQuestionsOrdinary({ ids: [fresh.id, other.id] }, identity(), db),
    ).toMatchObject({ deleted: 1, blocked: 1 });
    await absent(fresh.id);
  });
  it('rejects non-Admin and inactive Admin at the database boundary and retains all data', async () => {
    const q = await question();
    await rejected(
      () => client.query('SELECT public.delete_question_with_history($1,$2)', [q.id, learner.id]),
      '42501',
    );
    await client.query("UPDATE public.users SET status='DISABLED' WHERE id=$1", [admin.id]);
    await rejected(
      () =>
        client.query('SELECT public.delete_question_without_learner_history($1,$2)', [
          q.id,
          admin.id,
        ]),
      '42501',
    );
    expect(
      (await client.query('SELECT id FROM public.questions WHERE id=$1', [q.id])).rows,
    ).toHaveLength(1);
  });
  it('rolls back the complete bulk transaction and audit receipts on an unexpected second-item failure', async () => {
    const a = await question(),
      b = await question(),
      ids = [a.id, b.id].sort();
    await client.query(
      `CREATE FUNCTION pg_temp.fail_selected_question() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${ids[1]}'::uuid THEN RAISE EXCEPTION 'Synthetic failure' USING ERRCODE='P0001'; END IF; RETURN OLD; END $$`,
    );
    await client.query(
      'CREATE TRIGGER synthetic_failure BEFORE DELETE ON public.questions FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_selected_question()',
    );
    expect(await deleteQuestionsOrdinary({ ids }, identity(), db)).toMatchObject({
      deleted: 0,
      failed: 2,
      items: [{ outcome: 'FAILED' }, { outcome: 'FAILED' }],
    });
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM public.questions WHERE id=ANY($1::uuid[])',
          [ids],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (await client.query('SELECT count(*)::int AS n FROM public.question_deletion_audits')).rows[0]
        .n,
    ).toBe(0);
  });
  it('proves selected-row recovery from the restricted payload inside a savepoint without restoring real data', async () => {
    const q = await question('MULTIPLE_CHOICE_MULTIPLE'),
      batch = await startPracticeBatch(
        { topicId: topic.id, count: 1 },
        learner.id,
        'sess_bank_test',
        db,
      );
    await submitPracticeAnswer(
      q.id,
      ['B', 'A'],
      learner.id,
      db,
      batch.questions[0].deliveryId,
      'sess_bank_test',
    );
    const tables = [
        'questions',
        'question_options',
        'question_revisions',
        'practice_deliveries',
        'practice_attempts',
      ],
      before = await rowProof(client, tables);
    const p = await previewHistoryDeletion({ ids: [q.id] }, identity(), db);
    expect(
      await confirmHistoryDeletion(
        { token: p.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
        identity(),
        db,
      ),
    ).toMatchObject({ deleted: 1 });
    await absent(q.id);
    const payload = (
      await client.query(
        'SELECT recovery_payload AS payload FROM public.question_deletion_audits WHERE question_id=$1',
        [q.id],
      )
    ).rows[0].payload;
    await client.query('SAVEPOINT operator_restore_proof');
    for (const [table, key] of [
      ['questions', 'question'],
      ['question_options', 'options'],
      ['question_revisions', 'revisions'],
      ['practice_deliveries', 'deliveries'],
      ['practice_attempts', 'attempts'],
    ]) {
      const rows = key === 'question' ? [payload[key]] : payload[key];
      await client.query(
        'INSERT INTO public."' +
          table +
          '" SELECT * FROM jsonb_populate_recordset(NULL::public."' +
          table +
          '",$1::jsonb)',
        [JSON.stringify(rows)],
      );
    }
    expect(await rowProof(client, tables)).toEqual(before);
    await client.query('ROLLBACK TO SAVEPOINT operator_restore_proof');
    await client.query('RELEASE SAVEPOINT operator_restore_proof');
    await absent(q.id);
  });
});
