import { useState } from "react";
import { QuestionContent } from "./question-content";
import type { StudioForm } from "../lib/question-studio-form";
/** Text-only rendering mirrors the existing learner renderer. No HTML injection,
 * remote image request, delivery creation or attempt submission. */
export function TechnicalText({ text }: { text: string }) {
  return (
    <div className="studio-technical-text" dir="auto">
      <QuestionContent text={text} />
    </div>
  );
}
export function StudioPreview({ form }: { form: StudioForm }) {
  const [selected, setSelected] = useState<string[]>([]),
    [submitted, setSubmitted] = useState(false);
  const correct = form.options.filter((o) => o.isCorrect);
  const multiple = form.type === "MULTIPLE_CHOICE_MULTIPLE";
  return (
    <section className="studio-preview" aria-label="Local student preview">
      <h3>Student preview</h3>
      <p className="admin-muted">Local only. No learner attempt or practice delivery is created.</p>
      <TechnicalText text={form.text || "Your question text will appear here."} />
      <fieldset>
        <legend>
          {multiple ? `Choose ${form.requiredSelectionCount} answers` : "Choose one answer"}
        </legend>
        {form.options.map((o) => (
          <label key={o.optionKey}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name="preview-answer"
              checked={selected.includes(o.optionKey)}
              onChange={() => {
                setSelected((keys) =>
                  multiple
                    ? keys.includes(o.optionKey)
                      ? keys.filter((k) => k !== o.optionKey)
                      : [...keys, o.optionKey]
                    : [o.optionKey],
                );
                setSubmitted(false);
              }}
            />
            {o.optionKey}. <TechnicalText text={o.text || "Answer text"} />
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="button-primary"
        disabled={selected.length !== form.requiredSelectionCount}
        onClick={() => setSubmitted(true)}
      >
        Check preview answer
      </button>
      {submitted && (
        <div role="status">
          <strong>
            {selected.length === correct.length &&
            correct.every((o) => selected.includes(o.optionKey))
              ? "Correct"
              : "Incorrect"}
            {correct.length
              ? " \u00b7 Correct answer: " + correct.map((o) => o.optionKey).join(", ")
              : ""}
          </strong>
          <TechnicalText text={form.explanation || "No explanation provided yet."} />
        </div>
      )}
    </section>
  );
}
