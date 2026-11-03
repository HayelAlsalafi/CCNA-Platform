// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { PgDialect } from "drizzle-orm/pg-core";
import {
  examStartSchema,
  examSelectionSchema,
  examQuestionDTO,
  gradeExamRows,
  examEligibility,
  examSession,
  examSave,
  examSubmit,
  examStart,
} from "./exams";
const uid = "11111111-1111-4111-8111-111111111111",
  sid = "22222222-2222-4222-8222-222222222222";
const snapshot = (multi = false) => ({
  questionCode: "CCNA-Q-000100",
  topic: { id: uid, name: "Transport", slug: "transport" },
  text: "Which protocols?",
  type: multi ? "MULTIPLE_CHOICE_MULTIPLE" : "MULTIPLE_CHOICE_SINGLE",
  difficulty: "MEDIUM",
  explanation: "PRIVATE EXPLANATION",
  referenceNotes: "PRIVATE REFERENCES",
  imageKey: null,
  options: [
    { optionKey: "A", text: "UDP", isCorrect: true },
    { optionKey: "B", text: "TCP", isCorrect: multi },
    { optionKey: "C", text: "Ethernet", isCorrect: false },
  ],
});
const row = (keys: string[], multi = false) => ({
  delivery_id: sid,
  question_id: uid,
  revision_id: sid,
  position: 0,
  selected_keys: keys,
  flagged: false,
  answer_version: 0,
  snapshot: snapshot(multi),
  mapping_snapshot: {
    domain: { id: uid, name: "Network Fundamentals" },
    chapter: { id: sid, title: "Transport protocols" },
  },
});
it("accepts bounded server configuration without learner-controlled identity", () => {
  expect(
    examStartSchema.safeParse({ requestId: uid, questionCount: 1, durationMinutes: 5 }).success,
  ).toBe(true);
  for (const extra of [
    { userId: uid },
    { role: "ADMIN" },
    { questionCount: 101 },
    { durationMinutes: 4 },
    { domainIds: [uid, uid] },
  ])
    expect(
      examStartSchema.safeParse({ requestId: uid, questionCount: 1, durationMinutes: 30, ...extra })
        .success,
    ).toBe(false);
});
it("rejects duplicate, invalid, negative-version and additional answer fields", () => {
  const base = { selectedOptionKeys: ["A"], flagged: false, expectedVersion: 0 };
  expect(examSelectionSchema.safeParse(base).success).toBe(true);
  for (const extra of [
    { selectedOptionKeys: ["A", "A"] },
    { selectedOptionKeys: ["TOO-LONG-KEY"] },
    { expectedVersion: -1 },
    { isCorrect: true },
  ])
    expect(examSelectionSchema.safeParse({ ...base, ...extra }).success).toBe(false);
});
it("active DTO has no answer keys, feedback, explanation or reference notes", () => {
  const dto = examQuestionDTO({ ...row(["A"], true), graded_result: { isCorrect: true } }, false),
    text = JSON.stringify(dto);
  for (const secret of [
    "isCorrect",
    "correctOption",
    "PRIVATE",
    "explanation",
    "referenceNotes",
    "snapshot",
  ])
    expect(text).not.toContain(secret);
  expect(dto).toMatchObject({ requiredSelectionCount: 2, selectedOptionKeys: ["A"] });
});
it("terminal feedback uses the captured revision and supports multiple correct options", () => {
  const dto = examQuestionDTO(row(["B", "A"], true), true);
  if (!("review" in dto)) throw new Error("Terminal DTO must include review");
  expect(dto.review?.correctOptions).toHaveLength(2);
  expect(dto.review?.explanation).toBe("PRIVATE EXPLANATION");
});
it("grades complete multiple sets independent of order, with no partial credit", () => {
  const result = gradeExamRows([
    row(["B", "A"], true),
    row(["A"], true),
    row([], false),
    row(["C"], false),
  ]);
  expect(result).toMatchObject({
    total: 4,
    correct: 1,
    incorrect: 2,
    unanswered: 1,
    percentage: 25,
  });
  expect(result.domains[0]).toMatchObject({ total: 4, correct: 1, incorrect: 2, unanswered: 1 });
  expect(result.chapters[0].total).toBe(4);
});
it("single-answer grading retains exact one-answer behavior", () => {
  expect(gradeExamRows([row(["A"]), row(["B"])])).toMatchObject({
    correct: 1,
    incorrect: 1,
    percentage: 50,
  });
});
it("invalid and extra answer keys never earn credit", () => {
  expect(gradeExamRows([row(["A", "C"]), row(["A", "B", "C"], true)])).toMatchObject({
    correct: 0,
    incorrect: 2,
  });
});
it("removed content DTO contains only the deletion tombstone", () => {
  const dto = examQuestionDTO(
    { ...row(["A"]), question_id: null, deleted_question_code: "CCNA-Q-000100" },
    false,
  );
  expect(dto).toEqual({
    deliveryId: sid,
    position: 0,
    removed: true,
    questionCode: "CCNA-Q-000100",
  });
});
it("eligibility explicitly enforces publication, topic visibility, canonical mappings and both filters", () => {
  const { sql } = new PgDialect().sqlToQuery(
    examEligibility({ domainIds: [uid], chapterIds: [sid] }),
  );
  for (const clause of [
    "q.status='ACTIVE'",
    "t.status='ACTIVE'",
    "b.status='ACTIVE'",
    "curriculum_chapters",
    "domain_id=ANY",
    "c.id=ANY",
    "MULTIPLE_CHOICE_MULTIPLE",
  ])
    expect(sql).toContain(clause);
  expect(sql).not.toContain("exam_objectives");
});
function missingDb() {
  return {
    execute: vi.fn(async () => ({ rows: [{ ready: true }] })),
    transaction: vi.fn(async (fn: any) => fn({ execute: vi.fn(async () => ({ rows: [] })) })),
  } as any;
}
it("another learner cannot read an unowned exam", async () => {
  await expect(examSession(uid, sid, missingDb())).rejects.toMatchObject({
    status: 404,
    code: "NOT_FOUND",
  });
});
it("another learner cannot save or submit an unowned exam", async () => {
  await expect(
    examSave(
      uid,
      sid,
      { selectedOptionKeys: ["A"], flagged: false, expectedVersion: 0 },
      sid,
      missingDb(),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(examSubmit(uid, sid, missingDb())).rejects.toMatchObject({ status: 404 });
});
it("closed or server-expired sessions cannot accept answer edits", async () => {
  for (const state of [
    { status: "SUBMITTED", expired: false },
    { status: "ACTIVE", expired: true },
  ]) {
    const db = {
      execute: async () => ({ rows: [{ ready: true }] }),
      transaction: async (fn: any) =>
        fn({
          execute: async (q: any) => {
            const text = new PgDialect().sqlToQuery(q).sql;
            return {
              rows: text.includes("FROM public.exam_sessions") ? [{ id: uid, ...state }] : [],
            };
          },
        }),
    } as any;
    await expect(
      examSave(
        uid,
        sid,
        { selectedOptionKeys: ["A"], flagged: false, expectedVersion: 0 },
        sid,
        db,
      ),
    ).rejects.toMatchObject({ code: "EXAM_CLOSED" });
  }
});
it("schema absence fails closed without starting a transaction or demo fallback", async () => {
  const db = { execute: async () => ({ rows: [{ ready: false }] }), transaction: vi.fn() } as any;
  await expect(
    examStart({ requestId: uid, questionCount: 1, durationMinutes: 5 }, uid, "auth", db),
  ).rejects.toMatchObject({ status: 503, code: "FEATURE_NOT_READY" });
  expect(db.transaction).not.toHaveBeenCalled();
});
