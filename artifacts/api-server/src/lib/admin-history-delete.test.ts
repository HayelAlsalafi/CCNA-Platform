import { it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  previewHistoryDeletion,
  confirmHistoryDeletion,
  historyDeleteConfirmation,
  deleteQuestionsOrdinary,
} from "./admin-history-delete";
const id = "11111111-1111-4111-8111-111111111111",
  identity = { actorId: "22222222-2222-4222-8222-222222222222", sessionId: "sess_preview_test" };
function fixture() {
  let removed = false;
  const state = {
    examReady: false,
    examItems: [] as any[],
    rows: [
      {
        id,
        questionCode: "CCNA-Q-000001",
        question: { id, status: "ACTIVE" },
        options: [],
        mappings: [],
        revisions: [{ id: "33333333-3333-4333-8333-333333333333" }],
        deliveries: [],
        attempts: [],
        sessionItems: [],
        sessions: [],
      },
    ],
  };
  const calls: string[] = [];
  const tx: any = {
    transaction: async (fn: any) => fn(tx),
    execute: vi.fn(async (query: any) => {
      const q = new PgDialect().sqlToQuery(query);
      calls.push(q.sql);
      if (q.sql.includes("AS exam_ready")) return { rows: [{ exam_ready: state.examReady }] };
      if (q.sql.includes("SELECT i.* FROM public.exam_session_items"))
        return { rows: state.examItems };
      if (q.sql.includes("AS ready")) return { rows: [{ ready: true }] };
      if (q.sql.includes("FROM public.questions q")) {
        expect(q.params).toEqual([[id]]);
        return { rows: state.rows };
      }
      if (q.sql.includes("delete_question_with_history")) {
        removed = true;
        return { rows: [{ receipt: { auditId: id } }] };
      }
      if (q.sql.startsWith("SELECT id FROM public.questions"))
        return { rows: removed ? [] : [{ id }] };
      return { rows: [] };
    }),
  };
  return { state, calls, tx, db: { transaction: async (fn: any) => fn(tx) } as any };
}
it("requires phrase and acknowledgement, binds actor/session and consumes successful tokens", async () => {
  const f = fixture(),
    p = await previewHistoryDeletion({ ids: [id] }, identity, f.db);
  expect(p.records).toEqual([
    {
      id,
      questionCode: "CCNA-Q-000001",
      examItems: 0,
      examSessions: 0,
      sessionItems: 0,
      sessions: 0,
      revisions: ["33333333-3333-4333-8333-333333333333"],
      deliveries: [],
      attempts: [],
    },
  ]);
  const input = {
    token: p.token,
    confirmation: historyDeleteConfirmation,
    acknowledgeHistoryLoss: true,
  };
  await expect(
    confirmHistoryDeletion({ ...input, acknowledgeHistoryLoss: false }, identity, f.db),
  ).rejects.toThrow("acknowledgement");
  await expect(
    confirmHistoryDeletion(input, { ...identity, sessionId: "sess_other" }, f.db),
  ).rejects.toThrow("different Admin session");
  await expect(confirmHistoryDeletion(input, { ...identity, actorId: id }, f.db)).rejects.toThrow(
    "different Admin session",
  );
  expect(await confirmHistoryDeletion(input, identity, f.db)).toMatchObject({
    deleted: 1,
    blocked: 0,
  });
  await expect(confirmHistoryDeletion(input, identity, f.db)).rejects.toThrow("expired");
  expect(f.calls.filter((q) => q.includes("delete_question_with_history"))).toHaveLength(1);
});
it("blocks changed history without deleting any rows and consumes the stale preview", async () => {
  const f = fixture(),
    p = await previewHistoryDeletion({ ids: [id] }, identity, f.db);
  f.state.rows[0]!.revisions.push({ id: "44444444-4444-4444-8444-444444444444" });
  const input = {
    token: p.token,
    confirmation: historyDeleteConfirmation,
    acknowledgeHistoryLoss: true,
  };
  expect(await confirmHistoryDeletion(input, identity, f.db)).toMatchObject({
    deleted: 0,
    blocked: 1,
    items: [{ outcome: "BLOCKED", reason: expect.stringContaining("changed after preview") }],
  });
  expect(f.calls.some((q) => q.includes("delete_question_with_history"))).toBe(false);
  await expect(confirmHistoryDeletion(input, identity, f.db)).rejects.toThrow("expired");
});
it("expires previews and refuses extra fields or implicit topic expansion", async () => {
  const f = fixture(),
    p = await previewHistoryDeletion({ ids: [id] }, identity, f.db);
  const now = vi.spyOn(Date, "now").mockReturnValue(p.expiresAt);
  try {
    await expect(
      confirmHistoryDeletion(
        { token: p.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
        identity,
        f.db,
      ),
    ).rejects.toThrow("expired");
  } finally {
    now.mockRestore();
  }
  await expect(
    previewHistoryDeletion({ ids: [id], includeTopics: true }, identity, f.db),
  ).rejects.toThrow("distinct question UUIDs");
});
it("fails closed before deletion when the migration capability is absent", async () => {
  const f = fixture();
  f.tx.execute.mockResolvedValue({ rows: [] });
  await expect(previewHistoryDeletion({ ids: [id] }, identity, f.db)).rejects.toThrow(
    "migration 0010",
  );
  expect(await deleteQuestionsOrdinary({ ids: [id] }, identity, f.db)).toMatchObject({
    deleted: 0,
    blocked: 1,
    failed: 0,
  });
  expect(f.calls.some((q) => q.includes("SELECT public.delete_question_"))).toBe(false);
});
it("does not claim DELETED without an audit receipt and physical absence", async () => {
  const f = fixture();
  expect(await deleteQuestionsOrdinary({ ids: [id] }, identity, f.db)).toMatchObject({
    deleted: 0,
    blocked: 0,
    failed: 1,
    items: [{ outcome: "FAILED" }],
  });
});
it("sanitizes unknown driver failures, keeping database messages out of the response", async () => {
  const f = fixture();
  f.tx.execute.mockRejectedValue(
    Object.assign(Error("postgres://sensitive-driver-output"), { code: "XX000" }),
  );
  const result = await deleteQuestionsOrdinary({ ids: [id] }, identity, f.db);
  expect(result).toMatchObject({ deleted: 0, failed: 1 });
  expect(JSON.stringify(result)).toContain("XX000");
  expect(JSON.stringify(result)).not.toContain("sensitive-driver-output");
});
it("reports an exact safe FK dependency name as BLOCKED rather than archiving", async () => {
  const f = fixture();
  f.tx.execute.mockRejectedValue(
    Object.assign(Error("private detail"), { code: "23503", constraint: "unreviewed_question_fk" }),
  );
  expect(await deleteQuestionsOrdinary({ ids: [id] }, identity, f.db)).toMatchObject({
    deleted: 0,
    blocked: 1,
    failed: 0,
    items: [
      {
        outcome: "BLOCKED",
        constraint: "unreviewed_question_fk",
        reason: expect.stringContaining("unreviewed_question_fk"),
      },
    ],
  });
});

it("exam deliveries require explicit history confirmation and are counted without exposing learner answers", async () => {
  const f = fixture();
  f.state.examReady = true;
  f.state.examItems = [
    {
      delivery_id: "33333333-3333-4333-8333-333333333333",
      question_id: id,
      session_id: id,
      selected_keys: ["A"],
      answer_version: 1,
    },
  ];
  const preview = await previewHistoryDeletion({ ids: [id] }, identity, f.db);
  expect(preview.requiresHistory).toBe(true);
  expect(preview.records[0]).toMatchObject({ examItems: 1, examSessions: 1 });
  expect(JSON.stringify(preview.records)).not.toContain("selected_keys");
  expect(f.calls.some((q) => q.includes("FROM public.exam_sessions"))).toBe(true);
});
it("an exam answer change after preview blocks deletion until a fresh confirmation", async () => {
  const f = fixture();
  f.state.examReady = true;
  f.state.examItems = [
    {
      delivery_id: "33333333-3333-4333-8333-333333333333",
      question_id: id,
      session_id: id,
      selected_keys: ["A"],
      answer_version: 1,
    },
  ];
  const preview = await previewHistoryDeletion({ ids: [id] }, identity, f.db);
  f.state.examItems[0].answer_version = 2;
  const result = await confirmHistoryDeletion(
    { token: preview.token, confirmation: historyDeleteConfirmation, acknowledgeHistoryLoss: true },
    identity,
    f.db,
  );
  expect(result.deleted).toBe(0);
  expect(f.calls.some((q) => q.includes("public.delete_question_with_history"))).toBe(false);
});
