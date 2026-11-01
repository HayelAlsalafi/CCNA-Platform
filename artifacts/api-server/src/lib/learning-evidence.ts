import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db as defaultDb } from "@workspace/db";
type Db = typeof defaultDb;
export class LearningEvidenceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function calendarInput(input: unknown) {
  const p = z
    .strictObject({
      year: z.coerce
        .number()
        .int()
        .min(1970)
        .max(new Date().getUTCFullYear() + 1),
      timezone: z.string().min(1).max(100),
    })
    .safeParse(input);
  if (!p.success)
    throw new LearningEvidenceError(
      400,
      "VALIDATION_ERROR",
      "Choose a valid year and IANA timezone.",
    );
  let timezone: string;
  try {
    timezone = new Intl.DateTimeFormat("en", { timeZone: p.data.timezone }).resolvedOptions()
      .timeZone;
  } catch {
    throw new LearningEvidenceError(400, "INVALID_TIMEZONE", "Choose a valid IANA timezone.");
  }
  return { ...p.data, timezone };
}
function progressTimezone(input: unknown) {
  const p = z.strictObject({ timezone: z.string().min(1).max(100) }).safeParse(input);
  if (!p.success)
    throw new LearningEvidenceError(
      400,
      "VALIDATION_ERROR",
      "Provide only a valid learner timezone.",
    );
  return calendarInput({ year: new Date().getUTCFullYear(), timezone: p.data.timezone }).timezone;
}
export type ActivityDay = { date: string; answers: number; sessions: number; total: number };
export const activityIntensity = (total: number) =>
  total === 0 ? 0 : total < 5 ? 1 : total < 10 ? 2 : total < 20 ? 3 : 4;
export function longestStreak(days: readonly { date: string; total: number }[]) {
  let best = 0,
    run = 0,
    previous = -Infinity;
  for (const day of [...days]
    .filter((d) => d.total > 0)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const ordinal = Date.parse(day.date + "T00:00:00Z") / 86400000;
    if (ordinal === previous) continue;
    run = ordinal === previous + 1 ? run + 1 : 1;
    previous = ordinal;
    best = Math.max(best, run);
  }
  return best;
}
export async function learningCapabilities(db: Db = defaultDb) {
  const row = (
    await db.execute<any>(
      sql`SELECT to_regclass('public.learning_sessions') IS NOT NULL AS sessions,to_regclass('public.learning_session_items') IS NOT NULL AS items,to_regclass('public.achievement_definitions') IS NOT NULL AS definitions,to_regclass('public.learner_achievements') IS NOT NULL AS awards`,
    )
  ).rows[0];
  if (
    !row ||
    row.sessions !== row.items ||
    row.definitions !== row.awards ||
    (row.awards && !row.sessions)
  )
    throw new LearningEvidenceError(
      503,
      "SCHEMA_INCOMPLETE",
      "The learning schema requires guarded upgrade verification.",
    );
  return { sessions: row.sessions as boolean, achievements: row.awards as boolean };
}
async function verifiedTimezone(timezone: string, db: Db) {
  const match = (
    await db.execute(sql`SELECT 1 FROM pg_timezone_names WHERE name=${timezone} LIMIT 1`)
  ).rows;
  if (!match.length)
    throw new LearningEvidenceError(
      400,
      "INVALID_TIMEZONE",
      "This timezone is unavailable on the server.",
    );
}
/** Extensible event projection. Future lesson/lab adapters must supply real,
 * server-validated completions. No page-visit or speculative event table. */
