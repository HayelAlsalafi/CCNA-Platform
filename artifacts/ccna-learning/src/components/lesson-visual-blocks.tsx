import {UiMessage} from "../i18n";
import { useI18n } from '../i18n';
import { lazy, Suspense, useState } from "react";
import type { LessonBlock } from "@workspace/api-client-react";
const LessonRichEditor = lazy(() =>
  import("./lesson-rich-editor").then((module) => ({ default: module.LessonRichEditor })),
);
const LessonMediaLibrary = lazy(() => import("./lesson-media-library").then(module=>({default:module.LessonMediaLibrary})));
import { LessonContent, safeLessonImageUrl } from "./lesson-content";
import { tableStructure, moveTableRow, type TableBlock } from "../lib/lesson-block-operations";
export function BlockAppearance({
  block,
  update,
}: {
  block: Extract<LessonBlock, { type: "richText" | "paragraph" | "heading" | "quote" | "callout" }>;
  update: (b: LessonBlock) => void;
}) {
  const { t: translateUi } = useI18n();
  const appearance = block.appearance ?? { version: 1 as const };
  const set = (patch: Partial<typeof appearance>) =>
    update({ ...block, appearance: { ...appearance, ...patch } });
  return (
    <details className="visual-style-panel">
      <summary>{translateUi("Block style · safe presets")}</summary>
      <div className="visual-style-grid">
        <label>
          {translateUi("Background")}<select
            value={appearance.background ?? "paper"}
            onChange={(e) => set({ background: e.target.value as typeof appearance.background })}
          >
            {["paper", "blue", "green", "yellow", "pink"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Border / accent")}<select
            value={appearance.accent ?? "accent"}
            onChange={(e) => set({ accent: e.target.value as typeof appearance.accent })}
          >
            {["default", "muted", "accent", "danger"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Padding")}<select
            value={appearance.padding ?? "cozy"}
            onChange={(e) => set({ padding: e.target.value as typeof appearance.padding })}
          >
            {["compact", "cozy", "roomy"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Spacing")}<select
            value={appearance.spacing ?? "normal"}
            onChange={(e) => set({ spacing: e.target.value as typeof appearance.spacing })}
          >
            {["compact", "normal", "airy"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={appearance.card ?? false}
            onChange={(e) => set({ card: e.target.checked })}
          />
          {translateUi("Card presentation")}</label>
        {block.type === "quote" && (
          <label>
            <input
              type="checkbox"
              checked={appearance.decoration ?? false}
              onChange={(e) => set({ decoration: e.target.checked })}
            />
            {translateUi("Quotation mark decoration")}</label>
        )}
      </div>
      <small>
        {translateUi("Preset foreground/background pairs meet normal-text contrast. Inline colors use the same approved palette.")}</small>
    </details>
  );
}
export function VisualListEditor({
  block,
  update,
  continueAt,
}: {
  block: Extract<LessonBlock, { type: "list" }>;
  update: (b: LessonBlock) => void;
  continueAt?: number;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const levels = block.levels ?? block.items.map(() => 0);
  const commit = (items: string[], depths: number[], itemRuns = block.itemRuns) => {
    for (let i = 0; i < depths.length; i++)
      depths[i] = i ? Math.min(depths[i], depths[i - 1] + 1) : 0;
    update({ ...block, items, levels: depths, ...(itemRuns ? { itemRuns } : {}) });
  };
  const insert = (at: number) => {
    if (block.items.length >= 100) return;
    const items = [...block.items],
      next = [...levels];
    items.splice(at + 1, 0, "");
    next.splice(at + 1, 0, levels[at]);
    const runs = block.itemRuns ? [...block.itemRuns] : undefined;
    runs?.splice(at + 1, 0, [{ text: "" }]);
    commit(items, next, runs);
    setTimeout(
      () =>
        document
          .getElementById(`list-${block.id}-${at + 1}`)
          ?.querySelector<HTMLElement>("[role=textbox]")
          ?.focus(),
      0,
    );
  };
  const indent = (at: number, direction: number) => {
    const next = [...levels];
    next[at] = Math.max(0, Math.min(at ? levels[at - 1] + 1 : 0, 4, next[at] + direction));
    commit([...block.items], next);
  };
  return (
    <div>
      <div className="visual-style-grid">
        <label>
          {translateUi("List type")}<select
            value={block.ordered ? "ordered" : "bullet"}
            onChange={(e) =>
              update({
                ...block,
                ordered: e.target.value === "ordered",
                numbering: e.target.value === "ordered" ? "decimal" : "disc",
              })
            }
          >
            <option value="ordered">{translateUi("Numbered")}</option>
            <option value="bullet">{translateUi("Bullets")}</option>
          </select>
        </label>
        <label>
          {translateUi("Marker style")}<select
            value={block.numbering ?? (block.ordered ? "decimal" : "disc")}
            onChange={(e) =>
              update({ ...block, numbering: e.target.value as typeof block.numbering })
            }
          >
            {(block.ordered
              ? ["decimal", "upper-alpha", "lower-alpha", "upper-roman", "lower-roman"]
              : ["disc", "circle", "square"]
            ).map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        {block.ordered && (
          <label>
            {translateUi("Start / continue at")}<input
              type="number"
              min={1}
              max={100000}
              value={block.start ?? 1}
              onChange={(e) => update({ ...block, start: Number(e.target.value) })}
            />
            <button type="button" onClick={() => update({ ...block, start: 1 })}>
              {translateUi("Restart at 1")}</button>
            {continueAt !== undefined && (
              <button
                type="button"
                disabled={continueAt > 100000}
                onClick={() => update({ ...block, start: continueAt })}
              >
                {translateUi("Continue previous numbered list")}</button>
            )}
          </label>
        )}
      </div>
      {block.items.map((item, i) => (
        <div
          className="visual-list-row"
          key={i}
          style={{ marginInlineStart: `${levels[i] * 16}px` }}
        >
          <span aria-hidden="true">{i + 1}.</span>
          <div
            id={`list-${block.id}-${i}`}
            className="visual-list-text"
            onKeyDownCapture={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                insert(i);
              }
              if (e.altKey && ["ArrowRight", "ArrowLeft"].includes(e.key)) {
                e.preventDefault();
                indent(i, e.key === "ArrowLeft" ? -1 : 1);
              }
            }}
          >
            <Suspense fallback={<p>{translateUi("Loading list text...")}</p>}>
              <LessonRichEditor
                label={translateUi("List item {value0}", {value0: String(i + 1)})}
                runs={block.itemRuns?.[i] ?? [{ text: item }]}
                listControls={{
                  ordered: block.ordered,
                  canIndent: i > 0 && levels[i] < Math.min(4, levels[i - 1] + 1),
                  canOutdent: levels[i] > 0,
                  setOrdered: (ordered) =>
                    update({ ...block, ordered, numbering: ordered ? "decimal" : "disc" }),
                  indent: (delta) => indent(i, delta),
                }}
                onChange={(runs) => {
                  const formatted = block.items.map((text, n) =>
                    n === i ? runs : (block.itemRuns?.[n] ?? [{ text }]),
                  );
                  commit(
                    block.items.map((text, n) =>
                      n === i ? runs.map((run) => run.text).join("") : text,
                    ),
                    [...levels],
                    formatted,
                  );
                }}
              />
            </Suspense>
          </div>
          <button
            type="button"
            aria-label={translateUi("Indent item {value0}", {value0: String(i + 1)})}
            disabled={!i || levels[i] >= Math.min(4, levels[i - 1] + 1)}
            onClick={() => indent(i, 1)}
          >
            {translateUi("Indent")}</button>
          <button
            type="button"
            aria-label={translateUi("Outdent item {value0}", {value0: String(i + 1)})}
            disabled={!levels[i]}
            onClick={() => indent(i, -1)}
          >
            {translateUi("Outdent")}</button>
          <button
            type="button"
            disabled={block.items.length <= 1}
            aria-label={translateUi("Remove item {value0}", {value0: String(i + 1)})}
            onClick={() =>
              commit(
                block.items.filter((_, n) => n !== i),
                levels.filter((_, n) => n !== i),
                block.itemRuns?.filter((_, n) => n !== i),
              )
            }
          >
            {translateUi("Remove")}</button>
        </div>
      ))}
      <button
        type="button"
        disabled={block.items.length >= 100}
        onClick={() => insert(block.items.length - 1)}
      >
        {translateUi("Add list item")}</button>
      <small>
        {translateUi("Enter adds an item. Tab moves between controls; Alt+Right / Alt+Left adjusts nesting. Indent buttons are always available.")}</small>
    </div>
  );
}
export function VisualTableEditor({
  block,
  update,
}: {
  block: TableBlock;
  update: (b: LessonBlock) => void;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const [selected, setSelected] = useState({ row: 0, column: 0 }),
    [rowCount, setRowCount] = useState(3),
    [columnCount, setColumnCount] = useState(3);
  const cell = block.cells?.find((c) => c.row === selected.row && c.column === selected.column);
  const style = (patch: Partial<NonNullable<TableBlock["cells"]>[number]>) =>
    update({
      ...block,
      cells: [
        ...(block.cells ?? []).filter(
          (c) => c.row !== selected.row || c.column !== selected.column,
        ),
        { ...selected, ...cell, ...patch },
      ],
    });
  const change = (next: TableBlock) => {
    setSelected({ row: 0, column: 0 });
    update(next);
  };
  return (
    <div className="visual-table-editor">
      <details>
        <summary>{translateUi("Insert / resize grid")}</summary>
        <label>
          {translateUi("Rows")}<input
            type="number"
            min={1}
            max={100}
            value={rowCount}
            onChange={(e) => setRowCount(Number(e.target.value))}
          />
        </label>
        <label>
          {translateUi("Columns")}<input
            type="number"
            min={1}
            max={12}
            value={columnCount}
            onChange={(e) => setColumnCount(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={
            !Number.isInteger(rowCount) ||
            rowCount < 1 ||
            rowCount > 100 ||
            !Number.isInteger(columnCount) ||
            columnCount < 1 ||
            columnCount > 12
          }
          onClick={() => {
            if (window.confirm("Replace this table grid? Undo can restore its content."))
              change({
                ...block,
                headers: Array(columnCount).fill("Heading"),
                rows: Array.from({ length: rowCount }, () => Array(columnCount).fill("")),
                cells: [],
              });
          }}
        >
          {translateUi("Create grid")}</button>
      </details>
      <small>
        {translateUi("Cells store plain text. Tab moves between controls; Alt + arrow keys move between cells. Use selected-cell controls for alignment and background.")}</small>
      <div
        className="visual-table-scroll"
        onKeyDown={(event) => {
          if (
            !event.altKey ||
            !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
          )
            return;
          const cells = [
            ...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
              "input, textarea",
            ),
          ];
          const at = cells.indexOf(event.target as HTMLInputElement);
          if (at < 0) return;
          event.preventDefault();
          const offset =
            event.key === "ArrowUp"
              ? -block.headers.length
              : event.key === "ArrowDown"
                ? block.headers.length
                : event.key === "ArrowLeft"
                  ? -1
                  : 1;
          cells[at + offset]?.focus();
        }}
      >
        <table>
          <caption>
            {translateUi("Editable reference table · select a cell for row, column and style actions")}</caption>
          <thead>
            <tr>
              {block.headers.map((v, c) => (
                <th
                  key={c}
                  scope="col"
                  className={`visual-bg-${block.cells?.find((s) => s.row === 0 && s.column === c)?.background ?? "paper"}`}
                  style={{
                    textAlign: block.cells?.find((s) => s.row === 0 && s.column === c)?.alignment,
                  }}
                >
                  <input
                    aria-label={translateUi("Column {value0} heading", {value0: String(c + 1)})}
                    value={v}
                    onFocus={() => setSelected({ row: 0, column: c })}
                    onChange={(e) =>
                      update({
                        ...block,
                        headers: block.headers.map((x, i) => (i === c ? e.target.value : x)),
                      })
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((v, c) => (
                  <td
                    key={c}
                    className={`visual-bg-${block.cells?.find((s) => s.row === r + 1 && s.column === c)?.background ?? "paper"}`}
                    style={{
                      textAlign: block.cells?.find((s) => s.row === r + 1 && s.column === c)
                        ?.alignment,
                    }}
                  >
                    <textarea
                      rows={2}
                      aria-label={translateUi("Row {value0}, column {value1}", {value0: String(r + 1), value1: String(c + 1)})}
                      dir="auto"
                      value={v}
                      onFocus={() => setSelected({ row: r + 1, column: c })}
                      onChange={(e) =>
                        update({
                          ...block,
                          rows: block.rows.map((x, i) =>
                            i === r ? x.map((y, j) => (j === c ? e.target.value : y)) : x,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {translateUi("Selected:")}{" "}{selected.row === 0 ? translateUi("heading") : translateUi("row {value0}", {value0: String(selected.row)})}{translateUi(", column")}{" "}
        {selected.column + 1}
      </p>
      <div className="lesson-row-actions">
        <button
          type="button"
          disabled={block.rows.length >= 100}
          onClick={() => change(tableStructure(block, "row", Math.max(0, selected.row - 1)))}
        >
          {translateUi("Row above")}</button>
        <button
          type="button"
          disabled={block.rows.length >= 100}
          onClick={() => change(tableStructure(block, "row", selected.row))}
        >
          {translateUi("Row below")}</button>
        <button
          type="button"
          disabled={selected.row === 0 || block.rows.length <= 1}
          onClick={() => change(tableStructure(block, "row", selected.row - 1, true))}
        >
          {translateUi("Delete row")}</button>
        <button
          type="button"
          disabled={selected.row <= 1}
          onClick={() => change(moveTableRow(block, selected.row - 1, -1))}
        >
          {translateUi("Move row up")}</button>
        <button
          type="button"
          disabled={selected.row === 0 || selected.row >= block.rows.length}
          onClick={() => change(moveTableRow(block, selected.row - 1, 1))}
        >
          {translateUi("Move row down")}</button>
        <button
          type="button"
          disabled={block.headers.length >= 12}
          onClick={() => change(tableStructure(block, "column", selected.column))}
        >
          {translateUi("Column left")}</button>
        <button
          type="button"
          disabled={block.headers.length >= 12}
          onClick={() => change(tableStructure(block, "column", selected.column + 1))}
        >
          {translateUi("Column right")}</button>
        <button
          type="button"
          disabled={block.headers.length <= 1}
          onClick={() => change(tableStructure(block, "column", selected.column, true))}
        >
          {translateUi("Delete column")}</button>
      </div>
      <div className="visual-style-grid">
        <label>
          <input
            type="checkbox"
            checked={block.headerRow !== false}
            onChange={(e) => update({ ...block, headerRow: e.target.checked })}
          />
          {translateUi("Header row")}</label>
        <label>
          <input
            type="checkbox"
            checked={block.headerColumn ?? false}
            onChange={(e) => update({ ...block, headerColumn: e.target.checked })}
          />
          {translateUi("Header column")}</label>
        <label>
          {translateUi("Selected cell background")}<select
            value={cell?.background ?? "paper"}
            onChange={(e) =>
              style({
                background: e.target.value as "paper" | "blue" | "green" | "yellow" | "pink",
              })
            }
          >
            {["paper", "blue", "green", "yellow", "pink"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Selected cell alignment")}<select
            value={cell?.alignment ?? "left"}
            onChange={(e) => style({ alignment: e.target.value as "left" | "center" | "right" })}
          >
            {["left", "center", "right"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Column widths")}<select
            value={block.columnWidth ?? "auto"}
            onChange={(e) =>
              update({ ...block, columnWidth: e.target.value as typeof block.columnWidth })
            }
          >
            {["auto", "equal", "wide-first"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
export function VisualImageEditor({
  block,
  update,
}: {
  block: Extract<LessonBlock, { type: "image" | "diagram" }>;
  update: (b: LessonBlock) => void;
}) {
  const { t: translateUi } = useI18n();
  const safe = safeLessonImageUrl(block.url),
    legacy = block.url.startsWith("http:");
  return (
    <div className="visual-image-editor">
      <Suspense fallback={<p role="status">{translateUi("Loading Media Library...")}</p>}><LessonMediaLibrary onInsert={image=>update({...block,url:image.url,caption:image.caption??block.caption,pixelWidth:image.width,pixelHeight:image.height})}/></Suspense>
      {safe && (
        <div className="visual-image-preview">
          <LessonContent blocks={[block]} />
        </div>
      )}
      <p>
        {translateUi("Upload or reuse an image through Media Library when storage is activated, or use a persistent HTTPS image URL. file:, data: and blob: URLs cannot be saved.")}</p>
      <label>
        {translateUi("Image source URL")}<input
          type="text"
          inputMode="url"
          dir="ltr"
          value={block.url}
          maxLength={2000}
          placeholder="https://example.com/image.png"
          onChange={(e) => update({ ...block, url: e.target.value.trim() })}
          aria-invalid={!!block.url && !safe}
        />
      </label>
      {block.url && !safe && (
        <p role="alert">
          {translateUi("Use an absolute HTTPS image URL without credentials or an existing approved lesson-media reference. A chapter link is not an image.")}</p>
      )}
      {legacy && (
        <p role="note">
          {translateUi("Legacy HTTP image: use HTTPS when replacing it to avoid mixed-content blocking.")}</p>
      )}
      <label>
        {translateUi("Alt text")}<input
          dir="auto"
          value={block.alt}
          maxLength={500}
          onChange={(e) => update({ ...block, alt: e.target.value })}
          aria-invalid={!block.decorative && !block.alt.trim()}
        />
      </label>
      {!block.decorative && !block.alt.trim() && (
        <small role="note">{translateUi("Describe the technical information conveyed by the image.")}</small>
      )}
      <label>
        {translateUi("Caption")}<input
          dir="auto"
          value={block.caption ?? ""}
          maxLength={1000}
          onChange={(e) => update({ ...block, caption: e.target.value })}
        />
      </label>
      <div className="visual-style-grid">
        <label>
          {translateUi("Alignment")}<select
            value={block.alignment ?? "center"}
            onChange={(e) =>
              update({ ...block, alignment: e.target.value as typeof block.alignment })
            }
          >
            {["left", "center", "right"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Width")}<select
            value={block.width ?? "full"}
            onChange={(e) => update({ ...block, width: e.target.value as typeof block.width })}
          >
            {["small", "medium", "wide", "full"].map((v) => (
              <option key={v} value={v}><UiMessage text={String(v)}/></option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={block.decorative ?? false}
            onChange={(e) => update({ ...block, decorative: e.target.checked })}
          />
          {translateUi("Decorative image")}</label>
      </div>
      <small>
        {translateUi("Replace the URL above to replace the image. Remove the block through Section actions. Caption and alt text remain plain text so saved formatting is never lost.")}</small>
    </div>
  );
}
export function VisualBlockEditor({
  block,
  update,
  previousBlocks = [],
}: {
  block: LessonBlock;
  update: (b: LessonBlock) => void;
  previousBlocks?: LessonBlock[];
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const field = (key: string, label: string, multiline = false) => (
    <label>
      <UiMessage text={label}/>
      {multiline ? (
        <textarea
          rows={4}
          dir={key === "url" || key === "language" || block.type === "code" ? "ltr" : "auto"}
          value={String((block as unknown as Record<string, unknown>)[key] ?? "")}
          onChange={(e) =>
            update({
              ...block,
              [key]:
                key === "url" && block.type === "labReference"
                  ? e.target.value || undefined
                  : e.target.value,
            } as LessonBlock)
          }
        />
      ) : (
        <input
          dir={key === "url" || key === "language" || block.type === "code" ? "ltr" : "auto"}
          value={String((block as unknown as Record<string, unknown>)[key] ?? "")}
          onChange={(e) =>
            update({
              ...block,
              [key]:
                key === "url" && block.type === "labReference"
                  ? e.target.value || undefined
                  : e.target.value,
            } as LessonBlock)
          }
        />
      )}
    </label>
  );
  if (["paragraph", "richText", "heading", "quote", "callout"].includes(block.type)) {
    const b = block as Extract<
      LessonBlock,
      { type: "paragraph" | "richText" | "heading" | "quote" | "callout" }
    >;
    return (
      <div className="lesson-fields">
        {b.type === "callout" && b.text.includes("[IMAGE PLACEHOLDER]") && (
          <p className="lesson-figure-placeholder-help">
            {translateUi("Planned figure: add an Image block immediately after this placeholder. Copy its figure number and source reference into the caption; remove the placeholder only in an explicitly saved draft. Published revisions stay unchanged until you publish.")}</p>
        )}
        <Suspense fallback={<p role="status">{translateUi("Loading visual text editor…")}</p>}>
          <LessonRichEditor
            block={b}
            update={update}
            label={translateUi("{value0} content", {value0: localizeUiLabel(String(b.type))})}
            runs={b.runs ?? [{ text: "text" in b ? b.text : "" }]}
            onChange={(runs) =>
              update(
                b.type === "richText"
                  ? { ...b, runs }
                  : { ...b, runs, text: runs.map((r) => r.text).join("") },
              )
            }
          />
        </Suspense>
        {b.type === "heading" && (
          <small>
            {translateUi("The lesson title is the primary heading. Prefer H2 for sections; H1-H6 are available in the shared toolbar.")}</small>
        )}
        {b.type === "quote" && field("attribution", "Attribution")}
        {b.type === "callout" && (
          <>
            <label>
              {translateUi("Callout type")}<select
                value={b.tone}
                onChange={(e) => update({ ...b, tone: e.target.value as typeof b.tone })}
              >
                {["note", "info", "tip", "important", "warning", "example"].map((v) => (
                  <option key={v} value={v}><UiMessage text={String(v)}/></option>
                ))}
              </select>
            </label>
            {field("title", "Optional title")}
            <label>
              <input
                type="checkbox"
                checked={b.showIcon !== false}
                onChange={(e) => update({ ...b, showIcon: e.target.checked })}
              />
              {translateUi("Semantic icon")}</label>
          </>
        )}
        <BlockAppearance block={b} update={update} />
      </div>
    );
  }
  if (block.type === "list") {
    const previous = [...previousBlocks].reverse().find((b) => b.type === "list" && b.ordered);
    const continueAt =
      previous?.type === "list"
        ? (previous.start ?? 1) +
          previous.items.filter((_, i) => (previous.levels?.[i] ?? 0) === 0).length
        : undefined;
    return <VisualListEditor block={block} update={update} continueAt={continueAt} />;
  }
  if (block.type === "table") return <VisualTableEditor block={block} update={update} />;
  if (block.type === "image" || block.type === "diagram")
    return <VisualImageEditor block={block} update={update} />;
  if (block.type === "code")
    return (
      <div className="lesson-fields">
        {field("text", "Cisco CLI · whitespace preserved", true)}
        {field("language", "Language label")}
        {field("explanation", "Command explanation", true)}
        <label>
          <input
            type="checkbox"
            checked={block.lineNumbers ?? false}
            onChange={(e) => update({ ...block, lineNumbers: e.target.checked })}
          />
          {translateUi("Show line numbers")}</label>
        <small>{translateUi("Plain code is preserved exactly; no emulator is run.")}</small>
      </div>
    );
  if (block.type === "knowledgeCheck")
    return (
      <div className="lesson-fields">
        {field("prompt", "Question", true)}
        {block.choices.map((choice, i) => (
          <div className="visual-list-row" key={i}>
            <input
              aria-label={translateUi("Correct choice {value0}", {value0: String(i + 1)})}
              type="radio"
              name={`correct-${block.id}`}
              checked={block.correctIndex === i}
              onChange={() => update({ ...block, correctIndex: i })}
            />
            <input
              aria-label={translateUi("Choice {value0}", {value0: String(i + 1)})}
              value={choice}
              onChange={(e) =>
                update({
                  ...block,
                  choices: block.choices.map((v, n) => (n === i ? e.target.value : v)),
                })
              }
            />
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const order = block.choices.map((text, index) => ({ text, index }));
                [order[i], order[i - 1]] = [order[i - 1], order[i]];
                update({
                  ...block,
                  choices: order.map((o) => o.text),
                  correctIndex: order.findIndex((o) => o.index === block.correctIndex),
                });
              }}
            >
              {translateUi("Move up")}</button>
            <button
              type="button"
              disabled={block.choices.length <= 2}
              onClick={() =>
                update({
                  ...block,
                  choices: block.choices.filter((_, n) => n !== i),
                  correctIndex:
                    block.correctIndex === i
                      ? 0
                      : block.correctIndex > i
                        ? block.correctIndex - 1
                        : block.correctIndex,
                })
              }
            >
              {translateUi("Remove choice")}</button>
          </div>
        ))}
        <button
          type="button"
          disabled={block.choices.length >= 8}
          onClick={() => update({ ...block, choices: [...block.choices, ""] })}
        >
          {translateUi("Add choice")}</button>
        {field("explanation", "Feedback explanation", true)}
        <small>{translateUi("Single-answer, local self-check only; no learner score is persisted.")}</small>
      </div>
    );
  if (block.type !== "labReference") return null;
  return (
    <div className="lesson-fields">
      {field("title", "Lab title")}
      {field("url", "Safe lab resource URL")}
      {field("description", "Lab introduction", true)}
      {(["objectives", "requirements", "steps"] as const).map((key) => (
        <fieldset key={key}>
          <legend><UiMessage text={key}/></legend>
          {(block[key] ?? []).map((v, i) => (
            <div className="visual-list-row" key={i}>
              <input
                aria-label={translateUi("{value0} {value1}", {value0: localizeUiLabel(String(key)), value1: String(i + 1)})}
                value={v}
                onChange={(e) =>
                  update({
                    ...block,
                    [key]: (block[key] ?? []).map((x, n) => (n === i ? e.target.value : x)),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  update({ ...block, [key]: (block[key] ?? []).filter((_, n) => n !== i) })
                }
              >
                {translateUi("Remove")}</button>
            </div>
          ))}
          <button
            type="button"
            disabled={(block[key]?.length ?? 0) >= (key === "steps" ? 50 : 30)}
            onClick={() => update({ ...block, [key]: [...(block[key] ?? []), ""] })}
          >
            {translateUi("Add")}{" "}{key === "steps" ? translateUi("step") : key === "objectives" ? translateUi("objective") : translateUi("requirement")}
          </button>
        </fieldset>
      ))}
      {field("expectedResults", "Expected results", true)}
    </div>
  );
}
