import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db as defaultDb,
  questionsTable,
  topicsTable,
  practiceDeliveriesTable,
} from "@workspace/db";
import { captureQuestionRevision } from "./question-revisions";
export const practiceBatchInput = z
  .object({ topicId: z.string().uuid(), count: z.number().int().min(1).max(100) })
  .strict();
export class PracticeBatchError extends Error {
  readonly status = 400;
}

/** Atomically issues distinct authenticated deliveries. No client answer keys.
 * Existing single-question API and grading/history contracts remain unchanged. */
export async function startPracticeBatch(
  input: unknown,
  userId: string,
  sessionId: string | null,
  db = defaultDb,
) {
  const parsed = practiceBatchInput.safeParse(input);
  if (!parsed.success) throw new PracticeBatchError("Choose a valid topic and 1–100 questions.");
  if (!userId || !sessionId) throw new PracticeBatchError("A verified session is required.");
  const { topicId, count } = parsed.data;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    const rows = await tx
      .select({ question: questionsTable })
      .from(questionsTable)
      .innerJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
      .where(
        and(
          eq(topicsTable.id, topicId),
          eq(topicsTable.status, "ACTIVE"),
          eq(questionsTable.status, "ACTIVE"),
        ),
      )
      .orderBy(sql`random()`)
      .limit(count)
      .for("share");
    if (rows.length !== count)
      throw new PracticeBatchError(
        "Requested count exceeds the currently available questions. Refresh the topic catalog.",
      );
    const questions = [];
    for (const { question } of rows) {
      const revision = await captureQuestionRevision(tx, question);
      const [delivery] = await tx
        .insert(practiceDeliveriesTable)
        .values({ userId, sessionId, questionId: question.id, revisionId: revision.id })
        .returning();
      if (!delivery) throw Error("Practice delivery unavailable.");
      const s = revision.snapshot;
      questions.push({
        id: question.id,
        deliveryId: delivery.id,
        revisionId: revision.id,
        expiresAt: delivery.expiresAt.toISOString(),
        questionCode: s.questionCode,
        topic: s.topic,
        text: s.text,
        type: s.type,
          ...(s.type === "MULTIPLE_CHOICE_MULTIPLE" ? {requiredSelectionCount:s.options.filter(o=>o.isCorrect).length} : {}),
        difficulty: s.difficulty,
        options: s.options.map(({ optionKey, text }) => ({ optionKey, text })),
      });
    }
    return { questions };
  });
}
