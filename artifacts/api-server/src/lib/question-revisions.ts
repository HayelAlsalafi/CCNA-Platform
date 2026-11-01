import { sql, eq, and, asc } from "drizzle-orm";
import {
  db,
  questionRevisionsTable,
  questionOptionsTable,
  topicsTable,
  type Question,
  type QuestionSnapshot,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the parent question lock before reading options. Admin writers
 * take that same lock before replacing options, so snapshots cannot be torn. */
export async function captureQuestionRevision(tx: Tx, question: Question) {
  const [topic] = await tx
    .select({ id: topicsTable.id, slug: topicsTable.slug, name: topicsTable.name })
    .from(topicsTable)
    .where(eq(topicsTable.id, question.topicId))
    .limit(1)
    .for("share");
  if (!topic) throw new Error("Question topic unavailable.");
  const options = await tx
    .select({
      optionKey: questionOptionsTable.optionKey,
      text: questionOptionsTable.text,
      isCorrect: questionOptionsTable.isCorrect,
    })
    .from(questionOptionsTable)
    .where(eq(questionOptionsTable.questionId, question.id))
    .orderBy(asc(questionOptionsTable.displayOrder))
    .for("share");
  const snapshot: QuestionSnapshot = {
    questionCode: question.questionCode,
    topic,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    explanation: question.explanation,
    imageKey: question.imageKey,
    referenceNotes: question.referenceNotes,
    options,
  };
  // PostgreSQL's jsonb canonical representation determines the hash, not JS key order.
  const hash = sql<string>`encode(sha256(convert_to(${JSON.stringify(snapshot)}::jsonb::text, 'UTF8')), 'hex')`;
  const [inserted] = await tx
    .insert(questionRevisionsTable)
    .values({ questionId: question.id, snapshot, contentHash: hash })
    .onConflictDoNothing({
      target: [questionRevisionsTable.questionId, questionRevisionsTable.contentHash],
    })
    .returning();
  const revision =
    inserted ??
    (
      await tx
        .select()
        .from(questionRevisionsTable)
        .where(
          and(
            eq(questionRevisionsTable.questionId, question.id),
            eq(questionRevisionsTable.contentHash, hash),
          ),
        )
        .limit(1)
    )[0];
  if (!revision) throw new Error("Question revision unavailable.");
  return revision;
}

/** Multi selections have one canonical, bounded JSON representation internally.
 * Single selections keep their original wire/storage representation. */
export function answerKeys(value: string | string[]): string[] | null {
  try {
    const raw: unknown = Array.isArray(value)
      ? value
      : value.trim().startsWith("[")
        ? JSON.parse(value)
        : [value];
    if (
      !Array.isArray(raw) ||
      !raw.length ||
      raw.length > 10 ||
      raw.some((k) => typeof k !== "string" || !k.trim() || k.trim().length > 8)
    )
      return null;
    const keys = raw.map((k) => (k as string).trim().toUpperCase());
    return new Set(keys).size === keys.length ? keys.sort() : null;
  } catch {
    return null;
  }
}
export function normalizeSelection(
  snapshot: QuestionSnapshot,
  value: string | string[],
  partial = false,
): string | null {
  const keys = answerKeys(value);
  if (!keys || keys.some((k) => !snapshot.options.some((o) => o.optionKey === k))) return null;
  const count = snapshot.options.filter((o) => o.isCorrect).length;
  if (snapshot.type === "MULTIPLE_CHOICE_SINGLE") return keys.length === 1 ? keys[0]! : null;
  if (count < 2 || (partial ? keys.length > count : keys.length !== count)) return null;
  return JSON.stringify(keys);
}
export function revisionFeedback(snapshot: QuestionSnapshot, selectedOptionKey: string | string[]) {
  const normalized = normalizeSelection(snapshot, selectedOptionKey);
  const correct = snapshot.options
    .filter((o) => o.isCorrect)
    .map(({ optionKey, text }) => ({ optionKey, text }));
  if (
    (snapshot.type === "MULTIPLE_CHOICE_SINGLE" && correct.length !== 1) ||
    (snapshot.type === "MULTIPLE_CHOICE_MULTIPLE" && correct.length < 2)
  )
    throw new Error("Question revision answer data unavailable.");
  if (!normalized) return null;
  const selected = answerKeys(normalized)!;
  const isCorrect =
    selected.length === correct.length && correct.every((o) => selected.includes(o.optionKey));
  return {
    isCorrect,
    correctOption: correct[0]!,
    ...(snapshot.type === "MULTIPLE_CHOICE_MULTIPLE" ? { correctOptions: correct } : {}),
    explanation: snapshot.explanation,
  };
}
export function revisionReview(snapshot: QuestionSnapshot) {
  const correct = snapshot.options.filter((o) => o.isCorrect);
  const feedback = revisionFeedback(
    snapshot,
    snapshot.type === "MULTIPLE_CHOICE_MULTIPLE"
      ? correct.map((o) => o.optionKey)
      : correct[0]!.optionKey,
  );
  if (!feedback) throw new Error("Question revision unavailable.");
  return {
    text: snapshot.text,
    type: snapshot.type,
    difficulty: snapshot.difficulty,
    ...(snapshot.type === "MULTIPLE_CHOICE_MULTIPLE"
      ? { requiredSelectionCount: correct.length, correctOptions: feedback.correctOptions }
      : {}),
    imageKey: snapshot.imageKey,
    referenceNotes: snapshot.referenceNotes,
    options: snapshot.options.map(({ optionKey, text }) => ({ optionKey, text })),
    correctOption: feedback.correctOption,
    explanation: snapshot.explanation,
  };
}
