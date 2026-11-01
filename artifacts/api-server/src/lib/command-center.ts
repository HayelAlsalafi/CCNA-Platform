import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db as defaultDb } from "@workspace/db";
import { examsInstalled } from "./exams";

export const commandCenterQuery = z.strictObject({
  range: z.enum(["7", "30", "90", "all"]).default("30"),
  timezone: z.string().min(1).max(100).default("UTC"),
});
export function parseCommandCenterQuery(input: unknown) {
  const value = commandCenterQuery.parse(input);
  // Resolve aliases and reject invalid IANA names before constructing SQL.
  return {
    ...value,
    timezone: new Intl.DateTimeFormat("en", { timeZone: value.timezone }).resolvedOptions()
      .timeZone,
  };
}
const count = z.number().int().nonnegative();
const domainSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  weightPercent: count.max(100),
  attempts: count,
  correct: count,
  uniqueQuestions: count,
});
export function domainEvidence(input: z.infer<typeof domainSchema>) {
  const d = domainSchema.parse(input);
  if (d.correct > d.attempts || d.uniqueQuestions > d.attempts)
    throw new Error("Invalid domain aggregate.");
  const ratio = d.attempts ? d.correct / d.attempts : null;
  return {
    ...d,
    accuracy: ratio === null ? null : Math.round(ratio * 100),
    status:
      d.attempts < 10 || d.uniqueQuestions < 3
        ? ("INSUFFICIENT" as const)
        : ratio! >= 0.8
          ? ("STRONG" as const)
          : ratio! < 0.7
            ? ("REVIEW" as const)
            : ("DEVELOPING" as const),
  };
}
const latestExamSchema = z.object({
  id: z.uuid(),
  status: z.enum(["SUBMITTED", "EXPIRED"]),
  finalizedAt: z.string(),
  questionCount: count,
  percentage: z.number().min(0).max(100).nullable(),
});
const aggregateSchema = z.object({
  coverage: z
    .object({
      availableQuestions: count,
      practicedQuestions: count,
      availableChapters: count,
      practicedChapters: count,
    })
    .refine(
      (c) =>
        c.practicedQuestions <= c.availableQuestions && c.practicedChapters <= c.availableChapters,
    ),
  domains: z.array(domainSchema).max(6),
});
const timelineRow = z.object({
  day: z.string(),
  attempts: count,
  correct: count,
  incorrect: count,
  completedSessions: count,
  completedExams: count,
});
const timelineSchema = z.object({ rows: z.array(timelineRow).max(120), truncated: z.boolean() });

