import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { commandCenterProjection, domainEvidence, parseCommandCenterQuery } from "./command-center";
import { nexusAnalytics } from "./nexus";
import { GetCommandCenterAnalyticsResponse } from "@workspace/api-zod";
const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const baseDomain = {
  id: actor,
  code: "1.0",
  name: "Network Fundamentals",
  weightPercent: 20,
  attempts: 0,
  correct: 0,
  uniqueQuestions: 0,
};
let examReady = false;
let aggregate: {
  coverage: {
    availableQuestions: number;
    practicedQuestions: number;
    availableChapters: number;
    practicedChapters: number;
  };
  domains: (typeof baseDomain)[];
};
let timeline: {
  rows: {
    day: string;
    attempts: number;
    correct: number;
    incorrect: number;
    completedSessions: number;
    completedExams: number;
  }[];
  truncated: boolean;
};
const calls: { sql: string; params: unknown[] }[] = [];
const database = {
  execute: vi.fn(async (query: SQL) => {
    const q = new PgDialect().sqlToQuery(query);
    calls.push(q);
    if (q.sql.includes("pg_timezone_names")) return { rows: [{ supported: true }] };
    if (q.sql.includes("to_regclass")) return { rows: [{ ready: examReady }] };
    if (q.sql.includes("WITH terminal"))
      return {
        rows: [
          {
            completed: 2,
            latest: {
              id: other,
              status: "EXPIRED",
              finalizedAt: "2026-10-25T14:00:00Z",
              questionCount: 10,
              percentage: 70,
              secretAnswer: "must not leave server",
            },
          },
        ],
      };
    return { rows: [q.sql.includes("bucket_window") ? timeline : aggregate] };
  }),
} as unknown as NonNullable<Parameters<typeof commandCenterProjection>[3]>;
beforeEach(() => {
  calls.length = 0;
  examReady = false;
  aggregate = {
    coverage: {
      availableQuestions: 0,
      practicedQuestions: 0,
      availableChapters: 0,
      practicedChapters: 0,
    },
    domains: [baseDomain],
  };
  timeline = { rows: [], truncated: false };
});
it.each([
  {},
  { range: "7", timezone: "America/New_York" },
  { range: "90", timezone: "Asia/Riyadh" },
  { range: "all", timezone: "UTC" },
])("validates supported calendar inputs %j", (input) => {
  expect(parseCommandCenterQuery(input).timezone).toBeTruthy();
});
it.each([
  { range: "365" },
  { range: ["7", "30"] },
  { timezone: "invalid-zone" },
  { timezone: "UTC');DROP TABLE users;--" },
  { userId: other },
  { range: 30 },
])("rejects unsupported or actor-controlled inputs %j", (input) => {
  expect(() => parseCommandCenterQuery(input)).toThrow();
});
it("requires both answer and distinct-question samples for strong evidence", () => {
  expect(
    domainEvidence({ ...baseDomain, attempts: 20, correct: 20, uniqueQuestions: 1 }).status,
  ).toBe("INSUFFICIENT");
  expect(
    domainEvidence({ ...baseDomain, attempts: 9, correct: 9, uniqueQuestions: 3 }).status,
  ).toBe("INSUFFICIENT");
  expect(
    domainEvidence({ ...baseDomain, attempts: 10, correct: 8, uniqueQuestions: 3 }).status,
  ).toBe("STRONG");
  expect(
    domainEvidence({ ...baseDomain, attempts: 10, correct: 6, uniqueQuestions: 3 }).status,
  ).toBe("REVIEW");
  expect(
    domainEvidence({ ...baseDomain, attempts: 10, correct: 7, uniqueQuestions: 3 }).status,
  ).toBe("DEVELOPING");
  expect(domainEvidence(baseDomain).accuracy).toBeNull();
});
it("rejects impossible aggregates rather than presenting a fabricated score", async () => {
  expect(() => domainEvidence({ ...baseDomain, correct: 1 })).toThrow();
  aggregate.coverage.practicedQuestions = 1;
  await expect(
    commandCenterProjection(actor, parseCommandCenterQuery({}), false, database),
  ).rejects.toThrow();
});
it("keeps a new learner honest without touching absent optional exam tables", async () => {
  const result = await commandCenterProjection(actor, parseCommandCenterQuery({}), false, database);
  expect(result.commandCenter.coverage.practicedQuestions).toBe(0);
  expect(result.commandCenter.domains[0]).toMatchObject({ accuracy: null, status: "INSUFFICIENT" });
  expect(result.commandCenter.exams).toEqual({ available: false, completed: 0, latest: null });
  expect(calls.some((q) => /FROM public.exam_sessions/.test(q.sql))).toBe(false);
  expect(calls.some((q) => /FROM public.learning_sessions/.test(q.sql))).toBe(false);
});
it("retains repeated mixed attempts while distinguishing unique published coverage", async () => {
  aggregate = {
    coverage: {
      availableQuestions: 8,
      practicedQuestions: 3,
      availableChapters: 4,
      practicedChapters: 2,
    },
    domains: [{ ...baseDomain, attempts: 12, correct: 8, uniqueQuestions: 4 }],
  };
  timeline.rows = [
    {
      day: "2026-10-25",
      attempts: 12,
      correct: 8,
      incorrect: 4,
      completedSessions: 1,
      completedExams: 0,
    },
  ];
  const result = await commandCenterProjection(
    actor,
    parseCommandCenterQuery({ range: "7" }),
    true,
    database,
  );
  expect(result.commandCenter.domains[0]).toMatchObject({
    attempts: 12,
    uniqueQuestions: 4,
    accuracy: 67,
    status: "REVIEW",
  });
  expect(result.timeline[0].correct + result.timeline[0].incorrect).toBe(
    result.timeline[0].attempts,
  );
  expect(result.commandCenter.coverage.practicedQuestions).toBe(3);
});
it("uses historical chapter attribution and cannot multiply multi-objective answers", async () => {
  await commandCenterProjection(actor, parseCommandCenterQuery({}), true, database);
  const query = calls.find((q) => q.sql.includes("domain_metrics"))!;
  expect(query.sql).toContain("c.id=a.topic_id");
  expect(query.sql).toContain("count(DISTINCT a.question_id)");
  expect(query.sql).toContain("a.topic_id=q.topic_id");
  expect(query.sql).toContain("q.status='ACTIVE' AND t.status='ACTIVE'");
  expect(query.sql).not.toContain("question_objectives");
  expect(query.sql).toContain("LEFT JOIN domain_metrics");
});
it("binds only the supplied verified actor and timezone, with a finite DST-safe calendar grid", async () => {
  await commandCenterProjection(
    actor,
    parseCommandCenterQuery({ range: "90", timezone: "America/New_York" }),
    true,
    database,
  );
  const query = calls.find((q) => q.sql.includes("bucket_window"))!;
  expect(query.params).toContain(actor);
  expect(query.params).toContain("America/New_York");
  expect(query.params).toContain(90);
  expect(query.sql).not.toContain(actor);
  expect(query.sql).not.toContain(other);
  expect(query.sql).toContain("generate_series");
  expect(query.sql).toContain("AT TIME ZONE");
  expect(query.sql).toContain("coalesce(c.attempts,0)");
  expect(query.sql).toContain("status='COMPLETED'");
});
it("queries only owned terminal exams after readiness, without leaking results or counting draft exams", async () => {
  examReady = true;
  const result = await commandCenterProjection(actor, parseCommandCenterQuery({}), true, database);
  const query = calls.find((q) => q.sql.includes("WITH terminal"))!;
  expect(query.params).toContain(actor);
  expect(query.sql).toContain("status IN ('SUBMITTED','EXPIRED')");
  expect(query.sql).toContain("LIMIT 1");
  expect(result.commandCenter.exams.latest).toMatchObject({ percentage: 70, status: "EXPIRED" });
  expect(JSON.stringify(result)).not.toContain("secretAnswer");
});
it("bounds and labels old monthly data without dropping lifetime evidence", async () => {
  timeline.truncated = true;
  const result = await commandCenterProjection(
    actor,
    parseCommandCenterQuery({ range: "all" }),
    false,
    database,
  );
  expect(result.commandCenter.timeline).toEqual({ maximumBuckets: 120, truncated: true });
  expect(calls.find((q) => q.sql.includes("bucket_window"))!.params).toContain(120);
});
it("fails on mismatched graded totals instead of hiding analytics corruption", async () => {
  timeline.rows = [
    {
      day: "2026-10-25",
      attempts: 3,
      correct: 2,
      incorrect: 2,
      completedSessions: 0,
      completedExams: 0,
    },
  ];
  await expect(
    commandCenterProjection(actor, parseCommandCenterQuery({}), false, database),
  ).rejects.toThrow("Invalid timeline aggregate");
});
it("assembles a schema-validated compatible analytics response with no duplicate answer details", async () => {
  const serviceDatabase = {
    transaction: async (run: (db: unknown) => unknown, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "repeatable read", accessMode: "read only" });
      return run(serviceDatabase);
    },
    execute: async (query: SQL) => {
      const compiled = new PgDialect().sqlToQuery(query);
      if (compiled.sql.includes(" AS sessions"))
        return { rows: [{ sessions: false, items: false }] };
      if (compiled.sql.includes("topic_metrics"))
        return {
          rows: [
            {
              totals: {
                attempts: 0,
                correct: 0,
                unique: 0,
                lastActivity: null,
                available: 0,
                unmapped: 0,
                unmappedAttempts: 0,
              },
              domains: [],
              topics: [],
              timeline: [],
              secret: "must be stripped",
            },
          ],
        };
      return database.execute(query);
    },
  } as unknown as NonNullable<Parameters<typeof nexusAnalytics>[3]>;
  const result = await nexusAnalytics(actor, "verified-session", "30", serviceDatabase, "UTC");
  expect(GetCommandCenterAnalyticsResponse.safeParse(result).success).toBe(true);
  expect(result.totals).toMatchObject({ attempts: 0, correct: 0 });
  expect(result.commandCenter.exams.available).toBe(false);
  expect(JSON.stringify(result)).not.toContain("secret");
});

