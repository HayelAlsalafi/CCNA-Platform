import { it, expect } from "vitest";
import { lessonBlockSchema, lessonInputSchema } from "./lesson-validation";
const id = "11111111-1111-4111-8111-111111111111";
it("accepts old published blocks unchanged without presentation migration", () => {
  for (const block of [
    { id, type: "paragraph", text: "Old" },
    { id, type: "heading", level: 2, text: "Old" },
    { id, type: "table", headers: ["A"], rows: [["B"]] },
    { id, type: "list", ordered: true, items: ["One"] },
  ])
    expect(lessonBlockSchema.parse(block)).toEqual(block);
});
it("validates versioned optional presentation and NOTE without changing IDs", () => {
  const block = {
    id,
    type: "callout",
    tone: "note",
    text: " TCP\nUDP ",
    runs: [{ text: " TCP\nUDP ", bold: true }],
    appearance: { version: 1, background: "blue", card: true },
  };
  expect(lessonBlockSchema.parse(block)).toEqual(block);
  expect(lessonBlockSchema.safeParse({ ...block, appearance: { version: 2 } }).success).toBe(false);
});
it("rejects arbitrary colors, CSS, HTML attributes and mismatched fallback text", () => {
  for (const block of [
    { id, type: "paragraph", text: "TCP", runs: [{ text: "UDP" }] },
    { id, type: "richText", runs: [{ text: "TCP", color: "red" }] },
    {
      id,
      type: "paragraph",
      text: "TCP",
      appearance: { version: 1, background: "url(javascript:x)" },
    },
    { id, type: "paragraph", text: "TCP", onclick: "bad()" },
  ])
    expect(lessonBlockSchema.safeParse(block).success).toBe(false);
});
it("rejects malformed list nesting and invalid table cell styles", () => {
  for (const levels of [[1, 1], [0, 2], [0]])
    expect(
      lessonBlockSchema.safeParse({ id, type: "list", ordered: false, items: ["A", "B"], levels })
        .success,
    ).toBe(false);
  expect(
    lessonBlockSchema.safeParse({
      id,
      type: "table",
      headers: ["A"],
      rows: [["B"]],
      cells: [{ row: 2, column: 0 }],
    }).success,
  ).toBe(false);
});
it("keeps one stable ID per block and rejects duplicates in a draft", () => {
  const block = { id, type: "paragraph", text: "TCP" };
  expect(
    lessonInputSchema.safeParse({
      chapterId: id,
      title: "Title",
      description: "",
      objectives: [],
      estimatedMinutes: 5,
      displayOrder: 0,
      blocks: [block, block],
    }).success,
  ).toBe(false);
});
