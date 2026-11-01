import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { z } from 'zod/v4';
import { createHash } from 'node:crypto';
import {
  createQuestionInputSchema,
  type CreateQuestionInput,
  validateQuestionObjectiveAssignments,
} from '@workspace/db/schema';

export class AdminContentError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AdminContentError(
      400,
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
export const importHeaders = [
  'chapterCode',
  'topicId',
  'text',
  'difficulty',
  ...Array.from({ length: 10 }, (_, i) => `option${String.fromCharCode(65 + i)}`),
  'correctOption',
  'explanation',
  'referenceNotes',
  'questionType',
];
export type ImportCatalog = {
  topics: { id: string }[];
  objectives: { id: string; blueprintId: string; code: string }[];
};
export type ImportDraft = {
  question: CreateQuestionInput;
  assignments: { objectiveId: string; blueprintId: string; isPrimary: boolean }[];
};
export type ImportRow = {
  row: number;
  status: 'accepted' | 'rejected' | 'duplicate';
  text: string;
  errors: { path: string; message: string }[];
  draft?: ImportDraft;
};
const canonical = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function questionFingerprint(q: {
  topicId: string;
  text: string;
  options: { text: string }[];
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        q.topicId.toLowerCase(),
        canonical(q.text),
        q.options.map((o) => canonical(o.text)).sort(),
      ]),
    )
    .digest('hex');
}
export function validateImportRows(
  records: Record<string, string>[],
  catalog: ImportCatalog,
  existing: ReadonlySet<string>,
): ImportRow[] {
  const seen = new Set(existing);
  return records.map((record, index) => {
    const row: ImportRow = {
      row: index + 2,
      status: 'rejected',
      text: record.text ?? '',
      errors: [],
    };
    try {
      for (const [field, value] of Object.entries(record))
        if (value.includes('\u0000'))
          throw new AdminContentError(400, 'VALIDATION_ERROR', 'Unsupported character.', [
            { path: field, message: 'NUL characters cannot be stored in PostgreSQL text.' },
          ]);
      const chapter = ccnaBookChapters.find(c=>c.code===(record.chapterCode??'').trim().toUpperCase() || (!(record.chapterCode??'').trim() && c.topicId===(record.topicId??'').trim().toLowerCase()));
      if(!chapter || (record.topicId?.trim() && record.topicId.trim().toLowerCase()!==chapter.topicId))
        throw new AdminContentError(400,'VALIDATION_ERROR','Unknown or conflicting canonical chapter.',[{path:'chapterCode',message:'Use an exact CCNA-V1-01 style chapter code, or its matching stable topicId.'}]);
      if(record.objectiveCodes?.trim()||record.blueprintId?.trim()||record.primaryObjectiveCode?.trim())
        throw new AdminContentError(400,'VALIDATION_ERROR','Objective classification is retired. Use chapterCode.');
      const correctKeys=(record.correctOption??'').toUpperCase().split(';').map(x=>x.trim()).filter(Boolean);
      if(new Set(correctKeys).size!==correctKeys.length || correctKeys.some(k=>!/^[A-J]$/.test(k)))
        throw new AdminContentError(400,'VALIDATION_ERROR','Correct options must be distinct A-J keys separated by semicolons.');
      const options = Array.from({ length: 10 }, (_, i) => ({
        optionKey: String.fromCharCode(65 + i),
        text: record[`option${String.fromCharCode(65 + i)}`] ?? '',
        isCorrect:
          correctKeys.includes(String.fromCharCode(65 + i)),
      })).filter((o) => o.text.trim());
      if(correctKeys.some(key=>!options.some(o=>o.optionKey===key)))
        throw new AdminContentError(400,'VALIDATION_ERROR','Every correct option must identify a supplied nonblank choice.');
      const question = parse(createQuestionInputSchema, {
        topicId: chapter.topicId,
        text: record.text ?? '',
        difficulty: (record.difficulty ?? '').trim().toUpperCase(),
        type: record.questionType?.trim() || 'MULTIPLE_CHOICE_SINGLE',
        status: 'DISABLED',
        explanation: record.explanation ?? '',
        referenceNotes: record.referenceNotes || null,
        imageKey: null,
        options,
      });
      if (!catalog.topics.some((t) => t.id === question.topicId))
        throw new AdminContentError(400, 'VALIDATION_ERROR', 'Unknown topic.', [
          { path: 'topicId', message: 'Use an existing topic ID.' },
        ]);
      const assignments: ImportDraft['assignments'] = [];
      row.draft = { question, assignments };
      const fingerprint = questionFingerprint(question);
      row.status = seen.has(fingerprint) ? 'duplicate' : 'accepted';
      if (row.status === 'duplicate')
        row.errors = [
          {
            path: 'row',
            message: existing.has(fingerprint)
              ? 'Matches an existing question; it will not be changed.'
              : 'Matches an earlier valid row in this file.',
          },
        ];
      seen.add(fingerprint);
    } catch (error) {
      if (error instanceof AdminContentError)
        row.errors = (error.details as ImportRow['errors']) ?? [
          { path: 'row', message: error.message },
        ];
      else if (error instanceof z.ZodError)
        row.errors = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      else throw error;
    }
    return row;
  });
}
export function importSummary(rows: ImportRow[]) {
  return {
    accepted: rows.filter((r) => r.status === 'accepted').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
    total: rows.length,
  };
}
