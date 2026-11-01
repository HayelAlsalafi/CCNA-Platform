import { it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  calendarInput,
  activityIntensity,
  longestStreak,
  skillScore,
  achievementRules,
  evaluateRule,
  awardAchievements,
  learningCapabilities,
  type AchievementEvidence,
} from "./learning-evidence";
const domain = (code = "1.0") => ({
  id: code,
  code,
  name: "Fixture domain",
  available: 10,
  attempted: 5,
  attempts: 20,
  correct: 16,
});
it.each([
  [0, 0],
  [1, 1],
  [4, 1],
  [5, 2],
  [9, 2],
  [10, 3],
  [19, 3],
  [20, 4],
  [300, 4],
])("maps %i actual events to intensity %i", (n, level) => expect(activityIntensity(n)).toBe(level));
it("validates the calendar without interpreting timezone strings as SQL", () => {
  expect(calendarInput({ year: "2024", timezone: "Asia/Riyadh" })).toMatchObject({ year: 2024 });
  expect(() => calendarInput({ year: 2024, timezone: "UTC'); DROP TABLE users;--" })).toThrow();
  expect(() => calendarInput({ year: 2024, timezone: "UTC", userId: "other" })).toThrow();
});
it.each([1969, 2024.5, "bad", 9999])("rejects unsupported year %s", (year) =>
  expect(() => calendarInput({ year, timezone: "UTC" })).toThrow(),
);
it("counts consecutive calendar dates across leap days, years and DST", () => {
  expect(
    longestStreak(["2024-02-28", "2024-02-29", "2024-03-01"].map((date) => ({ date, total: 1 }))),
  ).toBe(3);
  expect(
    longestStreak(["2025-12-31", "2026-01-01", "2026-01-02"].map((date) => ({ date, total: 1 }))),
  ).toBe(3);
  expect(
    longestStreak(["2024-03-09", "2024-03-10", "2024-03-11"].map((date) => ({ date, total: 1 }))),
  ).toBe(3);
});
it("does not turn duplicate events or empty days into consecutive activity", () => {
  expect(
    longestStreak([
      { date: "2026-01-01", total: 2 },
      { date: "2026-01-01", total: 4 },
      { date: "2026-01-02", total: 0 },
      { date: "2026-01-03", total: 1 },
    ]),
  ).toBe(1);
  expect(longestStreak([])).toBe(0);
});
it("weights skill evidence by accuracy, coverage and sample size", () => {
  expect(skillScore(domain())).toMatchObject({ accuracy: 80, coverage: 50, score: 40 });
  expect(skillScore({ ...domain(), attempts: 10, correct: 8 })).toMatchObject({ score: 20 });
});
it("does not call a perfect small sample mastery or plot it as zero", () => {
  expect(skillScore({ ...domain(), attempts: 1, correct: 1, attempted: 1 })).toMatchObject({
    accuracy: 100,
    score: null,
    status: "INSUFFICIENT_EVIDENCE",
  });
  expect(skillScore({ ...domain(), available: 0 })).toMatchObject({ coverage: null, score: null });
});
const evidence = (): AchievementEvidence => ({
  attempts: 30,
  correct: 27,
  unique: 10,
  sessions: 1,
  streak: 7,
  vlan: { attempts: 5, correct: 4, unique: 3 },
  domains: ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"].map((code) => ({
    ...domain(code),
    attempts: 10,
    correct: 8,
    attempted: 5,
  })),
});
it.each(achievementRules.filter((r) => r.id !== "packet-explorer.v1"))(
  "uses explicit measured eligibility for $id",
  (rule) => {
    expect(evaluateRule(rule, evidence())).toMatchObject({ eligible: true, progress: 100 });
  },
);
it("requires fifty distinct questions rather than fifty repeated answers", () => {
  const rule = achievementRules[1];
  expect(evaluateRule(rule, { ...evidence(), attempts: 100, unique: 1 })).toMatchObject({
    eligible: false,
    progress: 2,
  });
  expect(evaluateRule(rule, { ...evidence(), unique: 50 })).toMatchObject({ eligible: true });
});
it("Precision 90 requires both meaningful sample and question diversity", () => {
  const rule = achievementRules.find((r) => r.id === "precision-90.v1")!;
  expect(evaluateRule(rule, { ...evidence(), attempts: 29, correct: 29 })).toMatchObject({
    eligible: false,
  });
  expect(evaluateRule(rule, { ...evidence(), unique: 9 })).toMatchObject({ eligible: false });
  expect(evaluateRule(rule, { ...evidence(), correct: 26 })).toMatchObject({ eligible: false });
});
it("requires all six configured domains and explicit VLAN evidence", () => {
  expect(
    evaluateRule(achievementRules[6], { ...evidence(), domains: evidence().domains.slice(0, 5) }),
  ).toMatchObject({ eligible: false });
  expect(
    evaluateRule(achievementRules[3], {
      ...evidence(),
      vlan: { attempts: 20, correct: 20, unique: 2 },
    }),
  ).toMatchObject({ eligible: false });
});
it("refuses unregistered rules, changed thresholds and unknown versions", () => {
  expect(evaluateRule({ ruleKey: "page-visits", criteria: {} }, evidence()).supported).toBe(false);
  expect(
    evaluateRule({ ...achievementRules[0], criteria: { sessions: 0 } }, evidence()).eligible,
  ).toBe(false);
  expect(evaluateRule({ ...achievementRules[0], ruleVersion: 2 }, evidence()).eligible).toBe(false);
});
it("fails closed when achievement tables are only partially present", async () => {
  await expect(
    learningCapabilities({
      execute: async () => ({
        rows: [{ sessions: true, items: true, definitions: true, awards: false }],
      }),
    } as any),
  ).rejects.toMatchObject({ code: "SCHEMA_INCOMPLETE" });
});
it("awards only from queried evidence with idempotent inserts scoped to the trusted actor", async () => {
  const stored = new Set<string>(),
    queries: any[] = [];
  const db: any = {
    transaction: async (fn: any) => fn(db),
    execute: async (sql: any) => {
      const q = new PgDialect().sqlToQuery(sql);
      queries.push(q);
      if (q.sql.includes("to_regclass"))
        return { rows: [{ sessions: true, items: true, definitions: true, awards: true }] };
      if (q.sql.includes("pg_timezone_names")) return { rows: [{}] };
      if (q.sql.includes("vlan_questions"))
        return {
          rows: [
            {
              totals: {
                attempts: 1,
                correct: 1,
                unique: 1,
                vlan: { attempts: 0, correct: 0, unique: 0 },
              },
              domains: [],
            },
          ],
        };
      if (q.sql.includes("WITH events")) return { rows: [{ date: "2026-10-15", total: 1 }] };
      if (q.sql.includes("count(*) AS n"))
        return { rows: [{ n: q.params[0] === "actor-a" ? 1 : 0 }] };
      if (q.sql.includes("FROM public.achievement_definitions"))
        return { rows: [{ ...achievementRules[0], ruleVersion: 1 }] };
      if (q.sql.startsWith("INSERT INTO public.learner_achievements")) {
        const key = q.params[0] + ":" + q.params[1];
        if (stored.has(key)) return { rows: [] };
        stored.add(key);
        return { rows: [{ id: q.params[1], awardedAt: "2026-10-15T00:00:00Z" }] };
      }
      return { rows: [] };
    },
  };
  expect((await awardAchievements({ timezone: "UTC" }, "actor-a", db)).awarded).toHaveLength(1);
  expect((await awardAchievements({ timezone: "UTC" }, "actor-a", db)).awarded).toHaveLength(0);
  expect((await awardAchievements({ timezone: "UTC" }, "actor-b", db)).awarded).toHaveLength(0);
  expect(queries.find((q) => q.sql.startsWith("INSERT")).sql).toContain(
    "ON CONFLICT(user_id,achievement_id) DO NOTHING",
  );
  expect(stored.size).toBe(1);
});

it("does not accept client award counts, owner IDs or eligibility values", async () => {
  await expect(
    awardAchievements({ timezone: "UTC", userId: "victim", attempts: 99999 }, "actor", {} as any),
  ).rejects.toMatchObject({ status: 400 });
});
