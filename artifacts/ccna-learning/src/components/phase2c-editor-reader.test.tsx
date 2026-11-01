// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/core";
import {
  LessonFormattingToolbar,
  LessonRichEditor,
  lessonRichExtensions,
} from "./lesson-rich-editor";
import { createFormatStore, LessonFormatProvider } from "./lesson-format-context";
import { documentToRuns, runsToDocument } from "../lib/lesson-rich-text";
import { LessonContent, safeLessonImageUrl } from "./lesson-content";
import { VisualImageEditor, VisualTableEditor } from "./lesson-visual-blocks";
import { lessonInputSchema } from "../../../api-server/src/lib/lesson-validation";
import { moveLessonBlock, duplicateLessonBlock, newLessonBlock } from "./admin-lessons";
import {
  readingPercent,
  readingScrollRoot,
  measureReadingPosition,
  resumeReadingPosition,
  useReadingPosition,
  captureReadingAnchor,
  restoreReadingAnchor,
} from "../lib/reading-position";
import pack from "../../../../docs/content/ccna-200-301/chapter-1/chapter-1-content-pack.json";
import type { LessonBlock, LessonInput } from "@workspace/api-client-react";
// jsdom has no text-range layout; ProseMirror queries it when focus changes.
if (!Range.prototype.getClientRects)
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
if (!Range.prototype.getBoundingClientRect)
  Range.prototype.getBoundingClientRect = () => new DOMRect();
