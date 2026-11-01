import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { deleteAdminRecords, deleteIdsSchema } from "./admin-delete";
import { sprint7QuestionIds, sprint7TopicIds } from "./pilot-content-protection";
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
function fixture(evidence: Record<string, number>[], errors: string[] = [], retained = false) {
  const events: string[] = [],
    removed = new Set<number>();
  let index = -1;
  const tx: any = {
    execute: vi.fn(async () => ({
      rows: [
        {
          revisions: 0,
          deliveries: 0,
          attempts: 0,
          active_questions: 0,
          other_questions: 0,
          revision_snapshots: 0,
          ...evidence[index],
        },
      ],
    })),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (removed.has(index) && !retained ? [] : [{ id: ids[index] }]),
        }),
      }),
    }),
    update: vi.fn(() => {
      throw Error("Delete must never update/archive records.");
    }),
    delete: () => ({
      where: () => ({
        returning: async () => {
          events.push("delete:" + index);
          if (errors[index]) throw { code: errors[index], constraint: "protected_history_fk" };
          removed.add(index);
          return [{ id: ids[index] }];
        },
      }),
    }),
    transaction: async (fn: any) => {
      index++;
      const before = events.length;
      try {
        return await fn(tx);
      } catch (e) {
        events.splice(before);
        removed.delete(index);
        throw e;
      }
    },
  };
  const db: any = {
    transaction: async (fn: any) => {
      try {
        return await fn(tx);
      } catch (e) {
        events.length = 0;
        removed.clear();
        throw e;
      }
    },
  };
  return { db, events, tx };
}
it("rejects duplicate IDs including case variants, malformed IDs and unsupported fields", () => {
  for (const input of [
    { ids: [] },
    { ids: ["invalid"] },
    { ids: [ids[0], ids[0]] },
    { ids, outcome: "DELETED" },
    { ids: [sprint7QuestionIds[0], sprint7QuestionIds[0]!.toUpperCase()] },
  ])
    expect(deleteIdsSchema.safeParse(input).success).toBe(false);
});
it("returns only DELETED/BLOCKED with exact history counts and never updates status", async () => {
  const f = fixture([{}, { revisions: 2, deliveries: 3, attempts: 1 }]);
  const result = await deleteAdminRecords("questions", { ids: [...ids].reverse() }, f.db);
  expect(result).toMatchObject({ deleted: 1, blocked: 1 });
  expect(result).not.toHaveProperty("archived");
  expect(result.items[1]).toMatchObject({
    outcome: "BLOCKED",
    dependencies: { revisions: 2, deliveries: 3, attempts: 1 },
  });
  expect(result.items[1]!.reason).toContain("revisions: 2, deliveries: 3, attempts: 1");
  expect(f.tx.update).not.toHaveBeenCalled();
  expect(f.events).toEqual(["delete:0"]);
  const lock = new PgDialect().sqlToQuery(f.tx.execute.mock.calls[2][0]);
  expect(lock.params).toEqual(ids);
  expect(lock.sql).toContain(" in ($1, $2)");
  expect(lock.sql).toContain("ORDER BY id FOR UPDATE");
});
it("blocks all question-bearing topics and snapshot/attempt references without touching children", async () => {
  const f = fixture([
    { active_questions: 2 },
    { other_questions: 1, attempts: 1, revision_snapshots: 3 },
  ]);
  const result = await deleteAdminRecords("topics", { ids }, f.db);
  expect(result).toMatchObject({ deleted: 0, blocked: 2 });
  expect(result.items[0]!.reason).toContain("active_questions: 2");
  expect(result.items[1]!.reason).toContain("other_questions: 1");
  expect(f.events).toEqual([]);
  expect(f.tx.update).not.toHaveBeenCalled();
});
it.each(["23503", "23001", "55P03", "42501"])(
  "rolls an individually blocked item back for SQLSTATE %s",
  async (code) => {
    const f = fixture([{}, {}], [code]);
    const result = await deleteAdminRecords("questions", { ids }, f.db);
    expect(result).toMatchObject({ deleted: 1, blocked: 1 });
    expect(f.events).toEqual(["delete:1"]);
    if (["23503", "23001"].includes(code))
      expect(result.items[0]).toHaveProperty("constraint", "protected_history_fk");
  },
);
it("never claims deletion if the row remains in PostgreSQL", async () => {
  const f = fixture([{}], [], true);
  await expect(deleteAdminRecords("questions", { ids: [ids[0]] }, f.db)).rejects.toThrow(
    "absence verification",
  );
  expect(f.events).toEqual([]);
});
it("rolls the whole batch back on an unexpected error", async () => {
  const f = fixture([{}, {}], ["", "XX000"]);
  await expect(deleteAdminRecords("questions", { ids }, f.db)).rejects.toMatchObject({
    code: "XX000",
  });
  expect(f.events).toEqual([]);
});
it.each(["questions", "topics"] as const)(
  "uses dependency checks rather than an unconditional Sprint 7 %s protection",
  async (kind) => {
    const protectedId = (kind === "questions" ? sprint7QuestionIds : sprint7TopicIds)[0]!;
    const f = fixture([{revisions:1,other_questions:1}]);
    const result = await deleteAdminRecords(kind, { ids: [protectedId.toUpperCase()] }, f.db);
    expect(result).toMatchObject({ deleted: 0, blocked: 1 });
    expect(result.items[0]!.reason).toContain("Permanent deletion blocked by");
    expect(result.items[0]!.reason).not.toContain("Protected Sprint 7");
    expect(f.events).toEqual([]);
    expect(f.tx.update).not.toHaveBeenCalled();
  },
);
it("protects exactly the reviewed 60 question IDs and 24 required topic IDs", () => {
  expect(new Set(sprint7QuestionIds).size).toBe(60);
  expect(new Set(sprint7TopicIds).size).toBe(24);
});