it("the installed Drizzle raw executor retains PostgreSQL timestamp text (no connection)", async () => {
  const raw = "2026-10-26 12:00:00.123456+03";
  const client = { query: vi.fn(async (config: any) => ({ rows: [{
    raw: config.types.getTypeParser(1184, "text")(raw),
    json: config.types.getTypeParser(114, "text")('"2026-10-26T12:00:00.123456+03:00"'),
  }] })) };
  const { sql } = await import("drizzle-orm");
  const result = await drizzle(client as any).execute(sql`SELECT created_at, to_json(created_at)`);
  expect(result.rows[0]).toEqual({ raw, json: "2026-10-26T12:00:00.123456+03:00" });
});

it.each([
  ["ACTIVE", "+03", "+03:00"], ["COMPLETED", "+03", "+03:00"],
  ["ACTIVE", "+00", "+00:00"], ["COMPLETED", "-04", "-04:00"],
])("validates analytics after a persisted %s session with driver offset %s", async (status, rawOffset, jsonOffset) => {
  const raw = `2026-10-26 12:00:00.123456${rawOffset}`;
  const iso = `2026-10-26T12:00:00.123456${jsonOffset}`;
  const timestamp = (query: string, column: string) => query.includes(`to_json(s.${column})`) ? iso : raw;
  const db = {
    transaction: async (run: (tx: unknown) => unknown) => run(db),
    execute: async (query: SQL) => {
      const q = new PgDialect().sqlToQuery(query);
      if (q.sql.includes(" AS sessions")) return { rows: [{ sessions: true, items: true }] };
      if (q.sql.includes("topic_metrics")) return { rows: [{
        totals: { attempts: status === "COMPLETED" ? 1 : 0, correct: 0, unique: status === "COMPLETED" ? 1 : 0, lastActivity: status === "COMPLETED" ? iso : null, available: 1, unmapped: 0, unmappedAttempts: 0 },
        domains: [], topics: [], timeline: [],
      }] };
      if (q.sql.includes("count(*) AS n")) return { rows: [{ n: "1" }] };
      if (q.sql.includes('AS "completedAt"')) return { rows: [{ id: actor, mode: "PRACTICE", status,
        createdAt: timestamp(q.sql, "created_at"), completedAt: status === "COMPLETED" ? timestamp(q.sql, "completed_at") : null,
        questionCount: 1, removedCount: 0, answered: status === "COMPLETED" ? 1 : 0, correct: 0, topics: "Switching",
      }] };
      if (q.sql.includes("auth_session_id")) return { rows: status === "ACTIVE" ? [{ id: actor, mode: "PRACTICE", questionCount: 1, createdAt: timestamp(q.sql, "created_at") }] : [] };
      return database.execute(query);
    },
  };
  const result = await nexusAnalytics(actor, "verified-session", "30", db as any, "Asia/Riyadh");
  expect(result.sessions.items[0].createdAt).toBe(iso);
  expect(result.sessions.items[0].completedAt).toBe(status === "COMPLETED" ? iso : null);
  expect(result.resume?.createdAt ?? null).toBe(status === "ACTIVE" ? iso : null);
  expect(result.totals.attempts).toBe(status === "COMPLETED" ? 1 : 0);
});
it("does not weaken datetime validation to accept arbitrary raw strings", () => {
  const session = GetCommandCenterAnalyticsResponse.shape.sessions.shape.items.element;
  const valid = { id: actor, mode: "PRACTICE", status: "ACTIVE", questionCount: 1, answered: 0, correct: 0, topics: "Switching", createdAt: "2026-10-26T12:00:00.123456+03:00", completedAt: null };
  expect(session.safeParse(valid).success).toBe(true);
  for (const createdAt of ["2026-10-26 12:00:00+03", "not-a-date", "infinity", "2026-02-30T12:00:00Z"])
    expect(session.safeParse({ ...valid, createdAt }).success).toBe(false);
});
