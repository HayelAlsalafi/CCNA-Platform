import { sql, eq, inArray, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db as defaultDb,
  questionsTable,
  topicsTable,
  practiceDeliveriesTable,
  type QuestionSnapshot,
} from "@workspace/db";
import { captureQuestionRevision, revisionReview, revisionFeedback, normalizeSelection } from "./question-revisions";
import { submitPracticeAnswer } from "./practice";
import { commandCenterProjection, parseCommandCenterQuery } from "./command-center";
import { GetCommandCenterAnalyticsResponse } from "@workspace/api-zod";
type Db = typeof defaultDb;
export class NexusError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new NexusError(status, code, message);
};
export const nexusSelection = z.strictObject({
  domainId: z.uuid().optional(),
  topicId: z.uuid().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  mode: z.enum(["LEARN", "PRACTICE", "REVIEW_MISTAKES"]).default("LEARN"),
});
export const nexusStart = nexusSelection.extend({
  count: z.number().int().min(1).max(100),
  requestId: z.uuid(),
});
export function parseNexusStart(input: unknown) {
  const p = nexusStart.safeParse(input);
  if (!p.success)
    fail(400, "VALIDATION_ERROR", "Choose valid filters, mode, request ID and 1–100 questions.");
  return p.data!;
}
const domainBindings = sql`SELECT q.id AS question_id,d.id,d.code,d.name,d.blueprint_id,b.version FROM public.questions q JOIN public.curriculum_chapters c ON c.id=q.topic_id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=d.blueprint_id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'`;
function eligible(p: z.infer<typeof nexusSelection>, userId: string) {
  return sql`SELECT q.id,q.topic_id,q.difficulty FROM public.questions q JOIN public.topics t ON t.id=q.topic_id WHERE q.status='ACTIVE' AND t.status='ACTIVE' ${p.topicId ? sql`AND q.topic_id=${p.topicId}::uuid` : sql``} ${p.difficulty ? sql`AND q.difficulty=${p.difficulty}::public.question_difficulty` : sql``} ${p.domainId ? sql`AND EXISTS(SELECT 1 FROM (${domainBindings}) d WHERE d.question_id=q.id AND d.id=${p.domainId}::uuid)` : sql``} ${p.mode === "REVIEW_MISTAKES" ? sql`AND (SELECT a.is_correct FROM public.practice_attempts a WHERE a.user_id=${userId}::uuid AND a.question_id=q.id ORDER BY a.submitted_at DESC,a.id DESC LIMIT 1)=false` : sql``}`;
}
export async function nexusInstalled(db: Pick<Db, "execute"> = defaultDb) {
  const r = (
    await db.execute<{ sessions: boolean; items: boolean }>(
      sql`SELECT to_regclass('public.learning_sessions') IS NOT NULL AS sessions,to_regclass('public.learning_session_items') IS NOT NULL AS items`,
    )
  ).rows[0]!;
  if (r.sessions !== r.items)
    fail(
      503,
      "SCHEMA_INCOMPLETE",
      "Session schema is incomplete; guarded upgrade review required.",
    );
  return r.sessions;
}
export async function nexusAvailability(input: unknown, userId: string, db: Db = defaultDb) {
  const parsed = nexusSelection.safeParse(input);
  if (!parsed.success) fail(400, "VALIDATION_ERROR", "Invalid practice filters.");
  const p = parsed.data!;
  const r = (
    await db.execute(
      sql`WITH eligible AS (${eligible(p, userId)}) SELECT count(*)::int AS available FROM eligible`,
    )
  ).rows[0]!;
  const topics = (
    await db.execute(
      sql`WITH eligible AS (${eligible({ ...p, topicId: undefined }, userId)}) SELECT t.id,t.name,count(*)::int AS available FROM eligible q JOIN public.topics t ON t.id=q.topic_id GROUP BY t.id,t.name ORDER BY t.name,t.id LIMIT 500`,
    )
  ).rows;
  return { available: Number(r.available), topics, persistence: await nexusInstalled(db) };
}
export async function nexusAnalytics(
  userId: string,
  authSession: string,
  range: unknown = "30",
  db: Db = defaultDb,
  timezone: unknown = "UTC",
) {
  let query: ReturnType<typeof parseCommandCenterQuery>;
  try { query = parseCommandCenterQuery({ range, timezone }); }
  catch { return fail(400, "VALIDATION_ERROR", "Choose 7, 30, 90 days or all time and a valid timezone."); }
  const period = query.range;
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL statement_timeout='10s'`);
    const installed = await nexusInstalled(tx);
  const result = (
    await tx.execute<{ totals: unknown; domains: unknown; timeline: unknown; topics: unknown }>(sql`WITH bindings AS (${domainBindings}),a AS (SELECT question_id,topic_id,is_correct,submitted_at FROM public.practice_attempts WHERE user_id=${userId}::uuid),available AS (SELECT q.id FROM public.questions q JOIN public.topics t ON t.id=q.topic_id WHERE q.status='ACTIVE' AND t.status='ACTIVE'),domains AS (SELECT d.id,d.code,d.name,b.version FROM public.exam_domains d JOIN public.exam_blueprints b ON b.id=d.blueprint_id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'),dm AS (SELECT d.*,(SELECT count(*) FROM available q JOIN bindings m ON m.question_id=q.id WHERE m.id=d.id)::int AS available,(SELECT count(DISTINCT a.question_id) FROM a JOIN bindings m ON m.question_id=a.question_id JOIN available q ON q.id=a.question_id WHERE m.id=d.id)::int AS attempted,(SELECT count(*) FROM a JOIN public.curriculum_chapters ac ON ac.id=a.topic_id WHERE ac.domain_id=d.id)::int AS attempts,(SELECT count(*) FROM a JOIN public.curriculum_chapters ac ON ac.id=a.topic_id WHERE ac.domain_id=d.id AND a.is_correct)::int AS correct,(SELECT count(*) FROM public.curriculum_chapters c WHERE c.domain_id=d.id)::int AS chapters,(SELECT count(DISTINCT c.id) FROM public.curriculum_chapters c JOIN public.questions q ON q.topic_id=c.id JOIN available a ON a.id=q.id WHERE c.domain_id=d.id)::int AS covered_chapters FROM domains d),topic_metrics AS (SELECT t.id,t.name,count(DISTINCT q.id)::int AS available,(SELECT count(*) FROM a WHERE a.topic_id=t.id)::int AS attempts,(SELECT count(*) FROM a WHERE a.topic_id=t.id AND a.is_correct)::int AS correct,(SELECT count(DISTINCT a.question_id) FROM a JOIN available v ON v.id=a.question_id WHERE a.topic_id=t.id)::int AS attempted FROM public.topics t JOIN public.questions q ON q.topic_id=t.id AND q.status='ACTIVE' WHERE t.status='ACTIVE' GROUP BY t.id,t.name)
 SELECT jsonb_build_object('attempts',(SELECT count(*) FROM a),'correct',(SELECT count(*) FROM a WHERE is_correct),'unique',(SELECT count(DISTINCT question_id) FROM a),'lastActivity',(SELECT max(submitted_at) FROM a),'available',(SELECT count(*) FROM available),'unmapped',(SELECT count(*) FROM available q WHERE NOT EXISTS(SELECT 1 FROM bindings m WHERE m.question_id=q.id)),'unmappedAttempts',(SELECT count(*) FROM a WHERE NOT EXISTS(SELECT 1 FROM public.curriculum_chapters ac JOIN public.exam_blueprints ab ON ab.id=ac.blueprint_id WHERE ac.id=a.topic_id AND ab.exam_code='200-301' AND ab.version='1.1' AND ab.status='ACTIVE'))) AS totals,(SELECT coalesce(jsonb_agg(to_jsonb(dm)||jsonb_build_object('recommendedTopic',(SELECT to_jsonb(tm) FROM topic_metrics tm WHERE EXISTS(SELECT 1 FROM public.questions q JOIN available v ON v.id=q.id JOIN bindings m ON m.question_id=q.id WHERE q.topic_id=tm.id AND m.id=dm.id) AND ((tm.attempts>=5 AND tm.correct::numeric/nullif(tm.attempts,0)<0.7) OR tm.available>tm.attempted) ORDER BY (tm.attempts>=5 AND tm.correct::numeric/nullif(tm.attempts,0)<0.7) DESC NULLS LAST,(tm.available-tm.attempted) DESC,tm.name,tm.id LIMIT 1)) ORDER BY dm.code),'[]') FROM dm) AS domains,'[]'::jsonb AS timeline,(SELECT coalesce(jsonb_agg(to_jsonb(topic_metrics) ORDER BY name),'[]') FROM topic_metrics) AS topics`)
  ).rows[0]!;
  const sessions = installed
    ? await nexusSessionHistory(userId, { page: 1, pageSize: 5 }, tx)
    : { items: [], total: 0, page: 1, totalPages: 1 };
  const resume = installed
    ? ((
        await tx.execute(
          sql`SELECT s.id,s.mode,s.question_count AS "questionCount",to_json(s.created_at) AS "createdAt" FROM public.learning_sessions s WHERE s.user_id=${userId}::uuid AND s.auth_session_id=${authSession} AND s.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id IS NULL) AND NOT EXISTS(SELECT 1 FROM public.learning_session_items i JOIN public.practice_deliveries d ON d.id=i.delivery_id WHERE i.session_id=s.id AND d.expires_at<=clock_timestamp()) ORDER BY s.created_at DESC,s.id LIMIT 1`,
        )
      ).rows[0] ?? null)
    : null;
  const response = {
    ...result,
    ...await commandCenterProjection(userId, query, installed, tx),
    persistence: installed,
    sessions: { ...sessions, items: sessions.items.map(item => ({ ...item, topics: item.topics ?? "" })) },
    resume,
    range: period,
    granularity: period === "all" ? "month" : "day",
    taxonomyBasis: "Canonical CCNA v1.1 book chapters and their primary domains.",
    studyTime: null,
    streak: null,
  };
  // Raw Drizzle timestamps are text. Session queries serialize them as JSON
  // to preserve ISO offsets and microseconds without relaxing validation.
  const validated = GetCommandCenterAnalyticsResponse.safeParse(JSON.parse(JSON.stringify(response)));
  if (!validated.success) return fail(500, "ANALYTICS_RESPONSE_INVALID", "Learning data could not be validated. Retry; if it persists, report ANALYTICS_RESPONSE_INVALID.");
  return validated.data;
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
function deliveryView(
  snapshot: QuestionSnapshot,
  delivery: { id: string; revisionId: string; expiresAt: Date },
) {
  return {
    id: "",
    deliveryId: delivery.id,
    revisionId: delivery.revisionId,
    expiresAt: new Date(delivery.expiresAt).toISOString(),
    questionCode: snapshot.questionCode,
    topic: snapshot.topic,
    text: snapshot.text,
    type: snapshot.type,
    ...(snapshot.type === "MULTIPLE_CHOICE_MULTIPLE" ? {requiredSelectionCount:snapshot.options.filter(o=>o.isCorrect).length} : {}),
    difficulty: snapshot.difficulty,
    options: snapshot.options.map(({ optionKey, text }) => ({ optionKey, text })),
  };
}
export async function nexusStartSession(
  input: unknown,
  userId: string,
  authSession: string,
  db: Db = defaultDb,
) {
  const p = parseNexusStart(input);
  if (!authSession) fail(401, "UNAUTHENTICATED", "A verified sign-in session is required.");
  const persistent = await nexusInstalled(db);
  const config = {
    mode: p.mode,
    count: p.count,
    domainId: p.domainId ?? null,
    topicId: p.topicId ?? null,
    difficulty: p.difficulty ?? null,
  };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    if (persistent) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + p.requestId},0))`,
      );
      const prior = (
        await tx.execute<any>(
          sql`SELECT id,config FROM public.learning_sessions WHERE user_id=${userId}::uuid AND request_id=${p.requestId}::uuid`,
        )
      ).rows[0];
      if (prior) {
        if (Object.keys(config).some((k) => prior.config[k] !== config[k as keyof typeof config]))
          fail(409, "REQUEST_CONFLICT", "Request ID was already used with different selections.");
        return nexusSession(prior.id, userId, authSession, tx as unknown as Db);
      }
    }
    const picked = (
      await tx.execute<{ id: string }>(
        sql`SELECT e.id FROM (${eligible(p, userId)}) e ORDER BY random() LIMIT ${p.count}`,
      )
    ).rows;
    if (picked.length !== p.count)
      fail(
        409,
        "AVAILABILITY_CHANGED",
        "Availability changed. Refresh the builder before starting.",
      );
    const locked = await tx
      .select({ question: questionsTable })
      .from(questionsTable)
      .innerJoin(topicsTable, eq(topicsTable.id, questionsTable.topicId))
      .where(
        and(
          inArray(
            questionsTable.id,
            picked.map((q) => q.id),
          ),
          eq(questionsTable.status, "ACTIVE"),
          eq(topicsTable.status, "ACTIVE"),
          p.difficulty ? eq(questionsTable.difficulty, p.difficulty) : undefined,
        ),
      )
      .orderBy(questionsTable.id)
      .for("share");
    const rows = locked.map((r) => r.question);
    if (rows.length !== p.count)
      fail(409, "AVAILABILITY_CHANGED", "Question availability changed before delivery.");
    const domains = (
      await tx.execute<any>(
        sql`SELECT d.* FROM (${domainBindings}) d WHERE d.question_id=ANY(${sql.param(picked.map((q) => q.id))}::uuid[])`,
      )
    ).rows;
    if (
      p.domainId &&
      picked.some((q) => !domains.some((d) => d.question_id === q.id && d.id === p.domainId))
    )
      fail(409, "AVAILABILITY_CHANGED", "Domain mappings changed before delivery.");
    const session = persistent
      ? (
          await tx.execute<any>(
            sql`INSERT INTO public.learning_sessions(user_id,auth_session_id,request_id,mode,config,question_count) VALUES(${userId}::uuid,${authSession},${p.requestId}::uuid,${p.mode},${JSON.stringify(config)}::jsonb,${p.count}) RETURNING id`,
          )
        ).rows[0]
      : null;
    const questions = [];
    for (const selected of picked) {
      const question = rows.find((q) => q.id === selected.id)!;
      const revision = await captureQuestionRevision(tx, question);
      const [delivery] = await tx
        .insert(practiceDeliveriesTable)
        .values({
          userId,
          sessionId: authSession,
          questionId: question.id,
          revisionId: revision.id,
        })
        .returning();
      const mapping = domains
        .filter((d) => d.question_id === question.id)
        .map(({ question_id, ...d }) => d);
      if (session)
        await tx.execute(
          sql`INSERT INTO public.learning_session_items(session_id,user_id,position,question_id,revision_id,delivery_id,domain_snapshot) VALUES(${session.id}::uuid,${userId}::uuid,${questions.length},${question.id}::uuid,${revision.id}::uuid,${delivery.id}::uuid,${JSON.stringify(mapping)}::jsonb)`,
        );
      questions.push({
        ...deliveryView(revision.snapshot, delivery),
        id: question.id,
        domains: mapping,
        selected: null,
        flagged: false,
        result: null,
      });
    }
    return {
      id: session?.id ?? null,
      mode: p.mode,
      status: "ACTIVE",
      persistence: persistent,
      canResume: persistent,
      questions,
    };
  });
}
async function ownedSession(id: string, userId: string, db: Db, lock = false) {
  if (!(await nexusInstalled(db)))
    fail(
      503,
      "MIGRATION_REQUIRED",
      "Persistent session tracking requires the approved additive migration.",
    );
  const s = (
    await db.execute<any>(
      sql`SELECT s.*,(SELECT count(*)::int FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id IS NULL) AS removed_count FROM public.learning_sessions s WHERE s.id=${id}::uuid AND s.user_id=${userId}::uuid ${lock ? sql`FOR UPDATE OF s` : sql``}`,
    )
  ).rows[0];
  if (!s) fail(404, "NOT_FOUND", "Practice session not found.");
  return s;
}
export async function nexusSession(
  id: string,
  userId: string,
  authSession: string,
  db: Db = defaultDb,
) {
  const s = await ownedSession(id, userId, db);
  const rows = (
    await db.execute<any>(
      sql`SELECT i.*,r.snapshot,d.expires_at,a.selected_option_key AS submitted,a.is_correct FROM public.learning_session_items i LEFT JOIN public.question_revisions r ON r.id=i.revision_id LEFT JOIN public.practice_deliveries d ON d.id=i.delivery_id LEFT JOIN public.practice_attempts a ON a.delivery_id=i.delivery_id AND a.user_id=${userId}::uuid WHERE i.session_id=${id}::uuid AND i.user_id=${userId}::uuid ORDER BY i.position`,
    )
  ).rows;
  const expired = rows.some((r) => r.question_id && new Date(r.expires_at).getTime() <= Date.now()),
    canResume = s.status === "ACTIVE" && !s.removed_count && !expired && s.auth_session_id === authSession;
  return {
    id: s.id,
    mode: s.mode,
    status: s.status === "ACTIVE" && s.removed_count ? "CONTENT_DELETED" : s.status === "ACTIVE" && expired ? "EXPIRED" : s.status,
    removedQuestions: rows.filter(r=>r.question_id===null).map(r=>({position:r.position,questionCode:r.deleted_question_code,deletedAt:r.deleted_at})),
    persistence: true,
    canResume,
    createdAt: s.created_at,
    completedAt: s.completed_at,
    questions: rows.filter(r=>r.question_id!==null).map((r) => ({
      ...deliveryView(r.snapshot, {
        id: r.delivery_id,
        revisionId: r.revision_id,
        expiresAt: r.expires_at,
      }),
      id: r.question_id,
      domains: r.domain_snapshot,
      selected: r.submitted ?? r.selected_option_key,
      flagged: r.flagged,
      result:
        r.submitted && (s.mode !== "PRACTICE" || s.status === "COMPLETED")
          ? { ...revisionFeedback(r.snapshot, r.submitted), isCorrect: r.is_correct }
          : null,
      submitted: !!r.submitted,
    })),
  };
}
export async function nexusSaveSelection(
  id: string,
  input: unknown,
  userId: string,
  authSession: string,
  db: Db = defaultDb,
) {
  const p = z
    .strictObject({
      questionId: z.uuid(),
      optionKey: z.string().trim().toUpperCase().min(1).max(128).nullable(),
      flagged: z.boolean(),
    })
    .safeParse(input);
  if (!p.success) fail(400, "VALIDATION_ERROR", "Invalid question selection.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    const s = await ownedSession(id, userId, tx as unknown as Db, true);
    if (s.removed_count) fail(409,"SESSION_CONTENT_DELETED","An Admin permanently removed a question from this session. Start a new run; unrelated history is retained.");
    if (s.status !== "ACTIVE" || s.auth_session_id !== authSession)
      fail(409, "SESSION_UNAVAILABLE", "This run cannot be resumed with this sign-in session.");
    const r = (
      await tx.execute<any>(
        sql`SELECT i.delivery_id,i.selected_option_key AS saved,r.snapshot,d.expires_at,a.id AS attempt,a.selected_option_key AS answer FROM public.learning_session_items i JOIN public.question_revisions r ON r.id=i.revision_id JOIN public.practice_deliveries d ON d.id=i.delivery_id LEFT JOIN public.practice_attempts a ON a.delivery_id=i.delivery_id WHERE i.session_id=${id}::uuid AND i.user_id=${userId}::uuid AND i.question_id=${p.data!.questionId}::uuid`,
      )
    ).rows[0];
    if (!r || new Date(r.expires_at).getTime() <= Date.now())
      fail(409, "DELIVERY_EXPIRED", "Load a fresh session.");
    const normalized=p.data!.optionKey===null ? null : normalizeSelection(r.snapshot,p.data!.optionKey,true);
    if (p.data!.optionKey!==null && !normalized) fail(400,"INVALID_OPTION","Select distinct options from this revision within its required answer count.");
    if (r.attempt && normalized !== r.answer)
      fail(409, "ALREADY_SUBMITTED", "Submitted answers are immutable.");
    await tx.execute(
      sql`UPDATE public.learning_session_items SET selected_option_key=${normalized},flagged=${p.data!.flagged} WHERE session_id=${id}::uuid AND user_id=${userId}::uuid AND question_id=${p.data!.questionId}::uuid`,
    );
    return { saved: true };
  });
}
export async function nexusFinish(
  id: string,
  userId: string,
  authSession: string,
  abandon = false,
  db: Db = defaultDb,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    const s = await ownedSession(id, userId, tx as unknown as Db, true);
    if (s.auth_session_id !== authSession)
      fail(409, "SESSION_CHANGED", "Sign-in session differs from the original run.");
    if (s.status === "COMPLETED") return nexusSession(id, userId, authSession, tx as unknown as Db);
    if (s.status !== "ACTIVE")
      fail(409, "SESSION_UNAVAILABLE", "This session is no longer active.");
    if (!abandon && s.removed_count) fail(409,"SESSION_CONTENT_DELETED","A selected question was permanently deleted. This session cannot be graded; start a new run.");
    if (!abandon) {
      await tx.execute(sql`SELECT set_config('ccna_nexus.finishing',${id},true)`);
      const rows = (
        await tx.execute<any>(
          sql`SELECT i.question_id,i.delivery_id,coalesce(a.selected_option_key,i.selected_option_key) AS selected_option_key FROM public.learning_session_items i LEFT JOIN public.practice_attempts a ON a.delivery_id=i.delivery_id AND a.user_id=i.user_id WHERE i.session_id=${id}::uuid AND i.user_id=${userId}::uuid ORDER BY i.position`,
        )
      ).rows;
      if (rows.length !== s.question_count)
        fail(409, "MEMBERSHIP_MISMATCH", "Session membership requires review.");
      for (const r of rows) {
        if (!r.selected_option_key)
          fail(
            400,
            "UNANSWERED",
            "Answer every question before finishing, or explicitly abandon the run.",
          );
        const graded = await submitPracticeAnswer(
          r.question_id,
          r.selected_option_key,
          userId,
          tx as unknown as Db,
          r.delivery_id,
          authSession,
        );
        if (!graded) fail(409, "DELIVERY_UNAVAILABLE", "Session delivery is unavailable.");
      }
    }
    await tx.execute(
      sql`UPDATE public.learning_sessions SET status=${abandon ? "ABANDONED" : "COMPLETED"},completed_at=clock_timestamp() WHERE id=${id}::uuid AND user_id=${userId}::uuid`,
    );
    return nexusSession(id, userId, authSession, tx as unknown as Db);
  });
}
export async function nexusLearnAnswer(
  id: string,
  questionId: string,
  userId: string,
  authSession: string,
  db: Db = defaultDb,
) {
  if (!z.uuid().safeParse(questionId).success)
    fail(400, "VALIDATION_ERROR", "Invalid question identifier.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    const s = await ownedSession(id, userId, tx as unknown as Db, true);
    if (s.mode === "PRACTICE")
      fail(409, "DEFERRED_GRADING", "Practice mode grades at Finish only.");
    if (s.removed_count) fail(409,"SESSION_CONTENT_DELETED","An Admin permanently removed a question from this session. Start a new run; unrelated history is retained.");
    if (s.status !== "ACTIVE" || s.auth_session_id !== authSession)
      fail(409, "SESSION_UNAVAILABLE", "This session cannot accept answers.");
    const r = (
      await tx.execute<any>(
        sql`SELECT delivery_id,selected_option_key FROM public.learning_session_items WHERE session_id=${id}::uuid AND user_id=${userId}::uuid AND question_id=${questionId}::uuid`,
      )
    ).rows[0];
    if (!r?.selected_option_key) fail(400, "UNANSWERED", "Choose an answer first.");
    return submitPracticeAnswer(
      questionId,
      r.selected_option_key,
      userId,
      tx as unknown as Db,
      r.delivery_id,
      authSession,
    );
  });
}
export async function nexusSessionHistory(userId: string, input: unknown, db: Pick<Db, "execute" | "transaction"> = defaultDb) {
  const p = z
    .strictObject({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      pageSize: z.coerce
        .number()
        .refine((n) => [5, 10, 25, 50].includes(n))
        .default(10),
      search: z.string().trim().max(180).default(""),
    })
    .safeParse(input);
  if (!p.success) fail(400, "VALIDATION_ERROR", "Invalid session history page.");
  if (!(await nexusInstalled(db)))
    return { items: [], total: 0, page: 1, totalPages: 1, persistence: false };
  const { page, pageSize, search } = p.data!;
  const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  return db.transaction(
    async (tx) => {
      const where = sql`s.user_id=${userId}::uuid ${search ? sql`AND (s.mode ILIKE ${pattern} ESCAPE ${"\\"} OR EXISTS(SELECT 1 FROM public.learning_session_items i JOIN public.question_revisions r ON r.id=i.revision_id WHERE i.session_id=s.id AND r.snapshot->'topic'->>'name' ILIKE ${pattern} ESCAPE ${"\\"}))` : sql``}`;
      const total = Number(
          (
            await tx.execute<any>(
              sql`SELECT count(*) AS n FROM public.learning_sessions s WHERE ${where}`,
            )
          ).rows[0].n,
        ),
        pages = Math.max(1, Math.ceil(total / pageSize)),
        effective = Math.min(page, pages);
      const items = (
        await tx.execute(
          sql`SELECT s.id,s.mode,s.status,to_json(s.created_at) AS "createdAt",to_json(s.completed_at) AS "completedAt",s.question_count AS "questionCount",(SELECT count(*)::int FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id IS NULL) AS "removedCount",(SELECT count(*) FROM public.learning_session_items i JOIN public.practice_attempts a ON a.delivery_id=i.delivery_id AND a.user_id=s.user_id WHERE i.session_id=s.id)::int AS answered,(SELECT count(*) FROM public.learning_session_items i JOIN public.practice_attempts a ON a.delivery_id=i.delivery_id AND a.user_id=s.user_id WHERE i.session_id=s.id AND a.is_correct)::int AS correct,(SELECT string_agg(DISTINCT r.snapshot->'topic'->>'name',', ') FROM public.learning_session_items i JOIN public.question_revisions r ON r.id=i.revision_id WHERE i.session_id=s.id) AS topics FROM public.learning_sessions s WHERE ${where} ORDER BY s.created_at DESC,s.id LIMIT ${pageSize} OFFSET ${(effective - 1) * pageSize}`,
        )
      ).rows;
      return { items, total, page: effective, totalPages: pages, persistence: true };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export const nexusFinalSubmission = z
  .strictObject({
    answers: z
      .array(
        z.strictObject({
          questionId: z.uuid(),
          deliveryId: z.uuid(),
          optionKey: z.string().trim().toUpperCase().min(1).max(128),
          flagged: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((p, ctx) => {
    for (const key of ["questionId", "deliveryId"] as const)
      if (new Set(p.answers.map((a) => a[key])).size !== p.answers.length)
        ctx.addIssue({ code: "custom", message: "Each question and delivery must be unique." });
  });
/** Atomic final grading for original, ungrouped deliveries. No invented run ID,
 * no new schema dependency, and no partial grades survive a failed batch. */
export async function nexusSubmitDeliveries(
  input: unknown,
  userId: string,
  authSession: string,
  db: Db = defaultDb,
) {
  const parsed = nexusFinalSubmission.safeParse(input);
  if (!parsed.success)
    fail(
      400,
      "VALIDATION_ERROR",
      "Provide 1–100 unique delivered questions with valid optionKey selections.",
    );
  if (!authSession) fail(401, "UNAUTHENTICATED", "A verified session is required.");
  const answers = parsed.data!.answers;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    // A global delivery order avoids deadlocks for concurrent/reordered retries.
    for (const a of [...answers].sort((a, b) => a.deliveryId.localeCompare(b.deliveryId)))
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${a.deliveryId}::text,0))`,
      );
    const persistent = await nexusInstalled(tx as unknown as Db);
    if (persistent) {
      const linked = (
        await tx.execute(
          sql`SELECT 1 FROM public.learning_session_items WHERE delivery_id=ANY(${sql.param(answers.map((a) => a.deliveryId))}::uuid[]) LIMIT 1`,
        )
      ).rows;
      if (linked.length)
        fail(
          409,
          "TRACKED_SESSION_REQUIRED",
          "Submit tracked deliveries through their owned session Finish action.",
        );
    }
    const output = [];
    for (const a of answers) {
      const row = (
        await tx.execute<any>(
          sql`SELECT d.id,d.revision_id,d.expires_at,r.snapshot FROM public.practice_deliveries d JOIN public.question_revisions r ON r.id=d.revision_id AND r.question_id=d.question_id WHERE d.id=${a.deliveryId}::uuid AND d.user_id=${userId}::uuid AND d.session_id=${authSession} AND d.question_id=${a.questionId}::uuid`,
        )
      ).rows[0];
      if (!row)
        fail(404, "NOT_FOUND", "A submitted delivery is unavailable for this learner and sign-in.");
      const result = await submitPracticeAnswer(
        a.questionId,
        a.optionKey,
        userId,
        tx as unknown as Db,
        a.deliveryId,
        authSession,
      );
      if (!result)
        fail(409, "DELIVERY_UNAVAILABLE", "A delivered question is no longer available.");
      output.push({
        ...deliveryView(row.snapshot, {
          id: row.id,
          revisionId: row.revision_id,
          expiresAt: row.expires_at,
        }),
        id: a.questionId,
        selected: a.optionKey,
        flagged: a.flagged,
        submitted: true,
        domains: [],
        result,
      });
    }
    return {
      id: null,
      persistence: false,
      canResume: false,
      mode: "PRACTICE",
      status: "COMPLETED",
      questions: output,
    };
  });
}
