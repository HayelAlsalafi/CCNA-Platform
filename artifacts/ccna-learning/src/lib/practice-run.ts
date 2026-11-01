import type { PracticeQuestion, PracticeAnswerResult } from "@workspace/api-client-react";
export type PracticeItem = {
  question: PracticeQuestion;
  selected: string;
  flagged: boolean;
  result: PracticeAnswerResult | null;
};
export function practiceTotals(items: PracticeItem[]) {
  const answered = items.filter((i) => i.result !== null).length,
    correct = items.filter((i) => i.result?.isCorrect).length;
  return {
    total: items.length,
    answered,
    unanswered: items.length - answered,
    remaining: items.length - answered,
    correct,
    incorrect: answered - correct,
    flagged: items.filter((i) => i.flagged).length,
    progress: items.length ? Math.round((answered / items.length) * 100) : 0,
    score: items.length ? Math.round((correct / items.length) * 100) : 0,
  };
}
