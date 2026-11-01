import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db as defaultDb } from '@workspace/db';
import { deleteIdsSchema, AdminDeleteError } from './admin-delete';
export const historyDeleteConfirmation = 'DELETE QUESTIONS AND THEIR HISTORY';
type Identity = { actorId: string; sessionId: string };
type Stored = { identity: Identity; ids: string[]; hash: string; expiresAt: number };
const previews = new Map<string, Stored>();
const identitySchema = z
  .object({ actorId: z.string().uuid(), sessionId: z.string().min(1).max(300) })
  .strict();
const confirmationSchema = z
  .object({
    token: z.string().uuid(),
    confirmation: z.literal(historyDeleteConfirmation),
    acknowledgeHistoryLoss: z.literal(true),
  })
  .strict();
const prune = () => {
  for (const [token, p] of previews) if (p.expiresAt <= Date.now()) previews.delete(token);
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Tx = Parameters<Parameters<typeof defaultDb.transaction>[0]>[0];
export type QuestionDeleteItem = {
  id: string;
  outcome: 'DELETED' | 'BLOCKED' | 'FAILED';
  reason: string;
  auditId?: string;
  constraint?: string;
};
async function capability(tx: Tx) {
  const r = (
    await tx.execute<{ ready: boolean }>(
      sql`SELECT to_regclass('public.question_deletion_audits') IS NOT NULL AND to_regprocedure('public.delete_question_without_learner_history(uuid,uuid)') IS NOT NULL AS ready`,
    )
  ).rows[0];
  if (!r?.ready)
    throw new AdminDeleteError(
      'Approved universal-delete migration 0010 is required. No records were changed.',
    );
}
async function evidence(tx: Tx, ids: string[]) {
  await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
  await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
  await tx.execute(sql`SET LOCAL TIME ZONE 'UTC'`);
  await capability(tx);
  const examReady=(await tx.execute<{exam_ready:boolean}>(sql`SELECT to_regclass('public.exam_session_items') IS NOT NULL AS exam_ready`)).rows[0]?.exam_ready===true;
  if(examReady)await tx.execute(sql`SELECT s.id FROM public.exam_sessions s WHERE EXISTS(SELECT 1 FROM public.exam_session_items i WHERE i.session_id=s.id AND i.question_id=ANY(${sql.param(ids)}::uuid[])) ORDER BY s.id FOR UPDATE`);
  await tx.execute(
    sql`SELECT s.id FROM public.learning_sessions s WHERE EXISTS(SELECT 1 FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id=ANY(${sql.param(ids)}::uuid[])) ORDER BY s.id FOR UPDATE`,
  );
  await tx.execute(
    sql`SELECT id FROM public.questions WHERE id=ANY(${sql.param(ids)}::uuid[]) ORDER BY id FOR UPDATE`,
  );
  const rows = (
    await tx.execute<any>(sql`SELECT q.id,q.question_code AS "questionCode",to_jsonb(q) AS question,
 coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.question_options o WHERE o.question_id=q.id),'[]'::jsonb) AS options,
 coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.blueprint_id,m.objective_id) FROM public.question_objectives m WHERE m.question_id=q.id),'[]'::jsonb) AS mappings,
 coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.question_revisions r WHERE r.question_id=q.id),'[]'::jsonb) AS revisions,
 coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.practice_deliveries d WHERE d.question_id=q.id),'[]'::jsonb) AS deliveries,
 coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.practice_attempts a WHERE a.question_id=q.id),'[]'::jsonb) AS attempts,
 coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.session_id,i.position) FROM public.learning_session_items i WHERE i.question_id=q.id),'[]'::jsonb) AS "sessionItems",
 coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.learning_sessions s WHERE EXISTS(SELECT 1 FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id=q.id)),'[]'::jsonb) AS sessions
 FROM public.questions q WHERE q.id=ANY(${sql.param(ids)}::uuid[]) ORDER BY q.id`)
  ).rows;
  if (rows.length !== ids.length || rows.some((r, i) => r.id !== ids[i]))
    throw new AdminDeleteError('Selected question set changed or a question no longer exists.');
  if (
    rows.reduce(
      (n, r) =>
        n + r.revisions.length + r.deliveries.length + r.attempts.length + r.sessionItems.length,
      0,
    ) > 50000
  )
    throw new AdminDeleteError(
      'Selection exceeds the interactive history limit; a separately reviewed operator procedure is required.',
    );
  const examItems=examReady?(await tx.execute<any>(sql`SELECT i.* FROM public.exam_session_items i WHERE i.question_id=ANY(${sql.param(ids)}::uuid[]) ORDER BY i.delivery_id LIMIT 50001`)).rows:[];
  if(examItems.length+rows.reduce((n,r)=>n+r.revisions.length+r.deliveries.length+r.attempts.length+r.sessionItems.length,0)>50000)
    throw new AdminDeleteError('Selection exceeds the interactive history limit; use a separately reviewed operator procedure.');
  return {
    hash: hash({rows,examItems}),
    records: rows.map((r) => ({
      id: r.id,
      questionCode: r.questionCode,
      revisions: r.revisions.map((x: any) => x.id),
      deliveries: r.deliveries.map((x: any) => x.id),
      attempts: r.attempts.map((x: any) => x.id),
      sessionItems: r.sessionItems.length,
      sessions: r.sessions.length,
      examItems:examItems.filter(i=>i.question_id===r.id).length,
      examSessions:new Set(examItems.filter(i=>i.question_id===r.id).map(i=>i.session_id)).size,
    })),
    requiresHistory: examItems.length>0 || rows.some(
      (r) => r.deliveries.length || r.attempts.length || r.sessionItems.length,
    ),
  };
}
function failure(
  error: unknown,
  ids: string[],
): { items: QuestionDeleteItem[]; deleted: number; blocked: number; failed: number } {
  const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    },
    code = e?.code ?? e?.cause?.code,
    constraint = e?.constraint ?? e?.cause?.constraint;
  const reasons: Record<string, string> = {
    question_history_confirmation_required:
      'Learner history or session membership requires the separate second destructive confirmation.',
    question_delete_unowned_dependency:
      'An inconsistent cross-question history reference requires operator review.',
  };
  const reason =
    error instanceof AdminDeleteError
      ? error.message
      : constraint && reasons[constraint]
        ? reasons[constraint]
        : code === '42501'
          ? 'Active Admin authorization or the exact controlled-function EXECUTE grant is missing.'
          : code === '42883'
            ? 'The approved controlled-delete migration is missing.'
            : ['23503', '23001'].includes(code ?? '')
              ? 'A foreign-key dependency blocks deletion' +
                (/^[a-z_][a-z_0-9]{0,62}$/.test(constraint ?? '') ? ' (' + constraint + ')' : '') +
                '. Review this dependency; no history or FK checks were bypassed.'
              : code === '55P03'
                ? 'A concurrent operation holds the required lock. Nothing was deleted.'
                : code === 'P0002'
                  ? 'Selected question no longer exists.'
                  : null;
  const blocked = reason !== null;
  return {
    items: ids.map((id) => ({
      id,
      outcome: blocked ? 'BLOCKED' : 'FAILED',
      reason:
        reason ??
        'Deletion did not return a verified commit. Refresh and review before retrying. Diagnostic: ' +
          (/^[A-Z0-9]{5}$/.test(code ?? '') ? code : 'DELETE_TRANSACTION_FAILED'),
      ...(constraint && /^[a-z_][a-z_0-9]{0,62}$/.test(constraint) ? { constraint } : {}),
    })),
    deleted: 0,
    blocked: blocked ? ids.length : 0,
    failed: blocked ? 0 : ids.length,
  };
}
export async function previewHistoryDeletion(input: unknown, identity: Identity, db = defaultDb) {
  identitySchema.parse(identity);
  const p = deleteIdsSchema.safeParse(input);
  if (!p.success) throw new AdminDeleteError('Select 1-500 distinct question UUIDs.');
  prune();
  if (previews.size >= 100)
    throw new AdminDeleteError('Too many outstanding previews; wait for expiry.');
  const ids = p.data.ids.map((id) => id.toLowerCase()).sort(),
    state = await db.transaction((tx) => evidence(tx, ids), { isolationLevel: 'read committed' });
  const token = randomUUID(),
    expiresAt = Date.now() + 5 * 60 * 1000;
  previews.set(token, { identity: { ...identity }, ids, hash: state.hash, expiresAt });
  return {
    token,
    expiresAt,
    records: state.records,
    requiresHistory: state.requiresHistory,
    confirmation: historyDeleteConfirmation,
    warning:
      'Permanently removes the selected questions and exactly their listed attempts, deliveries and revisions. Shared practice/exam sessions and unrelated items remain; selected positions become non-answer tombstones. Active exams with removed content cannot be graded. Completed exams retain original aggregate scores with partially redacted review. A restricted integrity-checked recovery copy and deletion audit are retained. Learner progress based on removed attempts changes. Recovery requires a separately authorized operator procedure.',
  };
}
export async function confirmHistoryDeletion(input: unknown, identity: Identity, db = defaultDb) {
  identitySchema.parse(identity);
  const p = confirmationSchema.safeParse(input);
  if (!p.success)
    throw new AdminDeleteError(
      'The exact confirmation phrase and history-loss acknowledgement are required.',
    );
  prune();
  const preview = previews.get(p.data.token);
  if (
    !preview ||
    preview.identity.actorId !== identity.actorId ||
    preview.identity.sessionId !== identity.sessionId
  )
    throw new AdminDeleteError(
      'Preview expired or belongs to a different Admin session. Preview again.',
    );
  previews.delete(p.data.token);
  try {
    return await db.transaction(
      async (tx) => {
        const state = await evidence(tx, preview.ids);
        if (state.hash !== preview.hash)
          throw new AdminDeleteError(
            'Question/history changed after preview. No records deleted; preview again.',
          );
        const items: QuestionDeleteItem[] = [];
        for (const id of preview.ids) {
          const receipt = (
            await tx.execute<any>(
              sql`SELECT public.delete_question_with_history(${id}::uuid,${identity.actorId}::uuid) AS receipt`,
            )
          ).rows[0]?.receipt;
          if (
            !receipt?.auditId ||
            (await tx.execute(sql`SELECT id FROM public.questions WHERE id=${id}::uuid`)).rows
              .length
          )
            throw Error('Physical absence or audit receipt verification failed.');
          items.push({
            id,
            outcome: 'DELETED',
            auditId: receipt.auditId,
            reason:
              'Permanently deleted with explicitly confirmed history; shared session positions retained as tombstones.',
          });
        }
        return { items, deleted: items.length, blocked: 0, failed: 0 };
      },
      { isolationLevel: 'read committed' },
    );
  } catch (error) {
    return failure(error, preview.ids);
  }
}
export async function deleteQuestionsOrdinary(input: unknown, identity: Identity, db = defaultDb) {
  identitySchema.parse(identity);
  const p = deleteIdsSchema.safeParse(input);
  if (!p.success) throw new AdminDeleteError('Select 1-500 distinct question UUIDs.');
  const ids = p.data.ids.map((id) => id.toLowerCase()).sort();
  try {
    return await db.transaction(
      async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
        await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
        await capability(tx);
        await tx.execute(
          sql`SELECT s.id FROM public.learning_sessions s WHERE EXISTS(SELECT 1 FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id=ANY(${sql.param(ids)}::uuid[])) ORDER BY s.id FOR UPDATE`,
        );
        await tx.execute(
          sql`SELECT id FROM public.questions WHERE id=ANY(${sql.param(ids)}::uuid[]) ORDER BY id FOR UPDATE`,
        );
        const items: QuestionDeleteItem[] = [];
        for (const id of ids) {
          try {
            await tx.transaction(async (child) => {
              const receipt = (
                await child.execute<any>(
                  sql`SELECT public.delete_question_without_learner_history(${id}::uuid,${identity.actorId}::uuid) AS receipt`,
                )
              ).rows[0]?.receipt;
              if (
                !receipt?.auditId ||
                (await child.execute(sql`SELECT id FROM public.questions WHERE id=${id}::uuid`))
                  .rows.length
              )
                throw Error('Deletion absence/audit verification failed.');
              items.push({
                id,
                outcome: 'DELETED',
                auditId: receipt.auditId,
                reason:
                  'Question and exclusively owned non-learner dependencies permanently deleted.',
              });
            });
          } catch (error) {
            const result = failure(error, [id]);
            if (result.failed) throw error;
            items.push(...result.items);
          }
        }
        return {
          items,
          deleted: items.filter((i) => i.outcome === 'DELETED').length,
          blocked: items.filter((i) => i.outcome === 'BLOCKED').length,
          failed: 0,
        };
      },
      { isolationLevel: 'read committed' },
    );
  } catch (error) {
    return failure(error, ids);
  }
}
