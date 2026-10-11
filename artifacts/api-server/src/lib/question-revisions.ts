import { sql, eq, and, asc } from "drizzle-orm";
import { db, questionRevisionsTable, questionOptionsTable, topicsTable, type Question, type QuestionSnapshot } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the parent question lock before reading options. Admin writers
 * take that same lock before replacing options, so snapshots cannot be torn. */
export async function captureQuestionRevision(tx: Tx, question: Question) {
  const [topic] = await tx.select({ id: topicsTable.id, slug: topicsTable.slug, name: topicsTable.name })
    .from(topicsTable).where(eq(topicsTable.id, question.topicId)).limit(1).for("share");
  if (!topic) throw new Error("Question topic unavailable.");
  const options = await tx.select({ optionKey: questionOptionsTable.optionKey, text: questionOptionsTable.text, isCorrect: questionOptionsTable.isCorrect })
    .from(questionOptionsTable).where(eq(questionOptionsTable.questionId, question.id)).orderBy(asc(questionOptionsTable.displayOrder)).for("share");
  const snapshot: QuestionSnapshot = {
    questionCode: question.questionCode, topic, text: question.text, type: question.type,
    difficulty: question.difficulty, explanation: question.explanation,
    imageKey: question.imageKey, referenceNotes: question.referenceNotes, options,
  };
  // PostgreSQL's jsonb canonical representation determines the hash, not JS key order.
  const hash = sql<string>`encode(sha256(convert_to(${JSON.stringify(snapshot)}::jsonb::text, 'UTF8')), 'hex')`;
  const [inserted] = await tx.insert(questionRevisionsTable).values({ questionId: question.id, snapshot, contentHash: hash })
    .onConflictDoNothing({ target: [questionRevisionsTable.questionId, questionRevisionsTable.contentHash] }).returning();
  const revision = inserted ?? (await tx.select().from(questionRevisionsTable)
    .where(and(eq(questionRevisionsTable.questionId, question.id), eq(questionRevisionsTable.contentHash, hash))).limit(1))[0];
  if (!revision) throw new Error("Question revision unavailable.");
  return revision;
}

export function revisionFeedback(snapshot: QuestionSnapshot, selectedOptionKey: string) {
  const selected = snapshot.options.find(o => o.optionKey === selectedOptionKey);
  const correct = snapshot.options.filter(o => o.isCorrect);
  if (correct.length !== 1 || !correct[0]) throw new Error("Question revision answer data unavailable.");
  return selected ? { isCorrect: selected.isCorrect, correctOption: { optionKey: correct[0].optionKey, text: correct[0].text }, explanation: snapshot.explanation } : null;
}

export function revisionReview(snapshot: QuestionSnapshot) {
  const feedback = revisionFeedback(snapshot, snapshot.options[0]!.optionKey);
  if (!feedback) throw new Error("Question revision unavailable.");
  return { text: snapshot.text, type: snapshot.type, difficulty: snapshot.difficulty,
    imageKey: snapshot.imageKey, referenceNotes: snapshot.referenceNotes,
    options: snapshot.options.map(({ optionKey, text }) => ({ optionKey, text })),
    correctOption: feedback.correctOption, explanation: snapshot.explanation };
}
