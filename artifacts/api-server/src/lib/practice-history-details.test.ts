import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';

// Exercise real Drizzle SQL generation without constructing a PostgreSQL pool.
vi.mock('@workspace/db', async () => ({
  ...(await import('@workspace/db/schema')),
  db: {},
}));
const { getPracticeHistory } = await import('./practice');

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const questionId = '11111111-1111-4111-8111-111111111111';
const historicalTopicId = '22222222-2222-4222-8222-222222222222';
const date = new Date('2026-10-08T10:00:00.000Z');
const ids = ['ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'];

function testDb(details: boolean, unavailable = false, snapshot: unknown = null) {
  const execute = vi.fn(async (_sql: string, _params: unknown[]) => ({
    rows: ids.map((id) => [
      id,
      questionId,
      historicalTopicId,
      'B',
      true,
      date.toISOString(),
      date.toISOString().replace(".000Z", ".000000Z"),
      ...(details
        ? [unavailable ? null : 'CCNA-Q-000001', unavailable ? null : 'Original topic', snapshot ? '77777777-7777-4777-8777-777777777777' : null, snapshot]
        : []),
    ]),
  }));
  return { db: drizzle(execute) as unknown as Parameters<typeof getPracticeHistory>[3], execute };
}

describe('practice history optional details SQL and DTO', () => {
  it('keeps the default response and query exactly free of details', async () => {
    const { db, execute } = testDb(false);
    const page = await getPracticeHistory(userA, 1, undefined, db);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      ['id', 'questionId', 'topicId', 'selectedOptionKey', 'isCorrect', 'submittedAt'].sort(),
    );
    const [statement, params] = execute.mock.calls[0];
    expect(statement).not.toMatch(/join|question_code|topics/i);
    expect(params).toEqual([userA, 2]);
  });

  it('joins question code and the stored attempt topic, never the current question topic', async () => {
    const { db, execute } = testDb(true);
    const page = await getPracticeHistory(userA, 1, undefined, db, true);
    const [statement] = execute.mock.calls[0];
    expect(statement).toContain(
      'left join "questions" on "questions"."id" = "practice_attempts"."question_id"',
    );
    expect(statement).toContain(
      'left join "topics" on "topics"."id" = "practice_attempts"."topic_id"',
    );
    expect(statement).not.toContain('"questions"."topic_id"');
    expect(page.items[0]).toMatchObject({
      questionCode: 'CCNA-Q-000001',
      topicName: 'Original topic',
      topicId: historicalTopicId,
    });
    expect(statement).not.toMatch(
      /explanation|is_correct.*question_options|correct_option|question_options/i,
    );
  });

  it('does not filter disabled questions or topics out of historical attempts', async () => {
    const { db, execute } = testDb(true);
    const page = await getPracticeHistory(userA, 10, undefined, db, true);
    expect(page.items).toHaveLength(2);
    expect(execute.mock.calls[0][0]).not.toMatch(/status|ACTIVE|inner join/i);
  });

  it('retains attempts when display references are unavailable', async () => {
    const { db } = testDb(true, true);
    const page = await getPracticeHistory(userA, 10, undefined, db, true);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      questionCode: null,
      topicName: null,
      selectedOptionKey: 'B',
    });
  });

  it('preserves cursor encoding, tie-break ordering, boundary predicates and limits', async () => {
    const plain = testDb(false);
    const detailed = testDb(true);
    const first = await getPracticeHistory(userA, 1, undefined, plain.db);
    const withDetails = await getPracticeHistory(userA, 1, undefined, detailed.db, true);
    expect(withDetails.nextCursor).toBe(first.nextCursor);
    expect(withDetails.items.map((x) => x.id)).toEqual(first.items.map((x) => x.id));
    await getPracticeHistory(userA, 1, withDetails.nextCursor!, detailed.db, true);
    const [statement, params] = detailed.execute.mock.calls[1];
    expect(statement).toContain(
      'order by "practice_attempts"."submitted_at" desc, "practice_attempts"."id" desc',
    );
    expect(statement).toContain('"practice_attempts"."submitted_at" <');
    expect(statement).toContain('"practice_attempts"."id" <');
    expect(params[0]).toBe(userA);
    expect(params).toContain(ids[0]);
    expect(params.at(-1)).toBe(2);
  });

  it('filters both detailed queries by the authenticated internal user', async () => {
    const { db, execute } = testDb(true);
    await getPracticeHistory(userA, 10, undefined, db, true);
    await getPracticeHistory(userB, 10, undefined, db, true);
    expect(execute.mock.calls[0][0]).toContain('"practice_attempts"."user_id" =');
    expect(execute.mock.calls[0][1][0]).toBe(userA);
    expect(execute.mock.calls[1][1][0]).toBe(userB);
  });
});


it('includes exact submitted revision content and its answer context in owner history', async () => {
  const snapshot = { questionCode: 'CCNA-Q-000001', topic: { id: historicalTopicId, slug: 'old', name: 'Original topic' }, text: 'Captured old question', type: 'MULTIPLE_CHOICE_SINGLE', difficulty: 'EASY', explanation: 'Captured rationale', imageKey: null, referenceNotes: 'Captured reference', options: [{ optionKey: 'A', text: 'Old A', isCorrect: false }, { optionKey: 'B', text: 'Old B', isCorrect: true }] };
  const { db, execute }=testDb(true,false,snapshot);
  const page=await getPracticeHistory(userA,1,undefined,db,true);
  expect(page.items[0]).toMatchObject({ historicalContentStatus:'VERIFIED_SNAPSHOT',review:{text:'Captured old question',correctOption:{optionKey:'B',text:'Old B'},explanation:'Captured rationale',referenceNotes:'Captured reference'} });
  expect(execute.mock.calls[0][0]).toContain('left join "question_revisions"');
});
it('does not invent revision content for legacy records', async () => {
  const { db }=testDb(true);const page=await getPracticeHistory(userA,1,undefined,db,true);
  expect(page.items[0]).toMatchObject({revisionId:null,historicalContentStatus:'LEGACY_UNAVAILABLE',review:null});
});
