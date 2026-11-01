import type { LessonBlock } from "@workspace/api-client-react";
export type TableBlock = Extract<LessonBlock, { type: "table" }>;
export function tableStructure(
  block: TableBlock,
  axis: "row" | "column",
  at: number,
  remove = false,
): TableBlock {
  const count = axis === "row" ? block.rows.length : block.headers.length;
  if (
    at < 0 ||
    at > (remove ? count - 1 : count) ||
    (remove && count <= 1) ||
    (!remove && count >= (axis === "row" ? 100 : 12))
  )
    return block;
  const next = structuredClone(block);
  if (axis === "row") {
    if (remove) next.rows.splice(at, 1);
    else next.rows.splice(at, 0, Array(block.headers.length).fill(""));
  } else {
    if (remove) {
      next.headers.splice(at, 1);
      next.rows.forEach((r) => r.splice(at, 1));
    } else {
      next.headers.splice(at, 0, "Heading");
      next.rows.forEach((r) => r.splice(at, 0, ""));
    }
  }
  next.cells = block.cells?.flatMap((cell) => {
    const position = axis === "row" ? cell.row - 1 : cell.column;
    if (axis === "row" && cell.row === 0) return [cell];
    if (remove && position === at) return [];
    return [
      {
        ...cell,
        [axis === "row" ? "row" : "column"]:
          (axis === "row" ? cell.row : cell.column) + (position >= at ? (remove ? -1 : 1) : 0),
      },
    ];
  });
  return next;
}
export function moveTableRow(block: TableBlock, at: number, direction: number): TableBlock {
  const target = at + direction;
  if (at < 0 || target < 0 || target >= block.rows.length) return block;
  const next = structuredClone(block);
  [next.rows[at], next.rows[target]] = [next.rows[target], next.rows[at]];
  next.cells = next.cells?.map((c) => ({
    ...c,
    row: c.row === at + 1 ? target + 1 : c.row === target + 1 ? at + 1 : c.row,
  }));
  return next;
}
