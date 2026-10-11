import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", async () => ({ ...(await import("@workspace/db/schema")), db: {} }));
const { submitPracticeAnswer } = await import("./practice");
type Db = Parameters<typeof submitPracticeAnswer>[3];
const questionId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const deliveryId = "44444444-4444-4444-8444-444444444444";
const revisionId = "55555555-5555-4555-8555-555555555555";
const snapshot = { questionCode: "CCNA-Q-000001", topic: { id: topicId, slug: "demo", name: "Original topic" },
  text: "Original question", type: "MULTIPLE_CHOICE_SINGLE", difficulty: "EASY", explanation: "Original explanation",
  imageKey: null, referenceNotes: null, options: [ { optionKey: "A", text: "Original A", isCorrect: false }, { optionKey: "B", text: "Original B", isCorrect: true } ] };
function makeDb({ missing = false, session = "sess_a", priorKey = "", expired = false, active = true, failInsert = false, failCommit = false } = {}) {
  const rows: unknown[] = []; const insert = vi.fn(); const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [{ expired }] }); const reads: unknown[] = [
    missing ? [] : [{ delivery: { id: deliveryId, sessionId: session, expiresAt: new Date(Date.now()+3600000) }, revision: { id: revisionId, snapshot } }],
    priorKey ? [{ selectedOptionKey: priorKey, isCorrect: priorKey === "B" }] : [],
    active ? [{ id: questionId }] : [], [{ id: topicId }],
  ];
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const pending: unknown[] = [];
    const tx = { execute, select: () => {
      const result = reads.shift();
      const q: Record<string, unknown> = { then: (resolve: (x: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      for (const method of ["from", "innerJoin", "where", "limit", "for"]) q[method] = () => q;
      return q;
    }, insert: (...args: unknown[]) => { insert(...args); return { values: async (value: unknown) => { if (failInsert) throw Error("Insert failed"); pending.push(value); } }; } };
    const result = await fn(tx); if (failCommit) throw Error("Commit failed"); rows.push(...pending); return result;
  });
  return { db: { transaction } as unknown as Db, rows, insert, execute, transaction };
}
const call = (fake: ReturnType<typeof makeDb>, key = "B", session = "sess_a") => submitPracticeAnswer(questionId, key, userId, fake.db, deliveryId, session);
describe("immutable delivery grading (unit)", () => {
  it.each([["A", false], ["B", true]] as const)("grades %s from original revision and inserts its binding", async (key, correct) => {
    const fake = makeDb(); expect(await call(fake, key)).toEqual({ isCorrect: correct, correctOption: { optionKey: "B", text: "Original B" }, explanation: "Original explanation" });
    expect(fake.rows).toEqual([{ userId, questionId, topicId, revisionId, deliveryId, selectedOptionKey: key, isCorrect: correct }]);
    expect(fake.execute).toHaveBeenCalledTimes(2);
  });
  it("normalizes keys without changing the revision", async () => { const f=makeDb(); await call(f," b "); expect(f.rows[0]).toMatchObject({ selectedOptionKey:"B",revisionId }); });
  it("requires a delivery before opening a transaction", async () => { const f=makeDb(); await expect(submitPracticeAnswer(questionId,"B",userId,f.db)).rejects.toMatchObject({status:409,code:"DELIVERY_REQUIRED"});expect(f.transaction).not.toHaveBeenCalled(); });
  it("does not insert when another user owns the delivery", async () => { const f=makeDb({missing:true});expect(await call(f)).toBeNull();expect(f.insert).not.toHaveBeenCalled(); });
  it("does not reveal or replay data to a different verified session", async () => { const f=makeDb({priorKey:"B"});expect(await call(f,"B","sess_b")).toBeNull();expect(f.insert).not.toHaveBeenCalled(); });
  it("replays the accepted result without another attempt", async () => { const f=makeDb({priorKey:"B",expired:true,active:false});expect(await call(f)).toMatchObject({isCorrect:true});expect(f.insert).not.toHaveBeenCalled(); });
  it("rejects a conflicting retry", async () => { const f=makeDb({priorKey:"A"});await expect(call(f)).rejects.toMatchObject({status:409,code:"SUBMISSION_CONFLICT"});expect(f.insert).not.toHaveBeenCalled(); });
  it("rejects an expired unsubmitted delivery", async () => { const f=makeDb({expired:true});await expect(call(f)).rejects.toMatchObject({status:409,code:"DELIVERY_EXPIRED"});expect(f.insert).not.toHaveBeenCalled(); });
  it("still respects disabled current questions/topics", async () => { const f=makeDb({active:false});expect(await call(f)).toBeNull();expect(f.insert).not.toHaveBeenCalled(); });
  it("rejects options outside the captured revision", async () => { const f=makeDb();await expect(call(f,"Z")).rejects.toMatchObject({status:400,code:"INVALID_OPTION"});expect(f.insert).not.toHaveBeenCalled(); });
  it.each(["insert","commit"])("does not report success after %s failure", async kind => { const f=makeDb({failInsert:kind==="insert",failCommit:kind==="commit"});await expect(call(f)).rejects.toThrow();expect(f.rows).toEqual([]); });
});
