import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionContent } from "./question-content";
it("renders fenced CLI and inline commands with whitespace while escaping unsafe HTML", () => {
  const html = renderToStaticMarkup(
    <QuestionContent
      text={
        "Run `show ip route`\n```ios\nRouter# show vlan\n  10  Users\n```\n<img src=x onerror=alert(1)>"
      }
    />,
  );
  expect(html).toContain("question-content-block");
  expect(html).toContain("  10  Users");
  expect(html).toContain("question-content-inline");
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("dangerouslySetInnerHTML");
});
it("keeps ordinary question text unchanged", () => {
  expect(renderToStaticMarkup(<QuestionContent text="Which route is selected?" />)).toContain(
    "Which route is selected?",
  );
});
