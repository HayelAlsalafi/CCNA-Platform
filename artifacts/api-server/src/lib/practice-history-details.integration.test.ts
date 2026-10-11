import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { GetPracticeHistoryWithDetailsResponse } from '@workspace/api-zod';

vi.mock('@workspace/db', async () => ({
  ...(await import('@workspace/db/schema')),
  db: undefined,
}));
const { getPracticeHistory } = await import('./practice');
const testUrl = process.env['PRACTICE_HISTORY_DETAILS_TEST_DATABASE_URL'];
if (testUrl) {
  let url: URL;
  try {
    url = new URL(testUrl);
  } catch {
    throw new Error('Invalid dedicated local history test configuration.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/ccna_history_test(?:_[a-z0-9]+)?$/.test(url.pathname) ||
    url.searchParams.size !== 0
  ) {
    throw new Error(
      'History detail tests require a dedicated loopback ccna_history_test database.',
    );
  }
}

describe.skipIf(!testUrl)('practice history details isolated PostgreSQL', () => {
  let pool: Pool;
  let client: PoolClient;
  let db: NodePgDatabase;
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const oldTopic = '11111111-1111-4111-8111-111111111111';
  const newTopic = '22222222-2222-4222-8222-222222222222';
  const question = '33333333-3333-4333-8333-333333333333';
  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl, max: 1, connectionTimeoutMillis: 5000 });
    client = await pool.connect();
    const identity = await client.query(
      "SELECT current_database() AS database, host(inet_server_addr()) AS address, current_setting('neon.branch_id', true) AS neon_branch",
    );
    expect(identity.rows[0].database).toMatch(/^ccna_history_test(?:_[a-z0-9]+)?$/);
    expect(['127.0.0.1', '::1']).toContain(identity.rows[0].address);
    expect(identity.rows[0].neon_branch || null).toBeNull();
    db = drizzle(client);
    await client.query(`
      CREATE TEMP TABLE users (id uuid PRIMARY KEY);
      CREATE TEMP TABLE topics (id uuid PRIMARY KEY, name text NOT NULL, status text NOT NULL);
      CREATE TEMP TABLE questions (id uuid PRIMARY KEY, topic_id uuid NOT NULL REFERENCES topics(id), question_code text NOT NULL, status text NOT NULL);
      CREATE TEMP TABLE question_revisions (id uuid PRIMARY KEY, snapshot jsonb);
      CREATE TEMP TABLE practice_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
        question_id uuid NOT NULL REFERENCES questions(id), topic_id uuid NOT NULL REFERENCES topics(id),
        selected_option_key varchar(8) NOT NULL, is_correct boolean NOT NULL, submitted_at timestamptz NOT NULL, revision_id uuid, delivery_id uuid
      );
    `);
  });
  afterAll(async () => {
    client?.release();
    await pool?.end();
  });
  beforeEach(async () => {
    await client.query(
      'TRUNCATE pg_temp.practice_attempts, pg_temp.questions, pg_temp.topics, pg_temp.users',
    );
    await client.query('INSERT INTO pg_temp.users VALUES ($1),($2)', [userA, userB]);
    await client.query(
      "INSERT INTO pg_temp.topics VALUES ($1,'Original topic','ACTIVE'),($2,'New topic','ACTIVE')",
      [oldTopic, newTopic],
    );
    await client.query("INSERT INTO pg_temp.questions VALUES ($1,$2,'CCNA-Q-000001','ACTIVE')", [
      question,
      oldTopic,
    ]);
    await client.query(
      `INSERT INTO pg_temp.practice_attempts (user_id,question_id,topic_id,selected_option_key,is_correct,submitted_at)
      VALUES ($1,$3,$4,'B',true,'2026-10-08T10:00:00Z'),($1,$3,$4,'A',false,'2026-10-08T10:00:00Z'),
             ($1,$3,$4,'B',true,'2026-10-08T09:00:00Z'),($2,$3,$4,'A',false,'2026-10-08T10:00:00Z')`,
      [userA, userB, question, oldTopic],
    );
  });
  const history = (user = userA, limit = 20, cursor?: string, details = true) =>
    getPracticeHistory(user, limit, cursor, db, details);
  it('returns display fields matching the contract while retaining the old default response', async () => {
    const detailed = await history();
    expect(GetPracticeHistoryWithDetailsResponse.parse(detailed)).toEqual(detailed);
    expect(detailed.items[0]).toMatchObject({
      questionCode: 'CCNA-Q-000001',
      topicName: 'Original topic',
    });
    const plain = await history(userA, 20, undefined, false);
    expect(plain.items[0]).not.toHaveProperty('questionCode');
    expect(plain.items[0]).not.toHaveProperty('topicName');
  });
  it('retains disabled questions and disabled historical topics', async () => {
    await client.query("UPDATE pg_temp.questions SET status='DISABLED'");
    await client.query("UPDATE pg_temp.topics SET status='DISABLED' WHERE id=$1", [oldTopic]);
    const result = await history();
    expect(result.items).toHaveLength(3);
    expect(result.items.every((x) => x.topicName === 'Original topic')).toBe(true);
  });
  it('keeps the submission-time topic when the question moves', async () => {
    await client.query('UPDATE pg_temp.questions SET topic_id=$1 WHERE id=$2', [
      newTopic,
      question,
    ]);
    const result = await history();
    expect(result.items).toHaveLength(3);
    expect(
      result.items.every((x) => x.topicId === oldTopic && x.topicName === 'Original topic'),
    ).toBe(true);
  });
  it('paginates exact microseconds and equal timestamps without dropping rows', async () => {
    await client.query('DELETE FROM pg_temp.practice_attempts');
    const ids = [
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ];
    const stamps = ['123456', '123456', '123100', '122999'];
    for (let index = 0; index < ids.length; index++) {
      await client.query(
        `INSERT INTO pg_temp.practice_attempts (id,user_id,question_id,topic_id,selected_option_key,is_correct,submitted_at) VALUES ($1,$2,$3,$4,'B',true,$5::timestamptz)`,
        [ids[index], userA, question, oldTopic, '2026-10-08T10:00:00.' + stamps[index] + 'Z'],
      );
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < ids.length; page++) {
      const next = await history(userA, 1, cursor);
      seen.push(...next.items.map((row) => row.id));
      cursor = next.nextCursor ?? undefined;
    }
    expect(seen).toEqual(ids);
    expect(cursor).toBeUndefined();
  });

  it('keeps page order and nextCursor stable across detail modes and isolates users', async () => {
    const all = await history();
    let cursor: string | undefined;
    const ids: string[] = [];
    for (let page = 0; page < 3; page++) {
      const detailed = await history(userA, 1, cursor);
      const plain = await history(userA, 1, cursor, false);
      expect(detailed.nextCursor).toBe(plain.nextCursor);
      expect(detailed.items.map((x) => x.id)).toEqual(plain.items.map((x) => x.id));
      ids.push(...detailed.items.map((x) => x.id));
      cursor = detailed.nextCursor ?? undefined;
    }
    expect(cursor).toBeUndefined();
    expect(ids).toEqual(all.items.map((x) => x.id));
    expect(new Set(ids).size).toBe(3);
    const other = await history(userB);
    expect(other.items).toHaveLength(1);
    expect(ids).not.toContain(other.items[0].id);
  });
});
