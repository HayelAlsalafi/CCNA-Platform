import { and, asc, eq } from "drizzle-orm";
import {
  createQuestionInputSchema,
  db as defaultDb,
  questionOptionsTable,
  questionsTable,
  topicsTable,
} from "@workspace/db";

import { captureQuestionRevision } from "./question-revisions";

type Db = typeof defaultDb;

export class QuestionValidationError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super("Question validation failed.");
  }
}

/**
 * Validates and creates a question with its options in one transaction.
 */
export async function createQuestion(input: unknown, db: Db = defaultDb) {
  const parsed = createQuestionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new QuestionValidationError(
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const q = parsed.data;

  return db.transaction(async (tx) => {
    const [topic] = await tx
      .select({ id: topicsTable.id })
      .from(topicsTable)
      .where(eq(topicsTable.id, q.topicId))
      .limit(1);
    if (!topic) {
      throw new QuestionValidationError([{ path: "topicId", message: "Topic does not exist." }]);
    }

    const [question] = await tx
      .insert(questionsTable)
      .values({
        topicId: q.topicId,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        explanation: q.explanation,
        imageKey: q.imageKey,
        referenceNotes: q.referenceNotes,
        status: q.status,
      })
      .returning();
    if (!question) throw new Error("Question insert returned no row.");

    const options = await tx
      .insert(questionOptionsTable)
      .values(
        q.options.map((o, i) => ({
          questionId: question.id,
          optionKey: o.optionKey.toUpperCase(),
          displayOrder: i,
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      )
      .returning();

    await captureQuestionRevision(tx, question);
    return { question, options };
  });
}

/**
 * Learner-facing read: only ACTIVE questions in ACTIVE topics. Correctness is
 * never included so answers are not leaked before an attempt exists.
 */
export async function getLearnerQuestion(id: string, db: Db = defaultDb) {
  const [row] = await db
    .select({ question: questionsTable })
    .from(questionsTable)
    .innerJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
    .where(
      and(
        eq(questionsTable.id, id),
        eq(questionsTable.status, "ACTIVE"),
        eq(topicsTable.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!row) return null;

  const options = await db
    .select({
      optionKey: questionOptionsTable.optionKey,
      text: questionOptionsTable.text,
      displayOrder: questionOptionsTable.displayOrder,
    })
    .from(questionOptionsTable)
    .where(eq(questionOptionsTable.questionId, id))
    .orderBy(asc(questionOptionsTable.displayOrder));

  const q = row.question;
  return {
    id: q.id,
    questionCode: q.questionCode,
    topicId: q.topicId,
    text: q.text,
    type: q.type,
    difficulty: q.difficulty,
    imageKey: q.imageKey,
    options: options.map((o) => ({ optionKey: o.optionKey, text: o.text })),
  };
}
