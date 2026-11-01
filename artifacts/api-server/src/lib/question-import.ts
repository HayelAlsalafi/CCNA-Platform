import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import {
  db,
  topicsTable,
  curriculumChaptersTable,
  examObjectivesTable,
  questionsTable,
  questionOptionsTable,
  questionObjectivesTable,
} from '@workspace/db';
import { createQuestion } from './questions';
import {
  AdminContentError,
  importSummary,
  parse,
  questionFingerprint,
  uuid,
  validateImportRows,
  type ImportRow,
  type ImportCatalog,
} from './admin-content-validation';
import { MAX_FILE_BYTES, parseQuestionFile } from './question-import-files';
type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Preview = {
  identity: string;
  expiresAt: number;
  records: Record<string, string>[];
  rows: ImportRow[];
};
const previews = new Map<string, Preview>();
export const PREVIEW_TTL_MS = 10 * 60 * 1000;
function expire(now: number) {
  for (const [key, value] of previews) if (value.expiresAt <= now) previews.delete(key);
}
const upload = z.strictObject({
  filename: z.string().min(1).max(200),
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
async function context(database: Db | Tx) {
  const [topics, objectives, questions, options] = await Promise.all([
    database.select({ id: curriculumChaptersTable.id }).from(curriculumChaptersTable),
    database
      .select({
        id: examObjectivesTable.id,
        blueprintId: examObjectivesTable.blueprintId,
        code: examObjectivesTable.code,
      })
      .from(examObjectivesTable),
    database
      .select({ id: questionsTable.id, topicId: questionsTable.topicId, text: questionsTable.text })
      .from(questionsTable),
    database
      .select({ questionId: questionOptionsTable.questionId, text: questionOptionsTable.text })
      .from(questionOptionsTable),
  ]);
  const byQuestion = new Map<string, { text: string }[]>();
  for (const option of options) {
    const list = byQuestion.get(option.questionId) ?? [];
    list.push(option);
    byQuestion.set(option.questionId, list);
  }
  return {
    catalog: { topics, objectives } as ImportCatalog,
    existing: new Set(
      questions.map((q) => questionFingerprint({ ...q, options: byQuestion.get(q.id) ?? [] })),
    ),
  };
}
export async function previewQuestionImport(
  input: unknown,
  identity: string,
  database: Db = db,
  now = Date.now(),
) {
  const data = parse(upload, input),
    buffer = Buffer.from(data.dataBase64, 'base64');
  if (buffer.toString('base64') !== data.dataBase64)
    throw new AdminContentError(400, 'INVALID_FILE', 'Invalid base64 upload.');
  const records = parseQuestionFile(data.filename, buffer);
  const { catalog, existing } = await context(database);
  const rows = validateImportRows(records, catalog, existing);
  expire(now);
  if (previews.size >= 50)
    throw new AdminContentError(
      429,
      'PREVIEW_LIMIT',
      'Preview capacity reached; retry after older previews expire.',
    );
  const owned = [...previews.entries()].filter(([, p]) => p.identity === identity);
  while (owned.length >= 3) previews.delete(owned.shift()![0]);
  const previewId = randomUUID(),
    expiresAt = now + PREVIEW_TTL_MS;
  previews.set(previewId, { identity, expiresAt, records, rows });
  return {
    previewId,
    expiresAt: new Date(expiresAt).toISOString(),
    summary: importSummary(rows),
    rows: rows.map(({ draft, ...row }) => ({
      ...row,
      question: draft?.question,
      objectives: draft?.assignments,
    })),
  };
}
export async function confirmQuestionImport(
  input: unknown,
  identity: string,
  database: Db = db,
  now = Date.now(),
) {
  const data = parse(z.strictObject({ previewId: uuid, confirmed: z.literal(true) }), input);
  expire(now);
  const preview = previews.get(data.previewId);
  if (!preview || preview.identity !== identity)
    throw new AdminContentError(
      409,
      'PREVIEW_EXPIRED',
      'Preview expired, changed session, or was already consumed. Upload and preview again.',
    );
  // Consume before awaiting: two concurrent confirmations cannot replay writes.
  previews.delete(data.previewId);
  const accepted = preview.rows.filter((r) => r.status === 'accepted');
  if (!accepted.length)
    throw new AdminContentError(400, 'NO_ACCEPTED_ROWS', 'There are no accepted rows to import.');
  const questionIds = await database.transaction(async (tx) => {
    // Serialize imports across API processes before duplicate revalidation.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(20261012, 301)`);
    const { catalog, existing } = await context(tx);
    const current = validateImportRows(preview.records, catalog, existing);
    for (const row of accepted) {
      const checked = current[row.row - 2];
      if (
        !checked ||
        checked.status !== 'accepted' ||
        JSON.stringify(checked.draft) !== JSON.stringify(row.draft)
      )
        throw new AdminContentError(
          409,
          'PREVIEW_STALE',
          'Question or taxonomy data changed. Preview the file again; nothing was imported.',
        );
    }
    const ids: string[] = [];
    for (const row of accepted) {
      const draft = row.draft!;
      const created = await createQuestion(
        { ...draft.question, status: 'DISABLED' },
        tx as unknown as Db,
      );
      if (draft.assignments.length)
        await tx
          .insert(questionObjectivesTable)
          .values(draft.assignments.map((a) => ({ ...a, questionId: created.question.id })));
      ids.push(created.question.id);
    }
    return ids;
  });
  return {
    ...importSummary(preview.rows),
    imported: questionIds.length,
    status: 'DISABLED' as const,
    questionIds,
  };
}
