import "../question-content.css";
/** Deliberately small text renderer: fenced CLI/code and inline commands only.
 * React escapes every source string. No HTML, executable Markdown, links,
 * image requests or arbitrary attributes are accepted. */
export function QuestionContent({ text }: { text: string }) {
  const parts = text.split(/(```[^\n`]*\n[\s\S]*?```)/g);
  return (
    <span className="question-content">
      {parts.map((part, index) =>
        part.startsWith("```") ? (
          <code className="question-content-block" key={index}>
            {part.replace(/^```[^\n`]*\n/, "").replace(/```$/, "")}
          </code>
        ) : (
          <span key={index}>
            {part.split(/(`[^`\n]+`)/g).map((fragment, i) =>
              fragment.startsWith("`") && fragment.endsWith("`") ? (
                <code className="question-content-inline" key={i}>
                  {fragment.slice(1, -1)}
                </code>
              ) : (
                fragment
              ),
            )}
          </span>
        ),
      )}
    </span>
  );
}
