import { expect, it, vi } from "vitest";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
const capture = vi.fn();
vi.mock("./question-revisions", () => ({
  captureQuestionRevision: (...args: unknown[]) => capture(...args),
}));
import { startPracticeBatch, practiceBatchInput } from "./practice-batch";
const topicId = "11111111-1111-4111-8111-111111111111";
function fixture(rows: unknown[]) {
  const insert = vi.fn();
  let written = 0;
  const tx: any = {
    execute: async () => ({ rows: [] }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => rows }) }) }),
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        insert(v);
        return {
          returning: async () => {
            written++;
            return [{ id: "delivery-" + written, expiresAt: new Date("2030-01-01") }];
          },
        };
      },
    }),
  };
  return {
    insert,
    db: {
      transaction: async (fn: any) => {
        try {
          return await fn(tx);
        } catch (e) {
          written = 0;
          throw e;
        }
      },
    } as any,
  };
}
it("rejects invalid counts, injected identity and malformed topic IDs", () => {
  for (const input of [
    { topicId, count: 0 },
    { topicId, count: 101 },
    { topicId, count: 1.5 },
    { topicId, count: 1, userId: "fake" },
    { topicId: "x", count: 1 },
  ])
    expect(practiceBatchInput.safeParse(input).success).toBe(false);
});
it("refuses oversized availability before issuing any delivery", async () => {
  const f = fixture([]);
  await expect(startPracticeBatch({ topicId, count: 1 }, "user", "session", f.db)).rejects.toThrow(
    "exceeds",
  );
  expect(f.insert).not.toHaveBeenCalled();
});
it("issues distinct question deliveries, binding actor/session and withholding every answer/author field", async () => {
  capture.mockImplementation(async (_tx, q) => ({
    id: "revision-" + q.id,
    snapshot: {
      questionCode: "Q",
      topic: { id: topicId, slug: "t", name: "T" },
      text: "Question",
      type: "MULTIPLE_CHOICE_SINGLE",
      difficulty: "EASY",
      explanation: "PRIVATE",
      referenceNotes: "PRIVATE",
      options: [
        { optionKey: "A", text: "A", isCorrect: true },
        { optionKey: "B", text: "B", isCorrect: false },
      ],
    },
  }));
  const f = fixture([{ question: { id: "q1" } }, { question: { id: "q2" } }]);
  const result = await startPracticeBatch({ topicId, count: 2 }, "user", "session", f.db);
  expect(result.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  expect(f.insert).toHaveBeenCalledWith({
    userId: "user",
    sessionId: "session",
    questionId: "q1",
    revisionId: "revision-q1",
  });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|isCorrect|explanation|referenceNotes/);
});
