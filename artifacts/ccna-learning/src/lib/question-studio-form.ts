import type { AdminQuestion, Assignment } from "@workspace/api-client-react";
export type StudioForm = {
  topicId: string;
  type: "MULTIPLE_CHOICE_SINGLE" | "MULTIPLE_CHOICE_MULTIPLE";
  requiredSelectionCount: number;
  text: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  explanation: string;
  referenceNotes: string;
  status: "ACTIVE" | "DISABLED";
  options: { optionKey: string; text: string; isCorrect: boolean }[];
  assignments: Assignment[];
};
export function newStudioForm(
  question?: AdminQuestion,
  assignments: Assignment[] = [],
): StudioForm {
  return {
    topicId: question?.topicId ?? "",
    type: question?.type ?? "MULTIPLE_CHOICE_SINGLE",
    requiredSelectionCount:
      question?.type === "MULTIPLE_CHOICE_MULTIPLE"
        ? question.options.filter((o) => o.isCorrect).length
        : 1,
    text: question?.text ?? "",
    difficulty: question?.difficulty ?? "MEDIUM",
    explanation: question?.explanation ?? "",
    referenceNotes: question?.referenceNotes ?? "",
    status: question?.status ?? "DISABLED",
    options:
      question?.options.map(({ optionKey, text, isCorrect }) => ({ optionKey, text, isCorrect })) ??
      ["A", "B", "C", "D"].map((optionKey) => ({ optionKey, text: "", isCorrect: false })),
    assignments,
  };
}
export function validateStudioForm(form: StudioForm, publish = false) {
  const errors: Record<string, string> = {};
  if (!form.topicId) errors.topicId = "Choose a topic.";
  if (!form.text.trim() || form.text.trim().length > 10000)
    errors.text = "Enter question text of 1–10,000 characters.";
  if (form.options.length < 2 || form.options.length > 10)
    errors.options = "Provide 2–10 answer choices.";
  const count = form.options.filter((o) => o.isCorrect).length;
  if (
    form.type === "MULTIPLE_CHOICE_SINGLE"
      ? count !== 1 || form.requiredSelectionCount !== 1
      : !Number.isInteger(form.requiredSelectionCount) ||
        form.requiredSelectionCount < 2 ||
        form.requiredSelectionCount > form.options.length ||
        count !== form.requiredSelectionCount
  )
    errors.options =
      form.type === "MULTIPLE_CHOICE_SINGLE"
        ? "Select exactly one correct answer."
        : "Select exactly the configured required number of correct answers (at least two).";
  form.options.forEach((o, i) => {
    if (!o.text.trim() || o.text.trim().length > 4000)
      errors["option-" + i] = "Enter answer text of 1–4,000 characters.";
  });
  const normalized = form.options.map((o) => o.text.trim().replace(/\s+/g, " ").toLowerCase());
  if (new Set(normalized).size !== normalized.length)
    errors.options = "Answer option text must be distinct.";
  if (form.explanation.length > 10000 || (publish && !form.explanation.trim()))
    errors.explanation = publish
      ? "Publication requires a useful technical explanation."
      : "Explanation must be at most 10,000 characters.";
  if (form.referenceNotes.length > 10000)
    errors.referenceNotes = "Reference notes must be at most 10,000 characters.";
  return errors;
}
export function studioCsv(
  rows: {
    questionCode: string;
    text: string;
    topicName: string;
    difficulty: string;
    status: string;
  }[],
) {
  const cell = (value: string) =>
    '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  return (
    "\uFEFF" +
    [
      ["Code", "Question preview", "Topic", "Difficulty", "Status"],
      ...rows.map((r) => [r.questionCode, r.text, r.topicName, r.difficulty, r.status]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
