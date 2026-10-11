import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { practiceAttemptsTable } from "@workspace/db/schema";
import { getPracticeHistory } from "./practice";

describe("Practice history PostgreSQL integration", () => {
  it("paginates consistently and isolates users", async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    const productionUrl = process.env.PRODUCTION_DATABASE_URL;

    if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
    if (
      productionUrl &&
      new URL(testUrl).hostname === new URL(productionUrl).hostname
    ) {
      throw new Error("Test and production database hosts must differ");
    }

    const pool = new Pool({ connectionString: testUrl, max: 1 });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      // Legacy pagination fixtures stay transaction-local; never write unbound public attempts.
      await client.query("CREATE TEMP TABLE practice_attempts (LIKE public.practice_attempts INCLUDING DEFAULTS) ON COMMIT DROP");

      const users = await client.query(
        "SELECT id FROM users ORDER BY id LIMIT 2",
      );
      const questions = await client.query(
        "SELECT id, topic_id FROM questions ORDER BY id LIMIT 1",
      );

      expect(users.rows).toHaveLength(2);
      expect(questions.rows).toHaveLength(1);

      const userA = users.rows[0].id as string;
      const userB = users.rows[1].id as string;
      const questionId = questions.rows[0].id as string;
      const topicId = questions.rows[0].topic_id as string;

      const db = drizzle(client);
      const timestamp = new Date("2026-10-08T10:00:00.000Z");

      const attempts = await db
        .insert(practiceAttemptsTable)
        .values([
          {
            userId: userA,
            questionId,
            topicId,
            selectedOptionKey: "A",
            isCorrect: false,
            submittedAt: timestamp,
          },
          {
            userId: userA,
            questionId,
            topicId,
            selectedOptionKey: "B",
            isCorrect: true,
            submittedAt: timestamp,
          },
          {
            userId: userA,
            questionId,
            topicId,
            selectedOptionKey: "C",
            isCorrect: false,
            submittedAt: new Date("2026-10-08T09:00:00.000Z"),
          },
          {
            userId: userB,
            questionId,
            topicId,
            selectedOptionKey: "D",
            isCorrect: true,
            submittedAt: timestamp,
          },
        ])
        .returning({ id: practiceAttemptsTable.id });

      expect(attempts).toHaveLength(4);

      const first = await getPracticeHistory(userA, 1, undefined, db);
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();

      const second = await getPracticeHistory(
        userA,
        1,
        first.nextCursor!,
        db,
      );
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeTruthy();

      const third = await getPracticeHistory(
        userA,
        1,
        second.nextCursor!,
        db,
      );
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();

      const returnedIds = [
        ...first.items,
        ...second.items,
        ...third.items,
      ].map((item) => item.id);

      expect(new Set(returnedIds).size).toBe(3);
      expect(returnedIds).not.toContain(attempts[3].id);

      const otherUser = await getPracticeHistory(userB, 10, undefined, db);
      expect(otherUser.items.map((item) => item.id)).toEqual([
        attempts[3].id,
      ]);
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
        await pool.end();
      }
    }
  });
});
