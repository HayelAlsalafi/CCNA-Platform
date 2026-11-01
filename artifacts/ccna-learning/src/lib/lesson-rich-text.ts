import type { JSONContent } from "@tiptap/core";
import type { LessonBlock } from "@workspace/api-client-react";
export type LessonRun = Extract<LessonBlock, { type: "richText" }>["runs"][number];
export const textColors = {
  default: "#172b3a",
  muted: "#475569",
  accent: "#0f6560",
  danger: "#9f1239",
} as const;
export const highlightColors = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
} as const;
export function safeRichPaste(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,style,iframe,object,embed,svg,math,img,video,audio")
    .forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((node) => {
    const element = node as HTMLElement;
    for (const attr of [...element.attributes])
      if (!["style", "href", "dir"].includes(attr.name)) element.removeAttribute(attr.name);
    if (element.hasAttribute("href") && !safeRichLink(element.getAttribute("href")!))
      element.removeAttribute("href");
    const style = element.style;
    const safe = ["font-weight", "font-style", "text-decoration", "text-decoration-line"];
    const allowed = (value: string, colors: Record<string, string>) =>
      Object.values(colors).some((hex) => {
        const probe = doc.createElement("span");
        probe.style.color = hex;
        return probe.style.color === value;
      });
    for (const key of Array.from(style))
      if (
        !safe.includes(key) &&
        !(key === "color" && allowed(style.color, textColors)) &&
        !(key === "background-color" && allowed(style.backgroundColor, highlightColors))
      )
        style.removeProperty(key);
  });
  return doc.body.innerHTML;
}
export function safeRichLink(value: string): boolean {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && !!u.hostname && !u.username && !u.password;
  } catch {
    return /^\/(api\/lesson-media\/[a-f0-9-]{36}|learn\/chapters\/[^\\\s]*|topics(?:[?#][^\\\s]*)?)$/.test(
      value,
    );
  }
}
export function runsToDocument(
  runs: LessonRun[],
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6,
): JSONContent {
  const content: JSONContent[] = [];
  for (const run of runs) {
    const marks: NonNullable<JSONContent["marks"]> = [];
    for (const name of [
      "bold",
      "italic",
      "underline",
      "strike",
      "superscript",
      "subscript",
      "code",
    ] as const)
      if (run[name]) marks.push({ type: name });
    if (run.href && safeRichLink(run.href)) marks.push({ type: "link", attrs: { href: run.href } });
    if (run.color || run.highlight)
      marks.push({
        type: "textStyle",
        attrs: {
          color: run.color ? textColors[run.color] : null,
          backgroundColor: run.highlight ? highlightColors[run.highlight] : null,
        },
      });
    run.text.split("\n").forEach((text, i) => {
      if (i) content.push({ type: "hardBreak" });
      if (text) content.push({ type: "text", text, marks });
    });
  }
  return {
    type: "doc",
    content: [
      {
        type: headingLevel ? "heading" : "paragraph",
        ...(headingLevel ? { attrs: { level: headingLevel } } : {}),
        content,
      },
    ],
  };
}
export function documentToRuns(doc: JSONContent): LessonRun[] {
  const runs: LessonRun[] = [];
  const add = (text: string, marks: JSONContent["marks"] = []) => {
    const run: LessonRun = { text };
    for (const mark of marks) {
      if (
        ["bold", "italic", "underline", "strike", "superscript", "subscript", "code"].includes(
          mark.type,
        )
      )
        Object.assign(run, { [mark.type]: true });
      if (
        mark.type === "link" &&
        typeof mark.attrs?.href === "string" &&
        safeRichLink(mark.attrs.href)
      )
        run.href = mark.attrs.href;
      if (mark.type === "textStyle") {
        const normalize = (v: unknown) =>
          String(v ?? "")
            .toLowerCase()
            .replace(/\s/g, "");
        const matches = (value: unknown, hex: string) => {
          const rgb = `rgb(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)})`;
          return [hex, rgb].includes(normalize(value));
        };
        for (const [key, color] of Object.entries(textColors))
          if (matches(mark.attrs?.color, color)) run.color = key as LessonRun["color"];
        for (const [key, color] of Object.entries(highlightColors))
          if (matches(mark.attrs?.backgroundColor, color))
            run.highlight = key as LessonRun["highlight"];
      }
    }
    const previous = runs.at(-1);
    const style = (r: LessonRun) => JSON.stringify({ ...r, text: "" });
    if (previous && style(previous) === style(run)) previous.text += text;
    else runs.push(run);
  };
  const walk = (node: JSONContent) => {
    if (node.type === "text") add(node.text ?? "", node.marks);
    else if (node.type === "hardBreak") add("\n");
    else
      node.content?.forEach((child, i) => {
        if (i && ["paragraph", "heading"].includes(child.type ?? "")) add("\n");
        walk(child);
      });
  };
  walk(doc);
  return runs.length ? runs : [{ text: "" }];
}
