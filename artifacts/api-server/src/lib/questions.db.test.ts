/**
 * Phase 3A database-level tests. Run only when RUN_DB_TESTS=1 and DATABASE_URL
 * are set. Every test runs inside a transaction that is always rolled back, so
 * no rows persist (sequence values may be consumed — gaps are acceptable).
 */
import { describe, expect, it } from "vitest";

const enabled = process.env["RUN_DB_TESTS"] === "1" && !!process.env["DATABASE_URL"];
const ROLLBACK = new Error("rollback");
describe("question domain (database)", async () => {
  if (!enabled) {
    it.skip("requires RUN_DB_TESTS=1 and DATABASE_URL", () => {});
    return;
  }
  const { db, pool, topicsTable, questionsTable, usersTable, practiceAttemptsTable } =
    await import("@workspace/db");
  const { createQuestion, getLearnerQuestion, QuestionValidationError } =
    await import("./questions");
  const { getPracticeQuestionForTopic, submitPracticeAnswer: submitBoundAnswer } = await import("./practice");
  async function submitPracticeAnswer(questionId: string, key: string, userId: string, tx: typeof db) {
    const [question] = await tx.select().from(questionsTable).where(eq(questionsTable.id, questionId)).limit(1);
    if (!question) return null;
    const delivery = await getPracticeQuestionForTopic(question.topicId, tx, userId);
    if (!delivery || delivery.id !== questionId) return null;
    return submitBoundAnswer(questionId, key, userId, tx, delivery.deliveryId);
  }
  const { eq, sql } = await import("drizzle-orm");

  async function inRollback(fn: (tx: typeof db) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx as unknown as typeof db);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  }
  async function makeTopic(tx: typeof db, status: "ACTIVE" | "DISABLED" = "ACTIVE") {
    const [t] = await tx
      .insert(topicsTable)
      .values({ slug: `p3a-test-${crypto.randomUUID()}`, name: "P3A test", status })
      .returning();
    return t!;
  }
  async function makeUser(tx: typeof db) {
    const suffix = crypto.randomUUID();
    const [user] = await tx
      .insert(usersTable)
      .values({
        clerkUserId: `p5a-${suffix}`,
        email: `${suffix}@example.com`,
        displayName: "Practice test learner",
      })
      .returning();
    return user!;
  }
  const input = (topicId: string, extra: Record<string, unknown> = {}) => ({
    topicId,
    text: "Q?",
    type: "MULTIPLE_CHOICE_SINGLE",
    difficulty: "MEDIUM",
    options: [
      { optionKey: "A", text: "a", isCorrect: true },
      { optionKey: "B", text: "b", isCorrect: false },
    ],
    ...extra,
  });

  it("creates a question with a generated, unique CCNA-Q code", async () => {
    await inRollback(async (tx) => {
      const t = await makeTopic(tx);
      const a = await createQuestion(input(t.id), tx);
      const b = await createQuestion(input(t.id), tx);
      expect(a.question.questionCode).toMatch(/^CCNA-Q-\d{6,}$/);
      expect(a.question.questionCode).not.toBe(b.question.questionCode);
      expect(a.options).toHaveLength(2);
    });
  });

  it("enforces questionCode uniqueness at the database", async () => {
    await inRollback(async (tx) => {
      const t = await makeTopic(tx);
      const a = await createQuestion(input(t.id), tx);
      await tx.execute(sql`savepoint s1`);
      await expect(
        tx.execute(sql`insert into questions (question_code, topic_id, text, difficulty)
          values (${a.question.questionCode}, ${t.id}, 'x', 'EASY')`),
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint s1`);
    });
  });

  it("makes questionCode immutable", async () => {
    await inRollback(async (tx) => {
      const t = await makeTopic(tx);
      const a = await createQuestion(input(t.id), tx);
      await tx.execute(sql`savepoint s2`);
      await expect(
        tx
          .update(questionsTable)
          .set({ questionCode: "CCNA-Q-999999" })
          .where(eq(questionsTable.id, a.question.id)),
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint s2`);
    });
  });

  it("rejects a non-existent topic (service and foreign key)", async () => {
    await inRollback(async (tx) => {
      const missing = "00000000-0000-4000-8000-000000000000";
      await expect(createQuestion(input(missing), tx)).rejects.toBeInstanceOf(
        QuestionValidationError,
      );
      await tx.execute(sql`savepoint s3`);
      await expect(
        tx.execute(
          sql`insert into questions (topic_id, text, difficulty) values (${missing}, 'x', 'EASY')`,
        ),
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint s3`);
    });
  });

  it("hides DISABLED questions and questions in DISABLED topics from learners", async () => {
    await inRollback(async (tx) => {
      const t = await makeTopic(tx);
      const active = await createQuestion(input(t.id), tx);
      const disabled = await createQuestion(input(t.id, { status: "DISABLED" }), tx);
      const got = await getLearnerQuestion(active.question.id, tx);
      expect(got?.questionCode).toBe(active.question.questionCode);
      expect(JSON.stringify(got)).not.toContain("isCorrect");
      expect(await getLearnerQuestion(disabled.question.id, tx)).toBeNull();
      const dt = await makeTopic(tx, "DISABLED");
      const inDisabledTopic = await createQuestion(input(dt.id), tx);
      expect(await getLearnerQuestion(inDisabledTopic.question.id, tx)).toBeNull();
    });
  });

  it("keeps practice question responses answer-free and grades only on submission", async () => {
    await inRollback(async (tx) => {
      const user = await makeUser(tx);
      const topic = await makeTopic(tx);
      const created = await createQuestion(
        input(topic.id, {
          explanation: "The correct answer is B.",
          referenceNotes: "Author-only note.",
          options: [
            { optionKey: "A", text: "Incorrect", isCorrect: false },
            { optionKey: "B", text: "Correct", isCorrect: true },
          ],
        }),
        tx,
      );

      const practiceQuestion = await getPracticeQuestionForTopic(topic.id, tx, user.id);
      expect(practiceQuestion?.id).toBe(created.question.id);
      expect(practiceQuestion?.options).toEqual([
        { optionKey: "A", text: "Incorrect" },
        { optionKey: "B", text: "Correct" },
      ]);
      expect(JSON.stringify(practiceQuestion)).not.toMatch(
        /isCorrect|correctOption|explanation|referenceNotes|imageKey/,
      );

      await expect(
        submitPracticeAnswer(created.question.id, "A", user.id, tx),
      ).resolves.toMatchObject({
        isCorrect: false,
        correctOption: { optionKey: "B", text: "Correct" },
        explanation: "The correct answer is B.",
      });
      await expect(
        submitPracticeAnswer(created.question.id, "B", user.id, tx),
      ).resolves.toMatchObject({
        isCorrect: true,
        correctOption: { optionKey: "B", text: "Correct" },
      });
      await expect(
        submitPracticeAnswer(created.question.id, "Z", user.id, tx),
      ).rejects.toMatchObject({
        status: 400,
        code: "INVALID_OPTION",
      });
    });
  });

  it("persists practice attempts with correct user, question, topic and grading", async () => {
    await inRollback(async (tx) => {
      const user = await makeUser(tx);
      const topic = await makeTopic(tx);

      const created = await createQuestion(
        input(topic.id, {
          options: [
            { optionKey: "A", text: "Incorrect", isCorrect: false },
            { optionKey: "B", text: "Correct", isCorrect: true },
          ],
        }),
        tx,
      );

      await submitPracticeAnswer(created.question.id, "A", user.id, tx);
      await submitPracticeAnswer(created.question.id, "B", user.id, tx);

      const attempts = await tx
        .select()
        .from(practiceAttemptsTable)
        .where(eq(practiceAttemptsTable.questionId, created.question.id));

      expect(attempts).toHaveLength(2);

      expect(
        attempts.map((attempt) => ({
          userId: attempt.userId,
          questionId: attempt.questionId,
          topicId: attempt.topicId,
          selectedOptionKey: attempt.selectedOptionKey,
          isCorrect: attempt.isCorrect,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            userId: user.id,
            questionId: created.question.id,
            topicId: topic.id,
            selectedOptionKey: "A",
            isCorrect: false,
          },
          {
            userId: user.id,
            questionId: created.question.id,
            topicId: topic.id,
            selectedOptionKey: "B",
            isCorrect: true,
          },
        ]),
      );

      await expect(
        submitPracticeAnswer(created.question.id, "Z", user.id, tx),
      ).rejects.toMatchObject({
        status: 400,
        code: "INVALID_OPTION",
      });

      const attemptsAfterRejection = await tx
        .select()
        .from(practiceAttemptsTable)
        .where(eq(practiceAttemptsTable.questionId, created.question.id));

      expect(attemptsAfterRejection).toHaveLength(2);
    });
  });

  it("does not fetch or grade disabled questions or questions in disabled topics", async () => {
    await inRollback(async (tx) => {
      const user = await makeUser(tx);
      const activeTopic = await makeTopic(tx);
      const disabledQuestion = await createQuestion(
        input(activeTopic.id, { status: "DISABLED" }),
        tx,
      );
      expect(await getPracticeQuestionForTopic(activeTopic.id, tx, user.id)).toBeNull();
      expect(await submitPracticeAnswer(disabledQuestion.question.id, "A", user.id, tx)).toBeNull();

      const disabledTopic = await makeTopic(tx, "DISABLED");
      const activeQuestion = await createQuestion(input(disabledTopic.id), tx);
      expect(await getPracticeQuestionForTopic(disabledTopic.id, tx, user.id)).toBeNull();
      expect(await submitPracticeAnswer(activeQuestion.question.id, "A", user.id, tx)).toBeNull();
    });
  });

  it("closes the pool", async () => {
    await pool.end();
  });
});
