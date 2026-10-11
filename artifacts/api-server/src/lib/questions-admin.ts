import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  db as defaultDb,
  questionOptionsTable,
  questionsTable,
  topicsTable,
  type Question,
  type QuestionOption,
} from "@workspace/db";
import {
  questionDifficultyEnum,
  questionStatusEnum,
  updateQuestionInputSchema,
  type UpdateQuestionInput,
} from "@workspace/db/schema";
import { z } from "zod";
import { createQuestion, QuestionValidationError } from "./questions";

import { captureQuestionRevision } from "./question-revisions";

type Db = typeof defaultDb;

export class AdminQuestionError extends Error {
  constructor(
    public readonly status: 400 | 404,
    public readonly code: "VALIDATION_ERROR" | "NOT_FOUND",
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const queryInteger = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value: unknown) => {
      if (value === undefined) return fallback;
      if (typeof value === "string" && value.trim() !== "") return Number(value);
      return value;
    },
    z.number().int().min(min).max(max),
  );

export const adminQuestionListQuerySchema = z
  .object({
    topicId: z.string().uuid().optional(),
    status: z.enum(questionStatusEnum.enumValues).optional(),
    difficulty: z.enum(questionDifficultyEnum.enumValues).optional(),
    limit: queryInteger(25, 1, 100),
    offset: queryInteger(0, 0, 1_000_000),
  })
  .strict();

export type AdminQuestionListQuery = z.infer<typeof adminQuestionListQuerySchema>;

function validationError(issues: { path: string; message: string }[]) {
  return new AdminQuestionError(400, "VALIDATION_ERROR", "Invalid question data.", issues);
}

export function parseAdminQuestionListQuery(input: unknown): AdminQuestionListQuery {
  const result = adminQuestionListQuerySchema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

function parseUpdate(input: unknown): UpdateQuestionInput {
  const result = updateQuestionInputSchema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

function notFound(): AdminQuestionError {
  return new AdminQuestionError(404, "NOT_FOUND", "Question not found.");
}

export function toAdminQuestion(question: Question, options: QuestionOption[]) {
  return {
    id: question.id,
    questionCode: question.questionCode,
    topicId: question.topicId,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    explanation: question.explanation,
    imageKey: question.imageKey,
    referenceNotes: question.referenceNotes,
    status: question.status,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
    options: [...options]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((option) => ({
        optionKey: option.optionKey,
        displayOrder: option.displayOrder,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
  };
}

export async function listAdminQuestions(input: AdminQuestionListQuery, db: Db = defaultDb) {
  const filters = [
    input.topicId ? eq(questionsTable.topicId, input.topicId) : undefined,
    input.status ? eq(questionsTable.status, input.status) : undefined,
    input.difficulty ? eq(questionsTable.difficulty, input.difficulty) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== undefined);
  const where = filters.length ? and(...filters) : undefined;

  const [countRow] = await db.select({ total: count() }).from(questionsTable).where(where);
  const questions = await db
    .select()
    .from(questionsTable)
    .where(where)
    .orderBy(desc(questionsTable.createdAt), desc(questionsTable.id))
    .limit(input.limit)
    .offset(input.offset);
  const options = questions.length
    ? await db
        .select()
        .from(questionOptionsTable)
        .where(inArray(questionOptionsTable.questionId, questions.map((question) => question.id)))
        .orderBy(asc(questionOptionsTable.displayOrder))
    : [];
  const optionsByQuestion = new Map<string, QuestionOption[]>();
  for (const option of options) {
    const questionOptions = optionsByQuestion.get(option.questionId) ?? [];
    questionOptions.push(option);
    optionsByQuestion.set(option.questionId, questionOptions);
  }

  return {
    items: questions.map((question) => toAdminQuestion(question, optionsByQuestion.get(question.id) ?? [])),
    total: Number(countRow?.total ?? 0),
    limit: input.limit,
    offset: input.offset,
  };
}

export async function createAdminQuestion(input: unknown, db: Db = defaultDb) {
  try {
    const created = await createQuestion(input, db);
    return toAdminQuestion(created.question, created.options);
  } catch (error) {
    if (error instanceof QuestionValidationError) throw validationError(error.issues);
    throw error;
  }
}

export async function updateAdminQuestion(id: string, input: unknown, db: Db = defaultDb) {
  const data = parseUpdate(input);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: questionsTable.id }).from(questionsTable).where(eq(questionsTable.id, id)).limit(1).for("update");
    if (!existing) throw notFound();

    if (data.topicId) {
      const [topic] = await tx.select({ id: topicsTable.id }).from(topicsTable).where(eq(topicsTable.id, data.topicId)).limit(1);
      if (!topic) throw validationError([{ path: "topicId", message: "Topic does not exist." }]);
    }

    const { options: updatedOptions, ...fields } = data;
    const [question] = await tx
      .update(questionsTable)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(questionsTable.id, id))
      .returning();
    if (!question) throw notFound();

    let options: QuestionOption[];
    if (updatedOptions) {
      await tx.delete(questionOptionsTable).where(eq(questionOptionsTable.questionId, id));
      options = await tx
        .insert(questionOptionsTable)
        .values(
          updatedOptions.map((option, displayOrder) => ({
            questionId: id,
            optionKey: option.optionKey.toUpperCase(),
            displayOrder,
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        )
        .returning();
    } else {
      options = await tx
        .select()
        .from(questionOptionsTable)
        .where(eq(questionOptionsTable.questionId, id))
        .orderBy(asc(questionOptionsTable.displayOrder));
    }

    await captureQuestionRevision(tx, question);
    return toAdminQuestion(question, options);
  });
}

export async function disableAdminQuestion(id: string, db: Db = defaultDb) {
  return db.transaction(async (tx) => {
    const [question] = await tx
      .update(questionsTable)
      .set({ status: "DISABLED", updatedAt: new Date() })
      .where(eq(questionsTable.id, id))
      .returning();
    if (!question) throw notFound();

    const options = await tx
      .select()
      .from(questionOptionsTable)
      .where(eq(questionOptionsTable.questionId, id))
      .orderBy(asc(questionOptionsTable.displayOrder));
    await captureQuestionRevision(tx, question);
    return toAdminQuestion(question, options);
  });
}
