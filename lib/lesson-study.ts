/** Shared, deterministic text anchors. Never reattach to a different revision. */
export type TextAnchor = { blockId: string; start: number; end: number; quote: string };
type TextBlock = { id: string; type: string; text?: string; runs?: { text: string }[] };
export function studyText(block: TextBlock): string | null {
  if (["paragraph", "heading", "quote"].includes(block.type)) return block.text ?? "";
  if (block.type === "richText") return block.runs?.map((run) => run.text).join("") ?? "";
  if (block.type === "callout")
    return block.runs?.map((run) => run.text).join("") ?? block.text ?? "";
  return null;
}
export function validAnchor(anchor: TextAnchor, blocks: TextBlock[]) {
  const block = blocks.find((item) => item.id === anchor.blockId),
    text = block ? studyText(block) : null;
  if (block && anchor.start === 0 && anchor.end === 0 && anchor.quote === "") return true;
  return (
    text !== null &&
    Number.isInteger(anchor.start) &&
    Number.isInteger(anchor.end) &&
    anchor.start >= 0 &&
    anchor.end > anchor.start &&
    anchor.end <= text.length &&
    text.slice(anchor.start, anchor.end) === anchor.quote
  );
}
export function completionPercent(completed: number, total: number) {
  return total > 0 ? Math.round((Math.min(total, Math.max(0, completed)) / total) * 100) : 0;
}
