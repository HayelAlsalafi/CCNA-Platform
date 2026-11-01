// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonRichEditor, lessonRichExtensions } from "./lesson-rich-editor";
import {
  documentToRuns,
  runsToDocument,
  safeRichPaste,
  textColors,
  highlightColors,
} from "../lib/lesson-rich-text";
import { tableStructure, moveTableRow, type TableBlock } from "../lib/lesson-block-operations";
import { LessonContent, safeLessonUrl } from "./lesson-content";
import { VisualListEditor } from "./lesson-visual-blocks";
import type { LessonBlock } from "@workspace/api-client-react";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("list keyboard controls indent without trapping Tab and Enter inserts an item", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function List() {
    const [block, setBlock] = useState<Extract<LessonBlock, { type: "list" }>>({
      id: "stable-list",
      type: "list",
      ordered: true,
      items: ["A", "B"],
    });
    return (
      <VisualListEditor
        continueAt={7}
        block={block}
        update={(b) => {
          if (b.type === "list") setBlock(b);
        }}
      />
    );
  }
  try {
    await act(async () => root.render(<List />));
    const continueButton = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Continue previous numbered list",
    )!;
    await act(async () => continueButton.click());
    expect((host.querySelector("input[type=number]") as HTMLInputElement).value).toBe("7");
    const second = host.querySelector('[aria-label="List item 2"]') as HTMLInputElement;
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    second.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    await act(async () => {
      second.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(second.closest(".visual-list-row")?.getAttribute("style")).toContain("16px");
    await act(async () => {
      second.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(host.querySelector('[aria-label="List item 3"]')).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});
const create = (runs: Parameters<typeof runsToDocument>[0]) =>
  (editor = new Editor({ extensions: lessonRichExtensions(), content: runsToDocument(runs) }));
it("formats the selected word through ProseMirror without changing surrounding text", () => {
  const e = create([{ text: "TCP and UDP" }]);
  e.commands.setTextSelection({ from: 1, to: 4 });
  e.commands.toggleBold();
  expect(documentToRuns(e.getJSON())).toEqual([{ text: "TCP", bold: true }, { text: " and UDP" }]);
});
it("preserves mixed formatting outside a selection and clears only the selected marks", () => {
  const e = create([
    { text: "TCP ", italic: true },
    { text: "and ", bold: true },
    { text: "UDP", underline: true },
  ]);
  e.commands.setTextSelection({ from: 5, to: 8 });
  e.commands.unsetAllMarks();
  expect(documentToRuns(e.getJSON())).toEqual([
    { text: "TCP ", italic: true },
    { text: "and" },
    { text: " ", bold: true },
    { text: "UDP", underline: true },
  ]);
});
it("selected color and highlight persist as approved tokens, not CSS/HTML", () => {
  const e = create([{ text: "TCP UDP" }]);
  e.commands.setTextSelection({ from: 5, to: 8 });
  e.commands.setColor(textColors.accent);
  e.commands.setBackgroundColor(highlightColors.yellow);
  const runs = documentToRuns(e.getJSON());
  expect(runs[0]).toEqual({ text: "TCP " });
  expect(runs[1]).toEqual({ text: "UDP", color: "accent", highlight: "yellow" });
});
it("supports actual framework undo and redo", () => {
  const e = create([{ text: "TCP" }]);
  e.commands.selectAll();
  e.commands.toggleBold();
  expect(documentToRuns(e.getJSON())[0].bold).toBe(true);
  expect(e.commands.undo()).toBe(true);
  expect(documentToRuns(e.getJSON())[0].bold).toBeUndefined();
  expect(e.commands.redo()).toBe(true);
  expect(documentToRuns(e.getJSON())[0].bold).toBe(true);
});
it("preserves English, Arabic, surrogate pairs and line breaks", () => {
  const runs = [{ text: "TCP بروتوكول 🧠\nالسطر الثاني", bold: true }];
  expect(
    documentToRuns(runsToDocument(runs))
      .map((r) => r.text)
      .join(""),
  ).toBe(runs[0].text);
  const e = create(runs);
  expect(e.getText()).toContain("السطر الثاني");
});
it("safe rich paste keeps common emphasis and removes active/unsupported content", () => {
  const html = safeRichPaste(
    '<p dir="rtl"><b>مرحبا</b><span style="color:#0f6560;font-size:100px" onclick="bad()">TCP</span><a href="javascript:bad()">bad</a><script>bad()</script><img src="x" onerror="bad()"></p>',
  );
  expect(html).toContain("<b>مرحبا</b>");
  expect(html).toContain("color:");
  expect(html).not.toMatch(/script|onclick|onerror|font-size|javascript:|<img/);
});
it("retains legacy rendering, stable anchors, semantic headings and NOTE meaning", () => {
  const blocks = [
    { id: "legacy", type: "paragraph" as const, text: "Existing content" },
    { id: "heading", type: "heading" as const, text: "Heading", level: 3 as const },
    { id: "note", type: "callout" as const, text: "Read this", tone: "note" as const },
  ];
  const before = JSON.stringify(blocks),
    html = renderToStaticMarkup(
      <article className="lesson-prose">
        <LessonContent blocks={blocks} />
      </article>,
    );
  expect(html).toContain("section-heading");
  expect(html).toContain("<h3");
  expect(html).toContain("Note");
  expect(JSON.stringify(blocks)).toBe(before);
});
it("renders numbered nested lists with native list semantics and restart values", () => {
  const html = renderToStaticMarkup(
    <LessonContent
      blocks={[
        {
          id: "list",
          type: "list",
          ordered: true,
          items: ["Parent", "Child", "Next"],
          levels: [0, 1, 0],
          numbering: "upper-roman",
          start: 4,
        },
      ]}
    />,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("ol")?.getAttribute("start")).toBe("4");
  expect(doc.querySelectorAll("ol")).toHaveLength(2);
  expect(doc.querySelector("li>ol")?.textContent).toBe("Child");
});
const table = (): TableBlock => ({
  id: "table",
  type: "table",
  headers: ["A", "B", "C"],
  rows: [
    ["1", "2", "3"],
    ["4", "5", "6"],
  ],
  cells: [{ row: 2, column: 1, background: "blue" }],
});
it("adds/deletes table rows and columns while preserving unaffected content and styles", () => {
  const original = table(),
    next = tableStructure(original, "column", 1);
  expect(next.headers).toEqual(["A", "Heading", "B", "C"]);
  expect(next.rows[1]).toEqual(["4", "", "5", "6"]);
  expect(next.cells?.[0].column).toBe(2);
  expect(original.headers).toHaveLength(3);
  const removed = tableStructure(next, "row", 0, true);
  expect(removed.rows).toEqual([["4", "", "5", "6"]]);
  expect(removed.cells?.[0].row).toBe(1);
});
it("moves a row together with its cell styles and refuses deleting the last row/column", () => {
  const moved = moveTableRow(table(), 1, -1);
  expect(moved.rows[0]).toEqual(["4", "5", "6"]);
  expect(moved.cells?.[0].row).toBe(1);
  const small: TableBlock = { id: "x", type: "table", headers: ["A"], rows: [["B"]] };
  expect(tableStructure(small, "row", 0, true)).toBe(small);
  expect(tableStructure(small, "column", 0, true)).toBe(small);
});
it("renders accessible row/column headers and responsive image sizing/captions", () => {
  const t = { ...table(), headerColumn: true };
  const html = renderToStaticMarkup(<LessonContent blocks={[t]} />);
  expect(html).toContain('scope="row"');
  expect(html).toContain('scope="col"');
  for (const url of [
    "https://#",
    "data:image/png;base64,abc",
    "javascript:bad()",
    "https://user:secret@example.com/x",
  ])
    expect(safeLessonUrl(url)).toBeNull();
  expect(safeLessonUrl("https://example.com/image.png?size=300#preview")).toBeTruthy();
});
it("all approved text/highlight combinations meet WCAG normal-text contrast", () => {
  const luminance = (hex: string) => {
    const v = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  for (const fg of Object.values(textColors))
    for (const bg of ["#ffffff", ...Object.values(highlightColors)]) {
      const a = luminance(fg),
        b = luminance(bg);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
});
it("preserves selection through toolbar actions and immediately updates the shared student preview", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Preview must not fetch or save"));
  const originalRects = Range.prototype.getClientRects,
    originalBounds = Range.prototype.getBoundingClientRect;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  function Workspace() {
    const [runs, setRuns] = useState([{ text: "TCP and UDP" }]);
    return (
      <>
        <LessonRichEditor runs={runs} onChange={setRuns} />
        <article>
          <LessonContent blocks={[{ id: "stable-id", type: "richText", runs }]} />
        </article>
      </>
    );
  }
  try {
    await act(async () => root.render(<Workspace />));
    const element = host.querySelector(".tiptap") as HTMLElement & { editor: Editor };
    expect(element).toBeTruthy();
    await act(async () => {
      element.editor.commands.setTextSelection({ from: 1, to: 4 });
    });
    const bold = host.querySelector('[aria-label="Bold"]') as HTMLButtonElement;
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    bold.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await act(async () => {
      bold.click();
    });
    expect(host.querySelector("article strong")?.textContent).toBe("TCP");
    expect(host.querySelector("article")?.textContent).toBe("TCP and UDP");
    expect(element.editor.state.selection.from).toBe(1);
    expect(element.editor.state.selection.to).toBe(4);
    expect(host.querySelector("[role=toolbar]")).toBeTruthy();
    expect(element.getAttribute("aria-multiline")).toBe("true");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    fetch.mockRestore();
    Range.prototype.getClientRects = originalRects;
    Range.prototype.getBoundingClientRect = originalBounds;
  }
});
