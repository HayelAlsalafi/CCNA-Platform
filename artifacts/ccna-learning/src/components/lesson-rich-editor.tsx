import { useEffect, useRef, useState } from "react";
import { Mark } from "@tiptap/core";
import {
  createFormatStore,
  useFormatStore,
  useFormatTarget,
  type TextBlock,
  type ListControls,
} from "./lesson-format-context";
import type { LessonBlock } from "@workspace/api-client-react";
import {
  Bold,
  Italic,
  Underline,
  Code2,
  Strikethrough,
  Superscript,
  Subscript,
  Undo2,
  Redo2,
  Link2,
  Unlink,
  RemoveFormatting,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, BackgroundColor } from "@tiptap/extension-text-style";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  documentToRuns,
  runsToDocument,
  textColors,
  highlightColors,
  safeRichLink,
  safeRichPaste,
  type LessonRun,
} from "../lib/lesson-rich-text";
export const lessonRichExtensions = (allowHeadings = false) => [
  StarterKit.configure({
    heading: allowHeadings ? { levels: [1, 2, 3, 4, 5, 6] } : false,
    // A structured block owns one editable node; the document-wide trailing
    // paragraph plugin would otherwise append unsaved whitespace to headings.
    trailingNode: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false, isAllowedUri: (url) => safeRichLink(url) },
  }),
  TextStyle,
  Color,
  BackgroundColor,
  ...["superscript", "subscript"].map((name) =>
    Mark.create({
      name,
      excludes: name === "superscript" ? "subscript" : "superscript",
      parseHTML: () => [{ tag: name === "superscript" ? "sup" : "sub" }],
      renderHTML: () => [name === "superscript" ? "sup" : "sub", 0],
    }),
  ),
];
export function LessonRichEditor({
  runs,
  onChange,
  label = "Formatted content",
  block,
  update,
  listControls,
}: {
  runs: LessonRun[];
  onChange: (runs: LessonRun[]) => void;
  label?: string;
  block?: TextBlock;
  update?: (block: LessonBlock) => void;
  listControls?: ListControls;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const shared = useFormatStore();
  const [local] = useState(createFormatStore);
  const store = shared ?? local;
  const descriptor = useRef({ block, update, listControls });
  descriptor.current = { block, update, listControls };
  const direction = block?.direction ?? "auto";
  const headingLevel = block?.type === "heading" ? block.level : undefined;
  const [version, setVersion] = useState(0);
  const editor = useEditor({
    extensions: lessonRichExtensions(!!block && block.type !== "callout"),
    content: runsToDocument(runs, headingLevel),
    editorProps: {
      transformPastedHTML: safeRichPaste,
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        dir: direction,
        style: `text-align: ${block?.alignment ?? "start"}`,
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          view.dispatch(
            view.state.tr.replaceSelectionWith(view.state.schema.nodes.hardBreak.create()),
          );
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON(),
        runs = documentToRuns(doc),
        current = descriptor.current;
      const node = doc.content?.[0],
        original = current.block;
      // Tiptap heading shortcuts update the structured block as well as its
      // editable node. A heading can never exist only in transient editor HTML.
      if (
        original &&
        current.update &&
        original.type !== "callout" &&
        (node?.type === "heading" || original.type === "heading")
      ) {
        const common = {
          id: original.id,
          runs,
          text: runs.map((run) => run.text).join(""),
          alignment: original.alignment,
          direction: original.direction,
          appearance: original.appearance,
        };
        current.update(
          node?.type === "heading"
            ? { ...common, type: "heading", level: node.attrs?.level as 1 | 2 | 3 | 4 | 5 | 6 }
            : { ...common, type: "paragraph" },
        );
      } else change.current(runs);
    },
    onFocus: ({ editor }) =>
      store.activate({
        editor,
        getBlock: block ? () => descriptor.current.block! : undefined,
        update: (next) => descriptor.current.update?.(next),
        getList: listControls ? () => descriptor.current.listControls! : undefined,
      }),
    onTransaction: ({ editor }) => {
      if (store.get()?.editor === editor) store.refresh();
    },
  });
  useEffect(() => {
    if (editor && !shared) store.activate({ editor });
  }, [editor, shared, store]);
  useEffect(
    () => () => {
      if (editor) store.release(editor);
    },
    [editor, store],
  );
  useEffect(() => {
    if (store.get()?.editor === editor) store.refresh();
  }, [block, listControls, editor, store]);
  useEffect(() => {
    const node = editor?.getJSON().content?.[0];
    if (
      editor &&
      (JSON.stringify(documentToRuns(editor.getJSON())) !== JSON.stringify(runs) ||
        (headingLevel
          ? node?.type !== "heading" || node.attrs?.level !== headingLevel
          : node?.type === "heading"))
    ) {
      // A lesson-level undo/reload replaces this document. Reset its local undo
      // stack so a stale text undo cannot resurrect content from another snapshot.
      const doc = editor.schema.nodeFromJSON(runsToDocument(runs, headingLevel));
      const position = Math.min(editor.state.selection.from, doc.content.size);
      editor.view.updateState(
        EditorState.create({
          doc,
          plugins: editor.state.plugins,
          selection: TextSelection.near(doc.resolve(position)),
        }),
      );
      setVersion((v) => v + 1);
    }
  }, [editor, runs, headingLevel]);
  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          role: "textbox",
          "aria-label": label,
          "aria-multiline": "true",
          dir: direction,
          style: `text-align: ${block?.alignment ?? "start"}`,
        },
      },
    });
  }, [editor, direction, label, block?.alignment]);
  if (!editor) return <p>Loading text editor…</p>;
  return (
    <div className="visual-rich-editor" data-transaction={version}>
      {!shared && <LessonFormattingToolbar store={local} />}
      <EditorContent editor={editor} />
      <small>
        Select text to format. Ctrl/Cmd+B, I, U; Ctrl/Cmd+Z to undo. Paste keeps supported marks;
        unsupported content is discarded.
      </small>
      {(runs.length > 100 || runs.reduce((n, r) => n + r.text.length, 0) > 20000) && (
        <p role="alert">
          This text exceeds the lesson limit (100 segments / 20,000 characters). Shorten it before
          saving.
        </p>
      )}
    </div>
  );
}

