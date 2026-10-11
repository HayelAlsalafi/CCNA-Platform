import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db as defaultDb, practiceAttemptsTable, questionRevisionsTable, practiceDeliveriesTable, questionsTable, topicsTable } from "@workspace/db";
import { captureQuestionRevision, revisionFeedback, revisionReview } from "./question-revisions";

type Db = typeof defaultDb;
export class PracticeApiError extends Error {
  constructor(public readonly status: 400 | 409 | 500,
    public readonly code: "INVALID_OPTION" | "INTERNAL_ERROR" | "DELIVERY_REQUIRED" | "DELIVERY_EXPIRED" | "SUBMISSION_CONFLICT", message: string) { super(message); }
}

/** Each authenticated read atomically captures content and issues a user/session
 * delivery. Correctness and author fields never enter the delivery DTO. */
export async function getPracticeQuestionForTopic(topicId: string, db: Db = defaultDb, userId?: string, sessionId: string | null = null) {
  if (!userId) throw new Error("Verified practice actor is required.");
  return db.transaction(async tx => {
    const [row] = await tx.select({ question: questionsTable }).from(questionsTable)
      .innerJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
      .where(and(eq(topicsTable.id, topicId), eq(topicsTable.status, "ACTIVE"), eq(questionsTable.status, "ACTIVE")))
      .orderBy(sql`random()`).limit(1).for("share");
    if (!row) return null;
    const revision = await captureQuestionRevision(tx, row.question);
    const [delivery] = await tx.insert(practiceDeliveriesTable).values({ userId, sessionId, questionId: row.question.id, revisionId: revision.id }).returning();
    if (!delivery) throw new Error("Practice delivery unavailable.");
    const s = revision.snapshot;
    return { id: row.question.id, deliveryId: delivery.id, revisionId: revision.id, expiresAt: delivery.expiresAt.toISOString(),
      questionCode: s.questionCode, topic: s.topic, text: s.text, type: s.type, difficulty: s.difficulty,
      options: s.options.map(({ optionKey, text }) => ({ optionKey, text })) };
  });
}

/** Delivery ownership derives from verified request context. A later edit does
 * not change this answer key. One successful submission per delivery; retries
 * with the same answer replay feedback, different answers return 409. */
export async function submitPracticeAnswer(questionId: string, selectedOptionKey: string, userId: string,
  db: Db = defaultDb, deliveryId?: string, sessionId: string | null = null) {
  if (!deliveryId) throw new PracticeApiError(409, "DELIVERY_REQUIRED", "Load a fresh question before submitting an answer.");
  const key = selectedOptionKey.trim().toUpperCase();
  return db.transaction(async tx => {
    // Serialize retries without granting the application UPDATE on immutable rows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${deliveryId}::text, 0))`);
    const [row] = await tx.select({ delivery: practiceDeliveriesTable, revision: questionRevisionsTable })
      .from(practiceDeliveriesTable).innerJoin(questionRevisionsTable, eq(questionRevisionsTable.id, practiceDeliveriesTable.revisionId))
      .where(and(eq(practiceDeliveriesTable.id, deliveryId), eq(practiceDeliveriesTable.userId, userId), eq(practiceDeliveriesTable.questionId, questionId))).limit(1);
    // A token from another verified user/session is not usable, even for replay.
    if (!row || row.delivery.sessionId !== sessionId) return null;
    const [prior] = await tx.select().from(practiceAttemptsTable).where(eq(practiceAttemptsTable.deliveryId, deliveryId)).limit(1);
    if (prior && prior.selectedOptionKey !== key) throw new PracticeApiError(409, "SUBMISSION_CONFLICT", "This delivery already has a submitted answer.");
    const feedback = revisionFeedback(row.revision.snapshot, key);
    if (!feedback) throw new PracticeApiError(400, "INVALID_OPTION", "Selected option is not part of this delivery.");
    // An accepted answer can be replayed after expiry/disable, never reinserted/regraded.
    if (prior) return { ...feedback, isCorrect: prior.isCorrect };
    const expiry = await tx.execute<{ expired: boolean }>(sql`select ${row.delivery.expiresAt.toISOString()}::timestamptz <= clock_timestamp() as expired`);
    const expired = expiry.rows[0]?.expired ?? true;
    if (expired) throw new PracticeApiError(409, "DELIVERY_EXPIRED", "This delivery expired. Load a fresh question.");
    const [active] = await tx.select({ id: questionsTable.id }).from(questionsTable)
      .innerJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
      .where(and(eq(questionsTable.id, questionId), eq(questionsTable.status, "ACTIVE"), eq(topicsTable.status, "ACTIVE"))).limit(1).for("share");
    if (!active) return null;
    const [originalTopic] = await tx.select({ id: topicsTable.id }).from(topicsTable)
      .where(and(eq(topicsTable.id, row.revision.snapshot.topic.id), eq(topicsTable.status, "ACTIVE"))).limit(1).for("share");
    if (!originalTopic) return null;
    await tx.insert(practiceAttemptsTable).values({ userId, questionId, topicId: row.revision.snapshot.topic.id,
      revisionId: row.revision.id, deliveryId, selectedOptionKey: key, isCorrect: feedback.isCorrect });
    return feedback;
  });
}

