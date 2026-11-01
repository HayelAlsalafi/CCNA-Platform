import { it, expect, vi } from "vitest";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { createQuestionInputSchema } from "@workspace/db/schema";
import type { QuestionSnapshot } from "@workspace/db/schema";
import {
  answerKeys,
  normalizeSelection,
  revisionFeedback,
  revisionReview,
} from "./question-revisions";
import { validateStudioSave, saveStudioQuestion, studioReadiness } from "./question-studio";
const snapshot: QuestionSnapshot = {
  questionCode: "FIXTURE",
  topic: { id: "9d8bd104-2bc5-59c8-a417-367996c7d8b9", slug: "fixture", name: "Fixture" },
  type: "MULTIPLE_CHOICE_MULTIPLE",
  difficulty: "EASY",
  text: "Select two transport protocols",
  explanation: "UDP and TCP",
  imageKey: null,
  referenceNotes: null,
  options: [
    { optionKey: "A", text: "UDP", isCorrect: true },
    { optionKey: "B", text: "TCP", isCorrect: true },
    { optionKey: "C", text: "IP", isCorrect: false },
    { optionKey: "D", text: "Ethernet", isCorrect: false },
  ],
};
const { questionCode, topic, ...content } = snapshot;
const question = { ...content, topicId: topic.id, status: "ACTIVE" };
it("accepts both question types without accepting mismatched correct counts", () => {
  expect(createQuestionInputSchema.safeParse(question).success).toBe(true);
  expect(
    createQuestionInputSchema.safeParse({ ...question, type: "MULTIPLE_CHOICE_SINGLE" }).success,
  ).toBe(false);
  expect(
    createQuestionInputSchema.safeParse({
      ...question,
      options: question.options.map((o, i) => ({ ...o, isCorrect: i === 0 })),
    }).success,
  ).toBe(false);
  expect(
    createQuestionInputSchema.safeParse({
      ...question,
      type: "MULTIPLE_CHOICE_SINGLE",
      options: question.options.map((o, i) => ({ ...o, isCorrect: i === 0 })),
    }).success,
  ).toBe(true);
});
it.each([
  ["B", "A"],
  ["a", "b"],
  [" A ", "B"],
])("grades complete unordered answer set %j", (...keys) => {
  expect(revisionFeedback(snapshot, keys)).toMatchObject({
    isCorrect: true,
    correctOptions: [{ optionKey: "A" }, { optionKey: "B" }],
  });
  expect(normalizeSelection(snapshot, keys)).toBe('["A","B"]');
});
it.each([["A"], ["A", "A"], ["A", "Z"], ["A", "B", "C"], [], ["A", "b", "B"]])(
  "rejects invalid or incomplete set %j",
  (...keys) => expect(revisionFeedback(snapshot, keys)).toBeNull(),
);
it("requires exact set, not subset, superset or order; retains single feedback shape", () => {
  expect(revisionFeedback(snapshot, ["A", "C"])?.isCorrect).toBe(false);
  expect(
    revisionFeedback(
      {
        ...snapshot,
        type: "MULTIPLE_CHOICE_SINGLE",
        options: snapshot.options.map((o, i) => ({ ...o, isCorrect: i === 0 })),
      },
      "A",
    ),
  ).toEqual({
    isCorrect: true,
    correctOption: { optionKey: "A", text: "UDP" },
    explanation: "UDP and TCP",
  });
  expect(revisionReview(snapshot)).toMatchObject({
    requiredSelectionCount: 2,
    correctOptions: [{ optionKey: "A" }, { optionKey: "B" }],
  });
});
it.each(['["A",null]', '["A",{"key":"B"}]', '["A",1]', "[", "[]", '["A","A"]'])(
  "rejects malformed encoded set %s",
  (value) => expect(answerKeys(value)).toBeNull(),
);
it("permits incomplete owned session choices only for saving, never grading", () => {
  expect(normalizeSelection(snapshot, '["A"]', true)).toBe('["A"]');
  expect(normalizeSelection(snapshot, '["A"]')).toBeNull();
});
it("refuses mapping omission before opening a write transaction", async () => {
  const tx = vi.fn();
  await expect(
    saveStudioQuestion({ question, expectedToken: "a".repeat(64) }, topic.id, {
      transaction: tx,
    } as any),
  ).rejects.toMatchObject({ status: 400 });
  expect(tx).not.toHaveBeenCalled();
  expect(validateStudioSave({ question }).assignments).toEqual([]); // compatible new-question callers
});
it("readiness fails closed on missing catalog references and malformed answer configuration", async () => {
  const db: any = { transaction: async (fn: any) => fn(db), execute: async () => ({ rows: [] }) };
  expect(await studioReadiness({ draft: { question, assignments: [] } }, db)).toMatchObject({
    ready: false,
    blockers: ["Topic does not exist."],
  });
  expect(
    await studioReadiness(
      { draft: { question: { ...question, options: [] }, assignments: [] } },
      db,
    ),
  ).toMatchObject({ ready: false });
});

it("readiness always evaluates publication even when a caller supplies DISABLED", async () => {
  const transaction = vi.fn();
  const result = await studioReadiness(
    { draft: { question: { ...question, status: "DISABLED", explanation: "" }, assignments: [] } },
    { transaction } as any,
  );
  expect(result).toMatchObject({
    ready: false,
    blockers: ["Publication requires a useful answer explanation."],
  });
  expect(transaction).not.toHaveBeenCalled();
});
it("bounds multiple answer keys so canonical sets fit the unchanged key contract", () => {
  expect(
    createQuestionInputSchema.safeParse({
      ...question,
      options: question.options.map((o, i) => ({
        ...o,
        optionKey: i === 0 ? "A\\\\" : o.optionKey,
      })),
    }).success,
  ).toBe(false);
});
