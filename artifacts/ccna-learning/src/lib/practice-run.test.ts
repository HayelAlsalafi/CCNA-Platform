import { expect, it } from "vitest";
import { practiceTotals, type PracticeItem } from "./practice-run";
it("counts confirmed submissions only, never navigation or merely selected answers", () => {
  const items = [
    { selected: "A", flagged: true, result: null },
    { selected: "B", flagged: false, result: { isCorrect: true } },
    { selected: "C", flagged: false, result: { isCorrect: false } },
  ] as PracticeItem[];
  expect(practiceTotals(items)).toEqual({
    total: 3,
    answered: 2,
    unanswered: 1,
    remaining: 1,
    correct: 1,
    incorrect: 1,
    flagged: 1,
    progress: 67,
    score: 33,
  });
});
it("handles an empty session without NaN", () =>
  expect(practiceTotals([])).toMatchObject({ score: 0, progress: 0, total: 0 }));
