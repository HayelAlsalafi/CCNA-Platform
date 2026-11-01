import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ writes: [] as unknown[], failAt: 0, calls: 0 }));
vi.mock('@workspace/db', async () => ({ ...(await import('@workspace/db/schema')), db: {} }));
vi.mock('./questions', () => ({
  createQuestion: vi.fn(async (input: unknown) => {
    state.calls++;
    state.writes.push(input);
    if (state.failAt === state.calls) throw new Error('synthetic failure');
    return { question: { id: `11111111-1111-4111-8111-${String(state.calls).padStart(12, '0')}` } };
  }),
}));
import {
  topicsTable,
  examObjectivesTable,
  questionsTable,
  questionOptionsTable,
} from '@workspace/db/schema';
import { previewQuestionImport, confirmQuestionImport, PREVIEW_TTL_MS } from './question-import';
import { importHeaders } from './admin-content-validation';
const topic = '11111111-1111-4111-8111-111111111111';
const upload = (rows = 1) => ({
  filename: 'questions.csv',
  dataBase64: Buffer.from(
    importHeaders.join(',') +
      '\n' +
      Array.from({ length: rows }, (_, i) =>
        importHeaders
          .map(
            (h) =>
              (
                ({
                  topicId: topic,
                  text: `Question ${i}`,
                  difficulty: 'EASY',
                  optionA: 'yes',
                  optionB: 'no',
                  correctOption: 'A',
                }) as Record<string, string>
              )[h] ?? '',
          )
          .join(','),
      ).join('\n'),
  ).toString('base64'),
});
function fake() {
  let stale = false,
    duplicate = false;
  const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => {
    const before = state.writes.slice();
    try {
      return await fn(database);
    } catch (e) {
      state.writes = before;
      throw e;
    }
  });
  const database = {
    select: () => ({
      from: async (table: unknown) =>
        table === topicsTable
          ? [{ id: stale ? '22222222-2222-4222-8222-222222222222' : topic }]
          : duplicate && table === questionsTable
            ? [{ id: 'existing', topicId: topic, text: 'Question 0' }]
            : duplicate && table === questionOptionsTable
              ? [
                  { questionId: 'existing', text: 'yes' },
                  { questionId: 'existing', text: 'no' },
                ]
              : [],
    }),
    transaction,
    execute: vi.fn(async () => ({})),
    insert: () => ({ values: async (values: unknown) => state.writes.push(values) }),
  };
  return {
    database: database as never,
    transaction,
    stale: () => {
      stale = true;
    },
    duplicate: () => {
      duplicate = true;
    },
  };
}
beforeEach(() => {
  state.writes = [];
  state.calls = 0;
  state.failAt = 0;
});
describe('server-owned preview and atomic confirmation', () => {
  it('preview performs no transaction or writes', async () => {
    const f = fake();
    const p = await previewQuestionImport(upload(), 'a', f.database);
    expect(p.summary.accepted).toBe(1);
    expect(f.transaction).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
  it('requires explicit true confirmation', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'b', f.database);
    await expect(
      confirmQuestionImport({ previewId: p.previewId, confirmed: false }, 'b', f.database),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.writes).toEqual([]);
  });
  it('binds preview to the authenticated user and session', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'user:session-a', f.database);
    await expect(
      confirmQuestionImport(
        { previewId: p.previewId, confirmed: true },
        'user:session-b',
        f.database,
      ),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('expires after ten minutes', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'c', f.database, 1000);
    await expect(
      confirmQuestionImport(
        { previewId: p.previewId, confirmed: true },
        'c',
        f.database,
        1000 + PREVIEW_TTL_MS,
      ),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
  });
  it('creates accepted rows as disabled drafts and consumes the token once', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'd', f.database);
    const input = { previewId: p.previewId, confirmed: true };
    const result = await confirmQuestionImport(input, 'd', f.database);
    expect(result.imported).toBe(1);
    expect(state.writes[0]).toMatchObject({ status: 'DISABLED' });
    await expect(confirmQuestionImport(input, 'd', f.database)).rejects.toMatchObject({
      code: 'PREVIEW_EXPIRED',
    });
  });
  it('rejects concurrent replay', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'e', f.database);
    const result = await Promise.allSettled([
      confirmQuestionImport({ previewId: p.previewId, confirmed: true }, 'e', f.database),
      confirmQuestionImport({ previewId: p.previewId, confirmed: true }, 'e', f.database),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.calls).toBe(1);
  });
  it('rolls back the whole batch if a later question fails', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(2), 'f', f.database);
    state.failAt = 2;
    await expect(
      confirmQuestionImport({ previewId: p.previewId, confirmed: true }, 'f', f.database),
    ).rejects.toThrow('synthetic failure');
    expect(state.writes).toEqual([]);
  });
  it('revalidates catalog changes before any question writes', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'g', f.database);
    f.stale();
    await expect(
      confirmQuestionImport({ previewId: p.previewId, confirmed: true }, 'g', f.database),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect(state.writes).toEqual([]);
  });
  it('rechecks duplicates at confirmation to reject newly imported copies', async () => {
    const f = fake(),
      p = await previewQuestionImport(upload(), 'h', f.database);
    f.duplicate();
    await expect(
      confirmQuestionImport({ previewId: p.previewId, confirmed: true }, 'h', f.database),
    ).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect(state.writes).toEqual([]);
  });
  it('imports accepted rows only and accurately counts rejected and duplicate rows', async () => {
    const f = fake(),
      data = upload();
    const original = Buffer.from(data.dataBase64, 'base64').toString();
    const line = original.split('\n')[1]!;
    data.dataBase64 = Buffer.from(
      original + '\n' + line + '\n' + line.replace('Question 0', ''),
    ).toString('base64');
    const p = await previewQuestionImport(data, 'i', f.database);
    expect(p.summary).toEqual({ accepted: 1, rejected: 1, duplicates: 1, total: 3 });
    const result = await confirmQuestionImport(
      { previewId: p.previewId, confirmed: true },
      'i',
      f.database,
    );
    expect(result).toMatchObject({ imported: 1, accepted: 1, rejected: 1, duplicates: 1 });
    expect(state.calls).toBe(1);
  });
});