/** Read-only, bounded dashboard projection. Practice and exams remain separate cohorts. */
export async function commandCenterProjection(
  userId: string,
  query: ReturnType<typeof parseCommandCenterQuery>,
  sessionsInstalled: boolean,
  db: Pick<typeof defaultDb, "execute"> = defaultDb,
) {
  const timezoneExists = (
    await db.execute(
      sql`SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=${query.timezone}) AS supported`,
    )
  ).rows[0];
  if (timezoneExists?.supported !== true)
    throw new Error("Validated learner timezone unavailable on server.");
  const aggregate = aggregateSchema.parse(
    (
      await db.execute(sql`
    WITH a AS (SELECT question_id,topic_id,is_correct FROM public.practice_attempts WHERE user_id=${userId}::uuid),
    chapters AS (SELECT c.id,c.domain_id FROM public.curriculum_chapters c JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'),
    available AS (SELECT q.id,q.topic_id FROM public.questions q JOIN public.topics t ON t.id=q.topic_id WHERE q.status='ACTIVE' AND t.status='ACTIVE'),
    domain_metrics AS (SELECT c.domain_id,count(*)::int AS attempts,count(*) FILTER(WHERE a.is_correct)::int AS correct,count(DISTINCT a.question_id)::int AS unique_questions FROM a JOIN chapters c ON c.id=a.topic_id GROUP BY c.domain_id)
    SELECT jsonb_build_object('availableQuestions',(SELECT count(*) FROM available),'practicedQuestions',(SELECT count(*) FROM available q WHERE EXISTS(SELECT 1 FROM a WHERE a.question_id=q.id)),'availableChapters',(SELECT count(DISTINCT q.topic_id) FROM available q JOIN chapters c ON c.id=q.topic_id),'practicedChapters',(SELECT count(DISTINCT q.topic_id) FROM available q JOIN chapters c ON c.id=q.topic_id WHERE EXISTS(SELECT 1 FROM a WHERE a.question_id=q.id AND a.topic_id=q.topic_id))) AS coverage,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'name',d.name,'weightPercent',d.weight_percent,'attempts',coalesce(m.attempts,0),'correct',coalesce(m.correct,0),'uniqueQuestions',coalesce(m.unique_questions,0)) ORDER BY d.code) FROM public.exam_domains d JOIN public.exam_blueprints b ON b.id=d.blueprint_id LEFT JOIN domain_metrics m ON m.domain_id=d.id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'),'[]'::jsonb) AS domains
  `)
    ).rows[0],
  );
  const examReady = await examsInstalled(db);
  let exams: {
    available: boolean;
    completed: number;
    latest: z.infer<typeof latestExamSchema> | null;
  } = { available: examReady, completed: 0, latest: null };
  if (examReady) {
    const exam = z.object({ completed: count, latest: latestExamSchema.nullable() }).parse(
      (
        await db.execute(sql`
      WITH terminal AS (SELECT id,status,finalized_at,question_count,result FROM public.exam_sessions WHERE user_id=${userId}::uuid AND status IN ('SUBMITTED','EXPIRED'))
      SELECT (SELECT count(*)::int FROM terminal) AS completed,(SELECT jsonb_build_object('id',id,'status',status,'finalizedAt',finalized_at,'questionCount',question_count,'percentage',result->'percentage') FROM terminal ORDER BY finalized_at DESC,id DESC LIMIT 1) AS latest
    `)
      ).rows[0],
    );
    exams = { available: true, ...exam };
  }
  const monthly = query.range === "all";
  const step = monthly ? "month" : "day";
  const buckets = monthly ? 120 : Number(query.range);
  const events = sql`SELECT submitted_at AS occurred_at,1 AS attempts,CASE WHEN is_correct THEN 1 ELSE 0 END AS correct,0 AS completed_sessions,0 AS completed_exams FROM public.practice_attempts WHERE user_id=${userId}::uuid
    ${sessionsInstalled ? sql`UNION ALL SELECT completed_at,0,0,1,0 FROM public.learning_sessions WHERE user_id=${userId}::uuid AND status='COMPLETED'` : sql``}
    ${examReady ? sql`UNION ALL SELECT finalized_at,0,0,0,1 FROM public.exam_sessions WHERE user_id=${userId}::uuid AND status IN ('SUBMITTED','EXPIRED')` : sql``}`;
  const timeline = timelineSchema.parse(
    (
      await db.execute(sql`
    WITH bounds AS (SELECT date_trunc(${step},clock_timestamp() AT TIME ZONE ${query.timezone}) AS finish),
    bucket_window AS (SELECT finish,finish-(${buckets}-1)*${monthly ? "1 month" : "1 day"}::interval AS start FROM bounds),
    events AS (${events}),
    counts AS (SELECT date_trunc(${step},occurred_at AT TIME ZONE ${query.timezone}) AS day,sum(attempts)::int AS attempts,sum(correct)::int AS correct,sum(completed_sessions)::int AS completed_sessions,sum(completed_exams)::int AS completed_exams FROM events,bucket_window w WHERE occurred_at>=w.start AT TIME ZONE ${query.timezone} AND occurred_at<(w.finish+${monthly ? "1 month" : "1 day"}::interval) AT TIME ZONE ${query.timezone} GROUP BY day),
    days AS (SELECT generate_series(start,finish,${monthly ? "1 month" : "1 day"}::interval) AS day FROM bucket_window)
    SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('day',to_char(d.day,'YYYY-MM-DD'),'attempts',coalesce(c.attempts,0),'correct',coalesce(c.correct,0),'incorrect',coalesce(c.attempts-c.correct,0),'completedSessions',coalesce(c.completed_sessions,0),'completedExams',coalesce(c.completed_exams,0)) ORDER BY d.day) FROM days d LEFT JOIN counts c ON c.day=d.day),'[]'::jsonb) AS rows,
      ${monthly ? sql`EXISTS(SELECT 1 FROM events,bucket_window w WHERE occurred_at<w.start AT TIME ZONE ${query.timezone})` : sql`false`} AS truncated
  `)
    ).rows[0],
  );
  for (const row of timeline.rows) {
    if (row.correct + row.incorrect !== row.attempts)
      throw new Error("Invalid timeline aggregate.");
  }
  return {
    timeline: timeline.rows,
    commandCenter: {
      timezone: query.timezone,
      cohort: "ALL_COMMITTED_PRACTICE" as const,
      coverage: aggregate.coverage,
      domains: aggregate.domains.map(domainEvidence),
      exams,
      timeline: { truncated: timeline.truncated, maximumBuckets: buckets },
    },
  };
}