export function learningEvents(userId: string, sessions: boolean, verifiedOnly = false) {
  return sql`SELECT submitted_at AS occurred_at,'ANSWER_SUBMITTED'::text AS type FROM public.practice_attempts WHERE user_id=${userId}::uuid ${verifiedOnly ? sql`AND revision_id IS NOT NULL AND delivery_id IS NOT NULL` : sql``} ${sessions ? sql`UNION ALL SELECT completed_at AS occurred_at,'PRACTICE_COMPLETED'::text AS type FROM public.learning_sessions WHERE user_id=${userId}::uuid AND status='COMPLETED'` : sql``}`;
}
export async function yearlyActivity(input: unknown, userId: string, db: Db = defaultDb) {
  const { year, timezone } = calendarInput(input),
    capabilities = await learningCapabilities(db);
  await verifiedTimezone(timezone, db);
  const rows = (
    await db.execute<any>(
      sql`WITH bounds AS (SELECT make_date(${year},1,1)::timestamp AT TIME ZONE ${timezone} AS start_at,make_date(${year + 1},1,1)::timestamp AT TIME ZONE ${timezone} AS end_at),events AS (${learningEvents(userId, capabilities.sessions)}),counts AS (SELECT (occurred_at AT TIME ZONE ${timezone})::date AS day,count(*) FILTER(WHERE type='ANSWER_SUBMITTED')::int AS answers,count(*) FILTER(WHERE type='PRACTICE_COMPLETED')::int AS sessions FROM events,bounds WHERE occurred_at>=start_at AND occurred_at<end_at GROUP BY day),days AS (SELECT generate_series(make_date(${year},1,1)::timestamp,make_date(${year},12,31)::timestamp,interval '1 day')::date AS day) SELECT to_char(days.day,'YYYY-MM-DD') AS date,coalesce(c.answers,0)::int AS answers,coalesce(c.sessions,0)::int AS sessions FROM days LEFT JOIN counts c USING(day) ORDER BY days.day`,
    )
  ).rows;
  const days: ActivityDay[] = rows.map((r) => ({ ...r, total: r.answers + r.sessions }));
  return {
    year,
    timezone,
    days: days.map((d) => ({ ...d, level: activityIntensity(d.total) })),
    totals: {
      answers: days.reduce((n, d) => n + d.answers, 0),
      sessions: days.reduce((n, d) => n + d.sessions, 0),
      activeDays: days.filter((d) => d.total > 0).length,
      longestStreak: longestStreak(days),
    },
    supportedEvents: {
      ANSWER_SUBMITTED: true,
      PRACTICE_COMPLETED: capabilities.sessions,
      LESSON_COMPLETED: false,
      LAB_COMPLETED: false,
    },
  };
}
export type SkillDomain = {
  id: string;
  code: string;
  name: string;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
};
export type SkillFrameworkDefinition = {
  id: string;
  name: string;
  version: number;
  minimumAnswers: number;
  minimumUnique: number;
  sampleTarget: number;
  axes: readonly string[];
  evidenceAdapter: string;
  scoringRule: string;
  mapping?: Readonly<Record<string, unknown>>;
  scoreLabel: string;
};
export const skillFramework = {
  id: "ccna-practice-evidence.v1",
  name: "CCNA practice evidence",
  version: 1,
  minimumAnswers: 10,
  minimumUnique: 3,
  sampleTarget: 20,
  evidenceAdapter: "ccna-objective-map.v1",
  scoringRule: "question-evidence.v1",
  axes: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"],
  mapping: { examCode: "200-301", blueprintVersion: "1.1" },
  scoreLabel: "Practice evidence index",
} as const;
export const skillFrameworks: Readonly<Record<string, SkillFrameworkDefinition>> = {
  [skillFramework.id]: skillFramework,
};
export function skillScore(
  d: SkillDomain,
  framework: Pick<
    SkillFrameworkDefinition,
    "minimumAnswers" | "minimumUnique" | "sampleTarget"
  > = skillFramework,
) {
  const accuracy = d.attempts ? d.correct / d.attempts : null,
    coverage = d.available ? Math.min(1, d.attempted / d.available) : null,
    sufficient =
      d.attempts >= framework.minimumAnswers &&
      d.attempted >= framework.minimumUnique &&
      coverage !== null;
  return {
    ...d,
    accuracy: accuracy === null ? null : Math.round(accuracy * 100),
    coverage: coverage === null ? null : Math.round(coverage * 100),
    score: sufficient
      ? Math.round(100 * accuracy! * coverage! * Math.min(1, d.attempts / framework.sampleTarget))
      : null,
    status: sufficient ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE",
  };
}
// Framework configuration is separate from official taxonomy; future frameworks
// register their own evidence adapters and criteria rather than editing domains.
export const achievementRules = [
  {
    id: "first-packet.v1",
    name: "First Packet",
    description: "Complete one reliably tracked practice session.",
    ruleKey: "completed-sessions",
    criteria: { sessions: 1 },
  },
  {
    id: "packet-explorer.v1",
    name: "Packet Explorer",
    description: "Submit answers to 50 distinct questions.",
    ruleKey: "distinct-questions",
    criteria: { unique: 50 },
  },
  {
    id: "consistency-builder.v1",
    name: "Consistency Builder",
    description: "Record learning on seven consecutive local calendar days.",
    ruleKey: "consecutive-days",
    criteria: { streak: 7 },
  },
  {
    id: "vlan-explorer.v1",
    name: "VLAN Explorer",
    description:
      "Answer at least five VLAN-objective questions across three distinct questions with 70% accuracy.",
    ruleKey: "vlan-evidence",
    criteria: { attempts: 5, unique: 3, accuracy: 70 },
  },
  {
    id: "precision-90.v1",
    name: "Precision 90",
    description: "Reach 90% accuracy across at least 30 answers and ten distinct questions.",
    ruleKey: "overall-accuracy",
    criteria: { attempts: 30, unique: 10, accuracy: 90 },
  },
  {
    id: "security-scout.v1",
    name: "Security Scout",
    description:
      "Record ten Security Fundamentals answers across five available questions with 70% accuracy.",
    ruleKey: "security-evidence",
    criteria: { attempts: 10, unique: 5, accuracy: 70 },
  },
  {
    id: "ccna-pathfinder.v1",
    name: "CCNA Pathfinder",
    description:
      "Answer at least five questions across three distinct available questions in each of all six CCNA domains.",
    ruleKey: "all-domains",
    criteria: { domains: 6, attemptsPerDomain: 5, uniquePerDomain: 3 },
  },
] as const;
export type AchievementEvidence = {
  attempts: number;
  correct: number;
  unique: number;
  sessions: number;
  streak: number;
  vlan: { attempts: number; correct: number; unique: number };
  domains: SkillDomain[];
};
export function evaluateRule(
  def: { ruleKey: string; criteria: unknown; ruleVersion?: number },
  e: AchievementEvidence,
) {
  const known = achievementRules.find((r) => r.ruleKey === def.ruleKey);
  if (
    !known ||
    (def.ruleVersion !== undefined && def.ruleVersion !== 1) ||
    JSON.stringify(Object.entries((def.criteria as object) || {}).sort()) !==
      JSON.stringify(Object.entries(known.criteria).sort())
  )
    return { supported: false, eligible: false, progress: 0, requirements: [] };
  const requirements: { label: string; current: number; target: number }[] = [];
  const add = (label: string, current: number, target: number) =>
    requirements.push({ label, current, target });
  switch (def.ruleKey) {
    case "completed-sessions":
      add("Completed tracked sessions", e.sessions, 1);
      break;
    case "distinct-questions":
      add("Distinct questions answered", e.unique, 50);
      break;
    case "consecutive-days":
      add("Longest consecutive local-day streak", e.streak, 7);
      break;
    case "overall-accuracy":
      add("Answers", e.attempts, 30);
      add("Distinct questions", e.unique, 10);
      add("Accuracy (%)", e.attempts ? (e.correct / e.attempts) * 100 : 0, 90);
      break;
    case "vlan-evidence":
      add("VLAN answers", e.vlan.attempts, 5);
      add("Distinct VLAN questions", e.vlan.unique, 3);
      add("VLAN accuracy (%)", e.vlan.attempts ? (e.vlan.correct / e.vlan.attempts) * 100 : 0, 70);
      break;
    case "security-evidence": {
      const d = e.domains.find((d) => d.code === "5.0");
      add("Security answers", d?.attempts || 0, 10);
      add("Distinct available Security questions", d?.attempted || 0, 5);
      add("Security accuracy (%)", d?.attempts ? (d.correct / d.attempts) * 100 : 0, 70);
      break;
    }
    case "all-domains":
      for (const code of skillFramework.axes) {
        const d = e.domains.find((d) => d.code === code);
        add("Domain " + code + " answers", d?.attempts || 0, 5);
        add("Domain " + code + " distinct available questions", d?.attempted || 0, 3);
      }
      break;
  }
  return {
    supported: true,
    eligible: requirements.every((r) => r.current >= r.target),
    progress: Math.floor(100 * Math.min(1, ...requirements.map((r) => r.current / r.target))),
    requirements,
  };
}
const bindings = sql`SELECT q.id AS question_id,d.id,d.code,d.name FROM public.questions q JOIN public.curriculum_chapters c ON c.id=q.topic_id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=d.blueprint_id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'`;
export async function learningEvidence(userId: string, timezone: string, db: Db = defaultDb) {
  const cap = await learningCapabilities(db);
  await verifiedTimezone(timezone, db);
  const r = (
    await db.execute<any>(
      sql`WITH a AS (SELECT * FROM public.practice_attempts WHERE user_id=${userId}::uuid AND revision_id IS NOT NULL AND delivery_id IS NOT NULL),available AS (SELECT q.id,q.topic_id FROM public.questions q JOIN public.topics t ON t.id=q.topic_id WHERE q.status='ACTIVE' AND t.status='ACTIVE'),bindings AS (${bindings}),domains AS (SELECT d.id,d.code,d.name FROM public.exam_domains d JOIN public.exam_blueprints b ON b.id=d.blueprint_id WHERE b.exam_code='200-301' AND b.version='1.1' AND b.status='ACTIVE'),dm AS (SELECT d.*,(SELECT count(*) FROM available q JOIN bindings m ON m.question_id=q.id WHERE m.id=d.id)::int AS available,(SELECT count(DISTINCT a.question_id) FROM a JOIN available v ON v.id=a.question_id JOIN bindings m ON m.question_id=a.question_id WHERE m.id=d.id)::int AS attempted,(SELECT count(*) FROM a JOIN bindings m ON m.question_id=a.question_id WHERE m.id=d.id)::int AS attempts,(SELECT count(*) FROM a JOIN bindings m ON m.question_id=a.question_id WHERE m.id=d.id AND a.is_correct)::int AS correct FROM domains d),vlan_questions AS (SELECT q.id AS question_id FROM public.questions q JOIN public.curriculum_chapters c ON c.id=q.topic_id WHERE c.code='CCNA-V1-08') SELECT jsonb_build_object('legacyAnswers',(SELECT count(*) FROM public.practice_attempts WHERE user_id=${userId}::uuid AND revision_id IS NULL),'attempts',(SELECT count(*) FROM a),'correct',(SELECT count(*) FROM a WHERE is_correct),'unique',(SELECT count(DISTINCT question_id) FROM a),'vlan',(SELECT jsonb_build_object('attempts',count(*),'correct',count(*) FILTER(WHERE a.is_correct),'unique',count(DISTINCT a.question_id)) FROM a JOIN vlan_questions v ON v.question_id=a.question_id)) AS totals,(SELECT coalesce(jsonb_agg(to_jsonb(dm) ORDER BY dm.code),'[]') FROM dm) AS domains`,
    )
  ).rows[0];
  const activity = (
    await db.execute<any>(
      sql`WITH events AS (${learningEvents(userId, cap.sessions, true)}) SELECT to_char((occurred_at AT TIME ZONE ${timezone})::date,'YYYY-MM-DD') AS date,count(*)::int AS total FROM events GROUP BY date ORDER BY date`,
    )
  ).rows;
  const sessions = cap.sessions
    ? Number(
        (
          await db.execute<any>(
            sql`SELECT count(*) AS n FROM public.learning_sessions WHERE user_id=${userId}::uuid AND status='COMPLETED'`,
          )
        ).rows[0].n,
      )
    : 0;
  const evidence: AchievementEvidence = {
    ...r.totals,
    sessions,
    streak: longestStreak(activity),
    domains: r.domains,
  };
  return {
    evidence,
    capabilities: cap,
    framework: skillFramework,
    skills: (r.domains as SkillDomain[])
      .filter((d) => (skillFramework.axes as readonly string[]).includes(d.code))
      .map((d) => skillScore(d)),
  };
}
export async function learnerProgress(input: unknown, userId: string, db: Db = defaultDb) {
  const timezone = progressTimezone(input);
  const result = await learningEvidence(userId, timezone, db);
  let badges: any[] = [];
  if (result.capabilities.achievements) {
    const rows = (
      await db.execute<any>(
        sql`SELECT d.id,d.name,d.description,d.rule_key AS "ruleKey",d.rule_version AS "ruleVersion",d.criteria,a.awarded_at AS "awardedAt",a.evidence AS "awardEvidence" FROM public.achievement_definitions d LEFT JOIN public.learner_achievements a ON a.achievement_id=d.id AND a.user_id=${userId}::uuid WHERE d.active OR a.id IS NOT NULL ORDER BY d.created_at,d.id`,
      )
    ).rows;
    badges = rows.map((d) => ({
      ...d,
      awardedAt: d.awardedAt ? new Date(d.awardedAt).toISOString() : null,
      ...evaluateRule(d, result.evidence),
    }));
  }
  return { timezone, ...result, badges };
}
export async function awardAchievements(input: unknown, userId: string, db: Db = defaultDb) {
  const timezone = progressTimezone(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    if (!(await learningCapabilities(tx as unknown as Db)).achievements)
      return { available: false, awarded: [] };
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"nexus-achievements:" + userId},0))`,
    );
    const result = await learningEvidence(userId, timezone, tx as unknown as Db);
    if (!result.capabilities.achievements) return { available: false, awarded: [] };
    const defs = (
      await tx.execute<any>(
        sql`SELECT id,rule_key AS "ruleKey",rule_version AS "ruleVersion",criteria FROM public.achievement_definitions WHERE active ORDER BY id`,
      )
    ).rows;
    const awarded = [];
    for (const def of defs) {
      if (!evaluateRule(def, result.evidence).eligible) continue;
      const rows = (
        await tx.execute<any>(
          sql`INSERT INTO public.learner_achievements(user_id,achievement_id,evidence) VALUES(${userId}::uuid,${def.id},${JSON.stringify({ timezone, framework: skillFramework.id, rule: { key: def.ruleKey, version: def.ruleVersion, criteria: def.criteria }, evidence: result.evidence })}::jsonb) ON CONFLICT(user_id,achievement_id) DO NOTHING RETURNING achievement_id AS id,awarded_at AS "awardedAt"`,
        )
      ).rows;
      awarded.push(...rows.map((r) => ({ ...r, awardedAt: new Date(r.awardedAt).toISOString() })));
    }
    return { available: true, awarded };
  });
}
