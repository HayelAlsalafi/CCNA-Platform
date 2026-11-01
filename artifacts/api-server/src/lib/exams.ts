import { sql, and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db as defaultDb, questionsTable, topicsTable, type QuestionSnapshot } from "@workspace/db";
import {
  captureQuestionRevision,
  normalizeSelection,
  revisionFeedback,
  revisionReview,
} from "./question-revisions";
type Db = typeof defaultDb;
export class ExamError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new ExamError(status, code, message);
};
const ids = z
  .array(z.string().uuid())
  .max(48)
  .refine((a) => new Set(a).size === a.length)
  .default([]);
export const examFilters = z.strictObject({ domainIds: ids, chapterIds: ids });
export const examStartSchema = examFilters.extend({
  requestId: z.string().uuid(),
  questionCount: z.number().int().min(1).max(100),
  durationMinutes: z.number().int().min(5).max(180),
});
export const examSelectionSchema = z.strictObject({
  selectedOptionKeys: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(8)
        .transform((key) => key.toUpperCase()),
    )
    .max(10)
    .refine((a) => new Set(a).size === a.length),
  flagged: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success) fail(400, "VALIDATION_ERROR", "Invalid exam configuration or answer.");
  return p.data as T;
}
const param = (v: unknown) => sql.param(v);
export async function examsInstalled(database: Pick<Db, "execute"> = defaultDb) {
  return (
    (
      await database.execute<{ ready: boolean }>(
      sql`SELECT CASE WHEN to_regclass('public.exam_sessions') IS NOT NULL AND to_regclass('public.exam_session_items') IS NOT NULL THEN
        to_regprocedure('public.guard_exam_state()') IS NOT NULL
        AND has_table_privilege(current_user,'public.exam_sessions','SELECT') AND has_table_privilege(current_user,'public.exam_sessions','INSERT')
        AND has_table_privilege(current_user,'public.exam_session_items','SELECT') AND has_table_privilege(current_user,'public.exam_session_items','INSERT')
        AND has_column_privilege(current_user,'public.exam_sessions','status','UPDATE') AND has_column_privilege(current_user,'public.exam_sessions','finalized_at','UPDATE') AND has_column_privilege(current_user,'public.exam_sessions','result','UPDATE')
        AND has_column_privilege(current_user,'public.exam_session_items','selected_keys','UPDATE') AND has_column_privilege(current_user,'public.exam_session_items','flagged','UPDATE') AND has_column_privilege(current_user,'public.exam_session_items','answer_version','UPDATE') AND has_column_privilege(current_user,'public.exam_session_items','graded_result','UPDATE')
        ELSE false END AS ready`,
      )
    ).rows[0]?.ready === true
  );
}
async function ready(database: Db) {
  if (!(await examsInstalled(database)))
    fail(
      503,
      "FEATURE_NOT_READY",
      "Exam migration 0012 and reviewed runtime permissions are required.",
    );
}
export function examEligibility(p: z.infer<typeof examFilters>) {
  return sql`SELECT q.id,c.id AS chapter_id,c.domain_id FROM public.questions q JOIN public.topics t ON t.id=q.topic_id JOIN public.curriculum_chapters c ON c.id=t.id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE q.status='ACTIVE' AND t.status='ACTIVE' AND b.status='ACTIVE' AND q.type::text IN ('MULTIPLE_CHOICE_SINGLE','MULTIPLE_CHOICE_MULTIPLE') AND (SELECT count(*) FROM public.question_options o WHERE o.question_id=q.id) BETWEEN 2 AND 10 AND ((q.type::text='MULTIPLE_CHOICE_SINGLE' AND (SELECT count(*) FROM public.question_options o WHERE o.question_id=q.id AND o.is_correct)=1) OR (q.type::text='MULTIPLE_CHOICE_MULTIPLE' AND (SELECT count(*) FROM public.question_options o WHERE o.question_id=q.id AND o.is_correct)>=2)) AND (${p.domainIds.length === 0} OR c.domain_id=ANY(${param(p.domainIds)}::uuid[])) AND (${p.chapterIds.length === 0} OR c.id=ANY(${param(p.chapterIds)}::uuid[]))`;
}
export async function examAvailability(input: unknown, database: Db = defaultDb) {
  const p = parse(examFilters, input);
  const rows = (
    await database.execute<any>(
      sql`WITH eligible AS (${examEligibility(p)}) SELECT c.id,c.code,t.name AS title,c.volume,c.chapter_number AS "chapterNumber",d.id AS "domainId",d.code AS "domainCode",d.name AS "domainName",d.weight_percent AS weight,count(e.id)::int AS available FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id LEFT JOIN eligible e ON e.chapter_id=c.id GROUP BY c.id,t.name,d.id ORDER BY c.domain_code,c.volume,c.chapter_number`,
    )
  ).rows;
  return {
    ready: await examsInstalled(database),
    available: rows.reduce((n, r) => n + r.available, 0),
    chapters: rows,
    limits: { maxQuestions: 100, minMinutes: 5, maxMinutes: 180 },
    gradingPolicy: "equal-weight-complete-set-v1",
  };
}
async function bound(tx: any) {
  await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
  await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
}
async function owned(tx: any, id: string, user: string, lock = false) {
  const s = (
    await tx.execute(
      sql`SELECT *,clock_timestamp() AS server_now,clock_timestamp()>=deadline_at AS expired FROM public.exam_sessions WHERE id=${id}::uuid AND user_id=${user}::uuid ${lock ? sql`FOR UPDATE` : sql``}`,
    )
  ).rows[0];
  if (!s) fail(404, "NOT_FOUND", "Exam not found.");
  if (lock)
    Object.assign(
      s,
      (
        await tx.execute(
          sql`SELECT clock_timestamp() AS server_now,clock_timestamp()>=deadline_at AS expired FROM public.exam_sessions WHERE id=${id}::uuid`,
        )
      ).rows[0],
    );
  return s;
}
export function examQuestionDTO(row: any, terminal: boolean) {
  if (!row.question_id)
    return {
      deliveryId: row.delivery_id,
      position: row.position,
      removed: true,
      questionCode: row.deleted_question_code,
    };
  const s = row.snapshot as QuestionSnapshot;
  const data = {
    deliveryId: row.delivery_id,
    position: row.position,
    questionId: row.question_id,
    revisionId: row.revision_id,
    questionCode: s.questionCode,
    text: s.text,
    type: s.type,
    difficulty: s.difficulty,
    options: s.options.map(({ optionKey, text }) => ({ optionKey, text })),
    requiredSelectionCount: s.options.filter((o) => o.isCorrect).length,
    mapping: row.mapping_snapshot,
    selectedOptionKeys: row.selected_keys,
    flagged: row.flagged,
    answerVersion: row.answer_version,
    removed: false,
  };
  return terminal ? { ...data, result: row.graded_result, review: revisionReview(s) } : data;
}
export async function examSession(id: string, user: string, database: Db = defaultDb) {
  await ready(database);
  return database.transaction(async (tx) => {
    const s = await owned(tx, id, user);
    const rows = (
      await tx.execute<any>(
        sql`SELECT i.*,r.snapshot FROM public.exam_session_items i LEFT JOIN public.question_revisions r ON r.id=i.revision_id WHERE i.session_id=${id}::uuid AND i.user_id=${user}::uuid ORDER BY i.position`,
      )
    ).rows;
    const terminal = s.status !== "ACTIVE";
    return {
      id: s.id,
      status: s.status,
      config: s.config,
      startedAt: s.started_at,
      deadlineAt: s.deadline_at,
      serverNow: s.server_now,
      finalizedAt: s.finalized_at,
      needsFinalization: !terminal && s.expired,
      contentRemoved: rows.some((r) => !r.question_id),
      questionCount: s.question_count,
      result: terminal ? s.result : null,
      questions: rows.map((r) => examQuestionDTO(r, terminal)),
    };
  });
}
export async function examStart(
  input: unknown,
  user: string,
  authSession: string,
  database: Db = defaultDb,
) {
  const p = parse(examStartSchema, input);
  await ready(database);
  const config = {
    questionCount: p.questionCount,
    durationMinutes: p.durationMinutes,
    domainIds: [...p.domainIds].sort(),
    chapterIds: [...p.chapterIds].sort(),
    gradingPolicy: "equal-weight-complete-set-v1",
  };
  const id = await database.transaction(async (tx) => {
    await bound(tx);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${user + ":exam:" + p.requestId},0))`,
    );
    const prior = (
      await tx.execute<any>(
        sql`SELECT id,config FROM public.exam_sessions WHERE user_id=${user}::uuid AND request_id=${p.requestId}::uuid`,
      )
    ).rows[0];
    if (prior) {
      if (JSON.stringify(prior.config) !== JSON.stringify(JSON.parse(JSON.stringify(config)))) {
        // jsonb key ordering is canonical in PostgreSQL, not JavaScript.
        const same = (
          await tx.execute<any>(
            sql`SELECT ${JSON.stringify(config)}::jsonb=${JSON.stringify(prior.config)}::jsonb AS same`,
          )
        ).rows[0]?.same;
        if (!same)
          fail(409, "REQUEST_CONFLICT", "Request ID was used with different exam settings.");
      }
      return prior.id;
    }
    if (p.chapterIds.length && p.domainIds.length) {
      const matched = (
        await tx.execute<any>(
          sql`SELECT count(*)::int AS n FROM public.curriculum_chapters WHERE id=ANY(${param(p.chapterIds)}::uuid[]) AND domain_id=ANY(${param(p.domainIds)}::uuid[])`,
        )
      ).rows[0]?.n;
      if (matched !== p.chapterIds.length)
        fail(400, "VALIDATION_ERROR", "Selected chapters must belong to the selected domains.");
    }
    const picked = (
      await tx.execute<{ id: string }>(
        sql`SELECT id FROM (${examEligibility(p)}) e ORDER BY random() LIMIT ${p.questionCount}`,
      )
    ).rows;
    if (picked.length !== p.questionCount)
      fail(
        409,
        "AVAILABILITY_CHANGED",
        "Not enough eligible published questions. Refresh availability.",
      );
    const questions = await tx
      .select({ q: questionsTable })
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
        ),
      )
      .orderBy(questionsTable.id)
      .for("share");
    if (questions.length !== p.questionCount)
      fail(409, "AVAILABILITY_CHANGED", "Question availability changed.");
    const rechecked = (
      await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM (${examEligibility(p)}) eligible WHERE id=ANY(${param(picked.map((q) => q.id))}::uuid[])`,
      )
    ).rows[0]?.n;
    if (rechecked !== p.questionCount)
      fail(409, "AVAILABILITY_CHANGED", "Question filters or publication changed before delivery.");
    const s = (
      await tx.execute<any>(
        sql`INSERT INTO public.exam_sessions(user_id,request_id,auth_session_id,config,question_count,started_at,deadline_at) SELECT ${user}::uuid,${p.requestId}::uuid,${authSession},${JSON.stringify(config)}::jsonb,${p.questionCount},t,t+${p.durationMinutes}*interval '1 minute' FROM (SELECT clock_timestamp() AS t) clock RETURNING id`,
      )
    ).rows[0];
    const revisions = new Map<string, any>();
    for (const { q } of questions) revisions.set(q.id, await captureQuestionRevision(tx as any, q));
    const mappings = (
      await tx.execute<any>(
        sql`SELECT c.id,jsonb_build_object('chapter',jsonb_build_object('id',c.id,'code',c.code,'title',t.name,'volume',c.volume,'chapterNumber',c.chapter_number),'domain',jsonb_build_object('id',d.id,'code',d.code,'name',d.name)) AS mapping FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id WHERE c.id=ANY(${param(questions.map(({ q }) => q.topicId))}::uuid[]) FOR SHARE OF c,t,d`,
      )
    ).rows;
    for (const [position, q] of picked.entries()) {
      const revision = revisions.get(q.id);
      const mapping = mappings.find((m) => m.id === revision.snapshot.topic.id)?.mapping;
      if (!mapping) fail(409, "AVAILABILITY_CHANGED", "Chapter mapping changed.");
      await tx.execute(
        sql`INSERT INTO public.exam_session_items(session_id,user_id,position,question_id,revision_id,mapping_snapshot) VALUES(${s.id}::uuid,${user}::uuid,${position},${q.id}::uuid,${revision.id}::uuid,${JSON.stringify(mapping)}::jsonb)`,
      );
    }
    return s.id;
  });
  return examSession(id, user, database);
}
export async function examSave(
  id: string,
  delivery: string,
  input: unknown,
  user: string,
  database: Db = defaultDb,
) {
  const p = parse(examSelectionSchema, input);
  await ready(database);
  await database.transaction(async (tx) => {
    await bound(tx);
    const s = await owned(tx, id, user, true);
    if (s.status !== "ACTIVE" || s.expired)
      fail(409, "EXAM_CLOSED", "The exam is closed. Finalize or refresh your result.");
    const row = (
      await tx.execute<any>(
        sql`SELECT i.*,r.snapshot FROM public.exam_session_items i LEFT JOIN public.question_revisions r ON r.id=i.revision_id WHERE i.session_id=${id}::uuid AND i.delivery_id=${delivery}::uuid AND i.user_id=${user}::uuid`,
      )
    ).rows[0];
    if (!row) fail(404, "NOT_FOUND", "Exam delivery not found.");
    if (!row.question_id)
      fail(409, "CONTENT_REMOVED", "Question was removed through the controlled Admin workflow.");
    if (row.answer_version !== p.expectedVersion)
      fail(409, "VERSION_CONFLICT", "Another tab changed this answer. Refresh before continuing.");
    if (
      p.selectedOptionKeys.length &&
      !normalizeSelection(row.snapshot, p.selectedOptionKeys, true)
    )
      fail(
        400,
        "VALIDATION_ERROR",
        "Choose only available options within the required selection count.",
      );
    await tx.execute(
      sql`UPDATE public.exam_session_items SET selected_keys=${JSON.stringify([...p.selectedOptionKeys].sort())}::jsonb,flagged=${p.flagged},answer_version=answer_version+1 WHERE delivery_id=${delivery}::uuid`,
    );
  });
  return examSession(id, user, database);
}
export function gradeExamRows(rows: any[]) {
  const totals = { total: rows.length, correct: 0, incorrect: 0, unanswered: 0 };
  const domains = new Map<string, any>(),
    chapters = new Map<string, any>();
  const grades = rows.map((r) => {
    const keys = r.selected_keys as string[];
    const feedback = keys.length ? revisionFeedback(r.snapshot, keys) : null;
    const outcome = !keys.length ? "UNANSWERED" : feedback?.isCorrect ? "CORRECT" : "INCORRECT";
    if (outcome === "CORRECT") totals.correct++;
    else if (outcome === "UNANSWERED") totals.unanswered++;
    else totals.incorrect++;
    for (const [map, data] of [
      [domains, r.mapping_snapshot.domain],
      [chapters, r.mapping_snapshot.chapter],
    ] as const) {
      let group = map.get(data.id);
      if (!group) {
        group = { ...data, total: 0, correct: 0, incorrect: 0, unanswered: 0 };
        map.set(data.id, group);
      }
      group.total++;
      group[
        outcome === "CORRECT" ? "correct" : outcome === "UNANSWERED" ? "unanswered" : "incorrect"
      ]++;
    }
    return { deliveryId: r.delivery_id, outcome, isCorrect: outcome === "CORRECT" };
  });
  return {
    ...totals,
    percentage: totals.total ? (100 * totals.correct) / totals.total : 0,
    domains: [...domains.values()],
    chapters: [...chapters.values()],
    grades,
    gradingPolicy: "equal-weight-complete-set-v1",
  };
}
export async function examSubmit(id: string, user: string, database: Db = defaultDb) {
  await ready(database);
  await database.transaction(async (tx) => {
    await bound(tx);
    const s = await owned(tx, id, user, true);
    if (s.status !== "ACTIVE") return;
    const rows = (
      await tx.execute<any>(
        sql`SELECT i.*,r.snapshot FROM public.exam_session_items i LEFT JOIN public.question_revisions r ON r.id=i.revision_id WHERE i.session_id=${id}::uuid AND i.user_id=${user}::uuid ORDER BY i.position`,
      )
    ).rows;
    if (rows.length !== s.question_count || rows.some((r) => !r.question_id))
      fail(
        409,
        "CONTENT_REMOVED",
        "Exam content was removed. Start another exam; no score is assumed.",
      );
    const { grades, ...score } = gradeExamRows(rows);
    await tx.execute(sql`SELECT set_config('ccna_exam.finalizing',${id},true)`);
    for (const grade of grades)
      await tx.execute(
        sql`UPDATE public.exam_session_items SET graded_result=${JSON.stringify(grade)}::jsonb WHERE delivery_id=${grade.deliveryId}::uuid`,
      );
    // Deadline authority is the server clock observed after acquiring the lock.
    const finished = s.expired ? s.deadline_at : s.server_now;
    const result = {
      ...score,
      completionSeconds: Math.max(
        0,
        Math.round((new Date(finished).getTime() - new Date(s.started_at).getTime()) / 1000),
      ),
    };
    await tx.execute(
      sql`UPDATE public.exam_sessions SET status=${s.expired ? "EXPIRED" : "SUBMITTED"},finalized_at=${finished}::timestamptz,result=${JSON.stringify(result)}::jsonb WHERE id=${id}::uuid`,
    );
    await tx.execute(sql`SELECT set_config('ccna_exam.finalizing','',true)`);
  });
  return examSession(id, user, database);
}
export async function examHistory(input: unknown, user: string, database: Db = defaultDb) {
  await ready(database);
  const p = parse(
    z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1) }),
    input,
  );
  const count =
    (
      await database.execute<any>(
        sql`SELECT count(*)::int AS total FROM public.exam_sessions WHERE user_id=${user}::uuid`,
      )
    ).rows[0]?.total ?? 0;
  const rows = (
    await database.execute<any>(
      sql`SELECT id,status,started_at AS "startedAt",deadline_at AS "deadlineAt",finalized_at AS "finalizedAt",question_count AS "questionCount",result,EXISTS(SELECT 1 FROM public.exam_session_items i WHERE i.session_id=s.id AND i.question_id IS NULL) AS "contentRemoved" FROM public.exam_sessions s WHERE user_id=${user}::uuid ORDER BY started_at DESC,id DESC LIMIT 10 OFFSET ${(p.page - 1) * 10}`,
    )
  ).rows;
  return {
    items: rows,
    total: count,
    page: p.page,
    totalPages: Math.max(1, Math.ceil(count / 10)),
  };
}