vi.mock("../lib/nexus", () => ({ useNexusIdentity: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const editors: Editor[] = [];
const roots: ReturnType<typeof createRoot>[] = [];
const create = (text = "TCP and UDP") => {
  const editor = new Editor({
    extensions: lessonRichExtensions(),
    content: runsToDocument([{ text }]),
  });
  editors.push(editor);
  return editor;
};
const mount = async (node: React.ReactNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
};
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const blockId = "55555555-5555-4555-8555-555555555555";
const input = (blocks: LessonBlock[]): LessonInput => ({
  chapterId: "44444444-4444-4444-8444-444444444444",
  title: "Test only",
  description: "",
  objectives: ["Explain TCP"],
  estimatedMinutes: 5,
  displayOrder: 0,
  blocks,
});

it.each([1, 2, 3, 4, 5, 6] as const)(
  "H%s survives validated draft JSON, reload and the published renderer without changing its ID",
  (level) => {
    const editor = create();
    editor.commands.setTextSelection({ from: 1, to: 4 });
    editor.commands.toggleBold();
    const runs = documentToRuns(editor.getJSON());
    const blocks: LessonBlock[] = [
      { id: blockId, type: "heading", level, text: "TCP and UDP", runs, direction: "rtl" },
    ];
    const saved = lessonInputSchema.parse(JSON.parse(JSON.stringify(input(blocks))));
    const html = renderToStaticMarkup(<LessonContent blocks={saved.blocks} />);
    expect(html).toContain(`<h${level}`);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`section-${blockId}`);
    expect(html).toContain("<strong>");
    expect(
      documentToRuns(
        runsToDocument(saved.blocks[0].type === "heading" ? saved.blocks[0].runs! : []),
      ),
    ).toEqual(runs);
  },
);
it("actual Tiptap H1-H6 commands update the persisted structured block and preview", async () => {
  let saved: LessonBlock = { id: blockId, type: "paragraph", text: "TCP" };
  function HeadingEditor() {
    const [block, setBlock] = useState(saved);
    if (!(block.type === "paragraph" || block.type === "heading")) return null;
    const update = (next: LessonBlock) => {
      saved = next;
      setBlock(next);
    };
    return (
      <LessonFormatProvider>
        <LessonFormattingToolbar />
        <LessonRichEditor
          block={block}
          update={update}
          runs={block.runs ?? [{ text: block.text }]}
          onChange={(runs) =>
            update({ ...block, runs, text: runs.map((run) => run.text).join("") })
          }
        />
        <article>
          <LessonContent blocks={[block]} />
        </article>
      </LessonFormatProvider>
    );
  }
  const host = await mount(<HeadingEditor />);
  const element = host.querySelector(".tiptap") as HTMLElement & { editor: Editor };
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    await act(async () => {
      element.editor.commands.setHeading({ level });
    });
    expect(saved).toMatchObject({ id: blockId, type: "heading", level, text: "TCP" });
    expect(host.querySelector(`article h${level}`)?.textContent).toBe("TCP");
    expect(lessonInputSchema.safeParse(input([saved])).success).toBe(true);
  }
  await act(async () => {
    element.editor.commands.setParagraph();
  });
  expect(saved.type).toBe("paragraph");
});
it("actual shared-toolbar H1 conversion preserves the mounted editor and marked text", async () => {
  let saved: LessonBlock = {id:blockId,type:"richText",runs:[{text:"Transport",bold:true}]};
  function Fixture() {
    const [block,setBlock]=useState(saved);
    if (!(block.type==="richText" || block.type==="heading" || block.type==="paragraph")) return null;
    const update=(next:LessonBlock)=>{ saved=next; setBlock(next); };
    return <LessonFormatProvider><LessonFormattingToolbar /><LessonRichEditor block={block} update={update} runs={block.runs ?? []} onChange={runs=>update({...block,runs})} /><LessonContent blocks={[block]} /></LessonFormatProvider>;
  }
  const host=await mount(<Fixture />);
  const editor=host.querySelector<HTMLElement>('[role="textbox"]')!;
  await act(async()=>editor.focus());
  const select=host.querySelector<HTMLSelectElement>('[aria-label="Text structure"]')!;
  await act(async()=>{select.value="1";select.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(saved).toMatchObject({type:"heading",level:1,text:"Transport",runs:[{text:"Transport",bold:true}]});
  expect(lessonInputSchema.safeParse(input([saved])).success).toBe(true);
  expect(host.querySelector("h1 strong")?.textContent).toBe("Transport");
});
it("does not submit an invalid overlength heading or erase its formatted text",async()=>{
  const text="Long technical explanation. ".repeat(20),editor=new Editor({extensions:lessonRichExtensions(true),content:runsToDocument([{text,bold:true}])}),store=createFormatStore(),update=vi.fn();editors.push(editor);
  store.activate({editor,getBlock:()=>({id:blockId,type:"richText",runs:[{text,bold:true}]}),update});
  const host=await mount(<LessonFormattingToolbar store={store}/>),select=host.querySelector<HTMLSelectElement>('[aria-label="Text structure"]')!;
  await act(async()=>{select.value="1";select.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(host.textContent).toContain("200 characters");expect(update).not.toHaveBeenCalled();expect(documentToRuns(editor.getJSON())).toEqual([{text,bold:true}]);
});
it("new inline marks round-trip instead of disappearing on save", () => {
  const editor = create();
  editor.commands.setTextSelection({ from: 1, to: 4 });
  editor.commands.toggleStrike();
  editor.commands.toggleMark("superscript");
  const runs = documentToRuns(editor.getJSON());
  expect(runs[0]).toMatchObject({ text: "TCP", strike: true, superscript: true });
  expect(documentToRuns(runsToDocument(runs))).toEqual(runs);
  const saved = lessonInputSchema.parse(input([{ id: blockId, type: "richText", runs }]));
  const html = renderToStaticMarkup(<LessonContent blocks={saved.blocks} />);
  expect(html).toContain("<s>");
  expect(html).toContain("<sup>");
  editor.commands.toggleMark("subscript");
  expect(documentToRuns(editor.getJSON())[0].superscript).toBeUndefined();
});
it("formatted list items persist with nesting and reject mismatched fallback text", () => {
  const list: LessonBlock = {
    id: blockId,
    type: "list",
    ordered: true,
    items: ["TCP", "UDP"],
    levels: [0, 1],
    itemRuns: [[{ text: "TCP", bold: true }], [{ text: "UDP", italic: true }]],
  };
  const saved = lessonInputSchema.parse(JSON.parse(JSON.stringify(input([list]))));
  const html = renderToStaticMarkup(<LessonContent blocks={saved.blocks} />);
  expect(html).toContain("<strong>");
  expect(html).toContain("<em>");
  expect(
    lessonInputSchema.safeParse(
      input([{ ...list, itemRuns: [[{ text: "Wrong" }], [{ text: "UDP" }]] }]),
    ).success,
  ).toBe(false);
});
it("one shared toolbar serves two text editors and clears for non-rich controls", async () => {
  const host = await mount(
    <LessonFormatProvider>
      <LessonFormattingToolbar />
      <LessonRichEditor runs={[{ text: "TCP" }]} onChange={() => {}} />
      <LessonRichEditor runs={[{ text: "UDP" }]} onChange={() => {}} />
      <input aria-label="CLI" />
    </LessonFormatProvider>,
  );
  expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
  const fields = host.querySelectorAll<HTMLElement>('[role="textbox"]');
  await act(async () => fields[0].focus());
  expect(host.querySelector('button[aria-label="Bold"]')).toBeTruthy();
  await act(async () => (host.querySelector('input[aria-label="CLI"]') as HTMLElement).focus());
  expect(host.querySelector('[role="toolbar"]')?.getAttribute("aria-disabled")).toBe("true");
});
it("toolbar formats only the active selected word and releases a removed editor", async () => {
  const first = create(),
    second = create("Ethernet"),
    store = createFormatStore();
  first.commands.setTextSelection({ from: 1, to: 4 });
  store.activate({ editor: first });
  const host = await mount(<LessonFormattingToolbar store={store} />);
  await act(async () =>
    (host.querySelector('button[aria-label="Bold"]') as HTMLButtonElement).click(),
  );
  expect(documentToRuns(first.getJSON())[0]).toEqual({ text: "TCP", bold: true });
  expect(documentToRuns(second.getJSON())).toEqual([{ text: "Ethernet" }]);
  await act(async () => {
    store.activate({ editor: second });
    store.release(first);
  });
  expect(store.get()?.editor).toBe(second);
  await act(async () => store.release(second));
  expect(host.querySelector('[role="toolbar"]')?.getAttribute("aria-disabled")).toBe("true");
});
it("shared text structure commands preserve selected-run formatting when creating a list", async () => {
  const editor = create("TCP\nUDP"),
    store = createFormatStore(),
    update = vi.fn();
  editor.commands.setTextSelection({ from: 1, to: 4 });
  editor.commands.toggleBold();
  store.activate({
    editor,
    getBlock: () => ({ id: blockId, type: "paragraph", text: "TCP\nUDP" }),
    update,
  });
  const host = await mount(<LessonFormattingToolbar store={store} />);
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Text structure"]')!;
  await act(async () => {
    select.value = "ordered";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(update.mock.calls[0][0]).toMatchObject({
    id: blockId,
    type: "list",
    ordered: true,
    items: ["TCP", "UDP"],
    itemRuns: [[{ text: "TCP", bold: true }], [{ text: "UDP" }]],
  });
  expect(lessonInputSchema.safeParse(input([update.mock.calls[0][0]])).success).toBe(true);
});
it("list commands use the active item's context without exposing incompatible heading controls", async () => {
  const editor = create(),
    store = createFormatStore(),
    setOrdered = vi.fn(),
    indent = vi.fn();
  store.activate({
    editor,
    getList: () => ({ ordered: false, canIndent: true, canOutdent: false, setOrdered, indent }),
  });
  const host = await mount(<LessonFormattingToolbar store={store} />);
  expect(host.querySelector('[aria-label="Text structure"]')).toBeNull();
  await act(async () =>
    (host.querySelector('[aria-label="Ordered list"]') as HTMLButtonElement).click(),
  );
  await act(async () =>
    (host.querySelector('[aria-label="Indent list item"]') as HTMLButtonElement).click(),
  );
  expect(setOrdered).toHaveBeenCalledWith(true);
  expect(indent).toHaveBeenCalledWith(1);
  expect(
    (host.querySelector('[aria-label="Outdent list item"]') as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("image validation distinguishes image resources from navigation, credentials and temporary/local URLs", () => {
  expect(safeLessonImageUrl("https://example.com/tcp.png")).toBe("https://example.com/tcp.png");
  for (const value of [
    "/topics",
    "/learn/chapters/abc",
    "data:image/png,abc",
    "blob:abc",
    "file:///C:/a.png",
    "https://u:p@example.com/a.png",
    "http://example.com/a.png",
  ])
    expect(safeLessonImageUrl(value)).toBeNull();
  expect(safeLessonImageUrl("http://example.com/a.png", true)).toBeTruthy();
});
it("an HTTPS image, alt, caption, sizing and alignment survive validation and reader rendering", async () => {
  const block: Extract<LessonBlock, { type: "image" }> = {
    id: blockId,
    type: "image",
    url: "https://example.com/tcp.png",
    alt: "TCP sequence diagram",
    caption: "Figure 1-7",
    width: "medium",
    alignment: "center",
  };
  const saved = lessonInputSchema.parse(JSON.parse(JSON.stringify(input([block]))));
  const host = await mount(<VisualImageEditor block={block} update={() => {}} />);
  expect((host.querySelector('input[inputmode="url"]') as HTMLInputElement).value).toBe(block.url);
  const html = renderToStaticMarkup(<LessonContent blocks={saved.blocks} />);
  expect(html).toContain('src="https://example.com/tcp.png"');
  expect(html).toContain("Figure 1-7");
  expect(html).toContain('alt="TCP sequence diagram"');
  expect(lessonInputSchema.safeParse(input([{ ...block, alt: "" }])).success).toBe(false);
  expect(lessonInputSchema.safeParse(input([{ ...block, url: "/topics" }])).success).toBe(false);
});
it("table cell navigation and contextual row/column operations preserve a rectangular grid", async () => {
  const block: Extract<LessonBlock, { type: "table" }> = {
    id: blockId,
    type: "table",
    headers: ["A", "B"],
    rows: [["TCP", "UDP"]],
  };
  const update = vi.fn();
  const host = await mount(<VisualTableEditor block={block} update={update} />);
  const fields = host.querySelectorAll<HTMLTextAreaElement>(".visual-table-scroll textarea");
  await act(async () => fields[0].focus());
  await act(async () =>
    fields[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(fields[1]);
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Column right")!.click(),
  );
  expect(update.mock.calls.at(-1)?.[0].rows[0]).toHaveLength(3);
});
it("insertion, duplication and reordering keep existing stable IDs and content", () => {
  const first = newLessonBlock("paragraph"),
    copy = duplicateLessonBlock(first),
    table = newLessonBlock("table");
  expect(copy.id).not.toBe(first.id);
  expect({ ...copy, id: first.id }).toEqual(first);
  expect(moveLessonBlock([first, copy, table], 2, -1).map((b) => b.id)).toEqual([
    first.id,
    table.id,
    copy.id,
  ]);
});
it("all six frozen Chapter 1 payloads remain valid with all 21 tables and 15 placeholders unchanged", () => {
  const before = JSON.stringify(pack);
  const lessons = (pack as unknown as { lessons: LessonInput[] }).lessons;
  // Pack entries include payload plus provenance; use the actual authoring payload.
  const payloads = lessons.map((l) => (l as unknown as { payload?: LessonInput }).payload ?? l);
  for (const payload of payloads) expect(lessonInputSchema.safeParse(payload).success).toBe(true);
  expect(payloads.flatMap((l) => l.blocks).filter((b) => b.type === "table")).toHaveLength(21);
  expect(
    payloads
      .flatMap((l) => l.blocks)
      .filter((b) => b.type === "callout" && b.text.includes("[IMAGE PLACEHOLDER]")),
  ).toHaveLength(15);
  expect(JSON.stringify(pack)).toBe(before);
});

it.each([
  [0, 2000, 0, 500, 0],
  [-750, 2000, 0, 500, 50],
  [-1500, 2000, 0, 500, 100],
  [90, 2000, 100, 500, 2 / 3],
  [0, 300, 0, 500, 100],
  [700, 300, 0, 500, 0],
  [0, 0, 0, 500, 0],
  [NaN, 300, 0, 500, 0],
])(
  "article-bound position handles clamping and short lessons (%s)",
  (top, height, viewTop, viewHeight, want) =>
    expect(readingPercent(top, height, viewTop, viewHeight)).toBeCloseTo(want),
);
it("measures nested scrolling and resumes only to a section inside this article", () => {
  const scroller = document.createElement("div"),
    article = document.createElement("article"),
    section = document.createElement("section");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "clientHeight", { value: 500 });
  Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
  scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  article.getBoundingClientRect = () => ({ top: -650, height: 2000 }) as DOMRect;
  section.dataset.sectionId = blockId;
  section.getBoundingClientRect = () => ({ top: 90 }) as DOMRect;
  section.scrollIntoView = vi.fn();
  section.innerHTML = "<h6>Heading</h6>";
  article.append(section);
  scroller.append(article);
  document.body.append(scroller);
  expect(readingScrollRoot(article)).toBe(scroller);
  expect(measureReadingPosition(article)).toEqual({ percent: 50, blockId, headingId: blockId });
  expect(resumeReadingPosition(article, blockId)).toBe(true);
  expect(section.scrollIntoView).toHaveBeenCalledOnce();
  expect(resumeReadingPosition(article, "unrelated")).toBe(false);
});
it("ignores an overflow:auto ancestor that grows with the article instead of scrolling",()=>{
  const container=document.createElement("div"),article=document.createElement("article");container.style.overflowY="auto";
  Object.defineProperties(container,{clientHeight:{value:3000},scrollHeight:{value:3000}});container.append(article);document.body.append(container);
  article.getBoundingClientRect=()=>({top:-500,height:2000} as DOMRect);
  expect(readingScrollRoot(article)).toBeNull();expect(measureReadingPosition(article).percent).toBeGreaterThan(0);
});
it("focus layout changes preserve the offset within the current section", () => {
  const scroller = document.createElement("div"),
    article = document.createElement("article"),
    block = document.createElement("section");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "clientHeight", { value: 500 });
  Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
  scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  article.getBoundingClientRect = () => ({ top: -650, height: 2000 }) as DOMRect;
  let blockTop = -90;
  block.dataset.sectionId = blockId;
  block.getBoundingClientRect = () => ({ top: blockTop }) as DOMRect;
  article.append(block);
  scroller.append(article);
  document.body.append(scroller);
  const anchor = captureReadingAnchor(article);
  expect(anchor?.offset).toBe(-190);
  blockTop = -20;
  restoreReadingAnchor(article, anchor);
  expect(scroller.scrollTop).toBe(70);
});
it("scroll, resize, focus-layout and route transitions measure locally and clean up observers", async () => {
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const requests = vi.spyOn(globalThis, "fetch");
  let top = 0;
  function Harness({ id, focus }: { id: string; focus: boolean }) {
    const ref = useRef<HTMLElement>(null);
    const position = useReadingPosition(ref, id, String(focus));
    return (
      <article
        ref={(node) => {
          ref.current = node;
          if (node) node.getBoundingClientRect = () => ({ top, height: 2000 }) as DOMRect;
        }}
      >
        <output>{Math.round(position.percent)}</output>
      </article>
    );
  }
  const host = await mount(<Harness id="first" focus={false} />),
    root = roots.at(-1)!;
  top = -500;
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
  expect(Number(host.querySelector("output")!.textContent)).toBeGreaterThan(0);
  top = -900;
  await act(async () => {
    resize();
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
  await act(async () => root.render(<Harness id="first" focus />));
  expect(disconnect).toHaveBeenCalled();
  top = 0;
  await act(async () => root.render(<Harness id="second" focus />));
  expect(host.querySelector("output")!.textContent).toBe("0");
  expect(requests).not.toHaveBeenCalled(); // Scrolling cannot save or mark completion.
});