const HISTORY_LIMIT_DEFAULT = 20;
const HISTORY_LIMIT_MAX = 100;
const HISTORY_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

type HistoryCursor = {
  submittedAt: string;
  id: string;
};

function decodeHistoryCursor(cursor: string): HistoryCursor {
  if (
    cursor.length === 0 ||
    cursor.length > 512 ||
    !HISTORY_CURSOR_PATTERN.test(cursor)
  ) {
    throw new Error("Invalid practice history cursor");
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid cursor");
    }

    const value = parsed as Record<string, unknown>;
    const timestamp = value.submittedAt;
    const id = value.id;

    if (
      typeof timestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) ||
      new Date(timestamp).toISOString() !== timestamp.replace(/\.(\d{3})\d{3}Z$/, ".$1Z") ||
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new Error("Invalid cursor fields");
    }

    return { submittedAt: timestamp, id };
  } catch {
    throw new Error("Invalid practice history cursor");
  }
}

/**
 * Returns only the authenticated user's attempts in stable descending order.
 * The cursor encodes the last row's timestamp and UUID, never a user ID.
 */
export async function getPracticeHistory(
  userId: string,
  limit: number = HISTORY_LIMIT_DEFAULT,
  cursor?: string,
  db: Pick<Db, "select"> = defaultDb,
  includeDetails: boolean = false,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_LIMIT_MAX) {
    throw new Error("Invalid practice history limit");
  }

  const decoded = cursor === undefined ? undefined : decodeHistoryCursor(cursor);

  const cursorFilter = decoded
    ? or(
        lt(practiceAttemptsTable.submittedAt, sql`${decoded.submittedAt}::timestamptz`),
        and(
          eq(practiceAttemptsTable.submittedAt, sql`${decoded.submittedAt}::timestamptz`),
          lt(practiceAttemptsTable.id, decoded.id),
        ),
      )
    : undefined;

  let historyQuery = db
    .select({
      id: practiceAttemptsTable.id,
      questionId: practiceAttemptsTable.questionId,
      topicId: practiceAttemptsTable.topicId,
      selectedOptionKey: practiceAttemptsTable.selectedOptionKey,
      isCorrect: practiceAttemptsTable.isCorrect,
      submittedAt: practiceAttemptsTable.submittedAt,
      // Preserve PostgreSQL microseconds for the opaque cursor, not the DTO.
      submittedAtExact: sql<string>`to_char(${practiceAttemptsTable.submittedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      ...(includeDetails ? {
        questionCode: sql<string | null>`coalesce(${questionRevisionsTable.snapshot}->>'questionCode', ${questionsTable.questionCode})`,
        topicName: sql<string | null>`coalesce(${questionRevisionsTable.snapshot}->'topic'->>'name', ${topicsTable.name})`,
        revisionId: practiceAttemptsTable.revisionId,
        snapshot: sql<import("@workspace/db").QuestionSnapshot | null>`${questionRevisionsTable.snapshot}`,
      } : {}),
    })
    .from(practiceAttemptsTable)
    .$dynamic();

  if (includeDetails) {
    // Preserve missing/disabled references and the submission-time topic.
    historyQuery = historyQuery
      .leftJoin(questionsTable, eq(questionsTable.id, practiceAttemptsTable.questionId))
      .leftJoin(topicsTable, eq(topicsTable.id, practiceAttemptsTable.topicId))
      .leftJoin(questionRevisionsTable, eq(questionRevisionsTable.id, practiceAttemptsTable.revisionId));
  }

  const rows = await historyQuery
    .where(and(eq(practiceAttemptsTable.userId, userId), cursorFilter))
    .orderBy(
      desc(practiceAttemptsTable.submittedAt),
      desc(practiceAttemptsTable.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({
            submittedAt: last.submittedAtExact,
            id: last.id,
          }),
        ).toString("base64url")
      : null;

  return {
    items: page.map(({ submittedAtExact: _exact, ...row }) => {
      const { snapshot, ...item } = row as typeof row & { snapshot?: import("@workspace/db").QuestionSnapshot | null };
      return { ...item, submittedAt: row.submittedAt.toISOString(), ...(includeDetails ? {
        historicalContentStatus: snapshot ? "VERIFIED_SNAPSHOT" as const : "LEGACY_UNAVAILABLE" as const,
        review: snapshot ? revisionReview(snapshot) : null,
      } : {}) };
    }),
    nextCursor,
  };
}