export function LessonFormattingToolbar({
  store: explicit,
}: {
  store?: ReturnType<typeof createFormatStore>;
}) {
  const shared = useFormatStore();
  const [fallback] = useState(createFormatStore);
  const store = explicit ?? shared ?? fallback;
  const target = useFormatTarget(store);
  const [linkError, setLinkError] = useState("");
  if (!target)
    return (
      <div
        className="visual-format-toolbar"
        role="toolbar"
        aria-label="Selection formatting"
        aria-disabled="true"
      >
        <span>
          Select text in a content block to format it. Tables, images and CLI use contextual
          controls.
        </span>
      </div>
    );
  const { editor } = target,
    block = target.getBlock?.(),
    direction = block?.direction ?? "auto",
    list = target.getList?.();
  const paletteValue = (attribute: string, palette: Record<string, string>) => {
    const value = String(editor.getAttributes("textStyle")[attribute] ?? "")
      .toLowerCase()
      .replace(/\s/g, "");
    return (
      Object.entries(palette).find(
        ([, hex]) =>
          value === hex ||
          value ===
            `rgb(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)})`,
      )?.[0] ?? ""
    );
  };
  const icons = {
    Bold,
    Italic,
    Underline,
    "Inline code": Code2,
    Strikethrough,
    Superscript,
    Subscript,
    "Undo text": Undo2,
    "Redo text": Redo2,
    Link: Link2,
    "Remove link": Unlink,
    "Clear formatting": RemoveFormatting,
  };
  const button = (name: string, action: () => void, active?: boolean, disabled = false) => (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      {(() => {
        const Icon = icons[name as keyof typeof icons];
        return Icon ? <Icon size={16} aria-hidden="true" /> : name;
      })()}
    </button>
  );
  return (
    <div
      className="visual-format-toolbar"
      role="toolbar"
      aria-label="Selection formatting"
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).tagName !== "BUTTON" ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ];
        const index = controls.indexOf(event.target as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? controls.length - 1
              : (index + (event.key === "ArrowLeft" ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault();
        controls[next]?.focus();
      }}
    >
      {block && (
        <label>
          Text structure
          <select
            aria-label="Text structure"
            value={block.type === "heading" ? String(block.level) : block.type}
            disabled={block.type === "callout"}
            onChange={(event) => {
              if (!target.update) return;
              const value = event.target.value,
                runs = documentToRuns(editor.getJSON()),
                text = runs.map((r) => r.text).join("");
              const common = {
                id: block.id,
                runs,
                alignment: block.alignment,
                direction: block.direction,
                appearance: block.appearance,
              };
              if (value === "ordered" || value === "unordered") {
                const itemRuns: LessonRun[][] = [[]];
                for (const run of runs)
                  run.text.split("\n").forEach((part, index) => {
                    if (index) itemRuns.push([]);
                    if (part) itemRuns.at(-1)!.push({ ...run, text: part });
                  });
                if (itemRuns.length > 100) {
                  setLinkError(
                    "A list supports up to 100 items. Split this text into smaller blocks first.",
                  );
                  return;
                }
                target.update({
                  id: block.id,
                  type: "list",
                  ordered: value === "ordered",
                  items: itemRuns.map((parts) => parts.map((run) => run.text).join("")),
                  itemRuns: itemRuns.map((parts) => (parts.length ? parts : [{ text: "" }])),
                });
              } else if (value === "richText") target.update({ ...common, type: "richText" });
              else if (value === "quote") target.update({ ...common, type: "quote", text });
              else if (value === "paragraph") target.update({ ...common, type: "paragraph", text });
              else {
                const level = Number(value);
                if (![1,2,3,4,5,6].includes(level)) return;
                if (text.length > 200) {
                  setLinkError("Headings support up to 200 characters. This block is longer; move the heading text into its own block first. Your text and formatting have been kept.");
                  return;
                }
                setLinkError("");
                // The node command is the same path as keyboard headings and
                // preserves selection/marks; do not swap EditorState manually.
                editor.chain().focus().setHeading({level: level as 1|2|3|4|5|6}).run();
              }
            }}
          >
            <option value="richText">Formatted text</option>
            <option value="paragraph">Paragraph</option>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <option key={level} value={level}>
                H{level}
              </option>
            ))}
            <option value="quote">Blockquote</option>
            <option value="callout" disabled>
              Callout
            </option>
            <option value="ordered">Ordered list</option>
            <option value="unordered">Unordered list</option>
          </select>
        </label>
      )}
      {list && (
        <div role="group" aria-label="List structure" className="visual-toolbar-group">
          {button("Ordered list", () => list.setOrdered(true), list.ordered)}
          {button("Unordered list", () => list.setOrdered(false), !list.ordered)}
          {button("Indent list item", () => list.indent(1), undefined, !list.canIndent)}
          {button("Outdent list item", () => list.indent(-1), undefined, !list.canOutdent)}
        </div>
      )}
      <div role="group" aria-label="Links" className="visual-toolbar-group">
        {button(
          "Link",
          () => {
            const href = window.prompt(
              "Link URL (HTTP/HTTPS or approved learning link)",
              editor.getAttributes("link").href ?? "",
            );
            if (href === null) return;
            if (!safeRichLink(href)) {
              setLinkError(
                "Use a valid HTTP(S) URL without credentials or an approved learning link.",
              );
              return;
            }
            setLinkError("");
            const chain = editor.chain().focus();
            if (editor.state.selection.empty && editor.isActive("link"))
              chain.extendMarkRange("link");
            chain.setLink({ href }).run();
          },
          editor.isActive("link"),
        )}
        {button(
          "Remove link",
          () => {
            const chain = editor.chain().focus();
            if (editor.state.selection.empty) chain.extendMarkRange("link");
            chain.unsetLink().run();
          },
          undefined,
          !editor.isActive("link"),
        )}
      </div>
      <div role="group" aria-label="Text emphasis" className="visual-toolbar-group">
        {button("Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {button(
          "Italic",
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {button(
          "Underline",
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive("underline"),
        )}
        {button(
          "Strikethrough",
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        {button(
          "Superscript",
          () => editor.chain().focus().toggleMark("superscript").run(),
          editor.isActive("superscript"),
        )}
        {button(
          "Subscript",
          () => editor.chain().focus().toggleMark("subscript").run(),
          editor.isActive("subscript"),
        )}
        {button(
          "Inline code",
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive("code"),
        )}
      </div>
      <div role="group" aria-label="Text appearance" className="visual-toolbar-group">
        <label>
          Text color
          <select
            aria-label="Selection text color"
            value={paletteValue("color", textColors)}
            onChange={(e) => {
              if (e.target.value)
                editor
                  .chain()
                  .focus()
                  .setColor(textColors[e.target.value as keyof typeof textColors])
                  .run();
              else editor.chain().focus().unsetColor().run();
            }}
          >
            <option value="">Inherit text color</option>
            {Object.keys(textColors).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Highlight
          <select
            aria-label="Selection highlight color"
            value={paletteValue("backgroundColor", highlightColors)}
            onChange={(e) => {
              if (e.target.value)
                editor
                  .chain()
                  .focus()
                  .setBackgroundColor(
                    highlightColors[e.target.value as keyof typeof highlightColors],
                  )
                  .run();
              else editor.chain().focus().unsetBackgroundColor().run();
            }}
          >
            <option value="">No highlight</option>
            {Object.keys(highlightColors).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {button("Clear formatting", () => editor.chain().focus().unsetAllMarks().run())}
      </div>
      {block && (
        <label>
          Alignment
          <select
            aria-label="Text alignment"
            value={block.alignment ?? "left"}
            onChange={(e) =>
              target.update?.({
                ...block,
                alignment: e.target.value as "left" | "center" | "right",
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      )}
      <div role="group" aria-label="Text history and direction" className="visual-toolbar-group">
        {button(
          "Undo text",
          () => editor.chain().focus().undo().run(),
          undefined,
          !editor.can().undo(),
        )}
        {button(
          "Redo text",
          () => editor.chain().focus().redo().run(),
          undefined,
          !editor.can().redo(),
        )}
        <label>
          Direction
          <select
            value={direction}
            disabled={!block}
            onChange={(e) =>
              block &&
              target.update?.({ ...block, direction: e.target.value as "auto" | "ltr" | "rtl" })
            }
          >
            <option value="auto">Auto</option>
            <option value="ltr">English / LTR</option>
            <option value="rtl">Arabic / RTL</option>
          </select>
        </label>
      </div>
      {linkError && <span role="alert">{linkError}</span>}
    </div>
  );
}
