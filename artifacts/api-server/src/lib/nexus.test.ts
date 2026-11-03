import { it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  parseNexusStart,
  nexusInstalled,
  nexusAvailability,
  nexusSessionHistory,
  nexusLearnAnswer,
  nexusAnalytics,
  nexusFinalSubmission,
} from "./nexus";
const id = "11111111-1111-4111-8111-111111111111";
it('final submission uses optionKey and rejects the broken selectedOptionKey alias',()=>{const answer={questionId:id,deliveryId:id,optionKey:'A'};expect(nexusFinalSubmission.safeParse({answers:[answer]}).success).toBe(true);expect(nexusFinalSubmission.safeParse({answers:[{questionId:id,deliveryId:id,selectedOptionKey:'A'}]}).success).toBe(false);expect(nexusFinalSubmission.safeParse({answers:[{...answer,optionKey:''}]}).success).toBe(false);expect(nexusFinalSubmission.safeParse({answers:[answer,answer]}).success).toBe(false);});
it.each([0, 101, -1, 1.5, "10"])("rejects invalid question count %s before any write", (count) => {
  expect(() => parseNexusStart({ requestId: id, count })).toThrow();
});
it.each([
  { count: 1, requestId: "invalid" },
  { count: 1, requestId: id, mode: "EXAM" },
  { count: 1, requestId: id, userId: id },
  { count: 1, requestId: id, domainId: "bad" },
])("rejects unsupported session inputs %j", (input) => {
  expect(() => parseNexusStart(input)).toThrow();
});
it("validates an explicit supported session configuration", () => {
  expect(
    parseNexusStart({ count: 10, requestId: id, mode: "REVIEW_MISTAKES", topicId: id }),
  ).toMatchObject({ count: 10, mode: "REVIEW_MISTAKES", topicId: id });
});
it("fails closed on a partially installed session schema", async () => {
  await expect(
    nexusInstalled({ execute: async () => ({ rows: [{ sessions: true, items: false }] }) } as any),
  ).rejects.toMatchObject({ code: "SCHEMA_INCOMPLETE" });
});
it("returns an explicit uninstalled legacy state", async () => {
  expect(
    await nexusInstalled({
      execute: async () => ({ rows: [{ sessions: false, items: false }] }),
    } as any),
  ).toBe(false);
});
it("scopes mistake selection to the actor and parameterizes filters with exactly one canonical chapter domain", async () => {
  const calls: any[] = [];
  const db: any = {
    execute: async (q: any) => {
      const c = new PgDialect().sqlToQuery(q);
      calls.push(c);
      return {
        rows: c.sql.includes("to_regclass")
          ? [{ sessions: false, items: false }]
          : c.sql.includes("GROUP BY t.id")
            ? []
            : [{ available: 0 }],
      };
    },
  };
  expect(await nexusAvailability({ mode: "REVIEW_MISTAKES", domainId: id }, id, db)).toMatchObject({
    available: 0,
    persistence: false,
  });
  expect(calls[0].sql).toContain("SELECT q.id AS question_id");
  expect(calls[0].sql).toContain("a.user_id=");
  expect(calls[0].sql).toContain("ORDER BY a.submitted_at DESC,a.id DESC");
  expect(calls[0].params).toContain(id);
  expect(calls[0].sql).not.toContain(id);
});
it.each([{ page: 0 }, { pageSize: 1000 }, { userId: id }, { search: "x".repeat(181) }])(
  "rejects invalid history pagination %j",
  async (p) => {
    await expect(nexusSessionHistory(id, p, {} as any)).rejects.toMatchObject({ status: 400 });
  },
);
it("retains legacy history without inventing sessions", async () => {
  expect(
    await nexusSessionHistory(id, {}, {
      execute: async () => ({ rows: [{ sessions: false, items: false }] }),
    } as any),
  ).toMatchObject({ items: [], total: 0, persistence: false });
});
it("rejects invalid question identifiers before database access", async () => {
  await expect(nexusLearnAnswer(id, "not-a-uuid", id, "session", {} as any)).rejects.toMatchObject({
    status: 400,
  });
});
it("rejects unsupported timeline ranges", async () => {
  await expect(nexusAnalytics(id, "session", "365", {} as any)).rejects.toMatchObject({
    status: 400,
  });
});
it("proposal restricts historical bindings and requires non-null terminal timestamps", () => {
  const sql = readFileSync(new URL("../../../../lib/db/drizzle/proposed/0007_nexus_sessions.sql",import.meta.url), "utf8");
  expect(sql).toContain("completed_at IS NOT NULL");
  expect(sql).toContain("FOREIGN KEY(delivery_id,user_id,question_id,revision_id)");
  expect(sql.match(/ON DELETE RESTRICT/g)).toHaveLength(3);
  expect(sql).toContain("ERRCODE='23514',CONSTRAINT='nexus_deferred_grading'");
  expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|GRANT |DELETE FROM|UPDATE public/);
});
