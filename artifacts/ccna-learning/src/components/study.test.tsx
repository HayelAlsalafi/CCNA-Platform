// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  setAuthTokenGetter,
  type LessonPublished,
  type StudyAnnotation,
} from "@workspace/api-client-react";
import { LessonReader } from "../pages/lesson-reader";
import { LessonContent, safeLessonUrl } from "./lesson-content";
import { LessonImageUpload } from "./lesson-image-upload";
import { AdminSessionBoundary } from "./admin-session-boundary";
import { newLessonBlock, duplicateLessonBlock } from "./admin-lessons";
import { editHistory } from "../lib/lesson-history";
const auth = { isLoaded: true, isSignedIn: true, userId: "learner-a", sessionId: "study-session" };
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
const lessonId = "22222222-2222-4222-8222-222222222222",
  revisionId = "33333333-3333-4333-8333-333333333333",
  chapterId = "44444444-4444-4444-8444-444444444444",
  blockId = "55555555-5555-4555-8555-555555555555";
const lesson: LessonPublished = {
  id: lessonId,
  chapterId,
  title: "Reliable transport",
  description: "TCP and UDP",
  objectives: ["Explain transport"],
  blocks: [{ id: blockId, type: "paragraph", text: "TCP provides reliable transport." }],
  estimatedMinutes: 4,
  displayOrder: 0,
  version: 1,
  status: "PUBLISHED",
  publishedRevisionId: revisionId,
  revisionId,
  revisionNumber: 1,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  chapter: {
    id: chapterId,
    title: "Transport",
    bookReference: "V1 / Chapter 1",
    domainId: "d1",
    domainName: "Network Fundamentals",
  },
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  annotations: StudyAnnotation[],
  blocked: boolean,
  failedWrite: boolean,
  calls: { url: string; options: RequestInit }[];
let storedProgress: {
  state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  version: number;
  blockId: string | null;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const wait = async () => act(async () => new Promise((resolve) => setTimeout(resolve, 35)));
async function render(component: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{component}</QueryClientProvider>),
  );
  await wait();
  await wait();
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!button) throw Error("Missing button " + text);
  await act(async () => button.click());
  await wait();
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  auth.userId = "learner-a";
  auth.sessionId = "study-session";
  annotations = [];
  blocked = false;
  failedWrite = false;
  calls = [];
  storedProgress = { state: "NOT_STARTED", version: 0, blockId: null };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  setAuthTokenGetter(null);
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = vi.fn(() => "blob:test-private-image");
      static revokeObjectURL = vi.fn();
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      calls.push({ url, options });
      if (url === "/api/curriculum")
        return json({
          version: "1.1",
          title: "CCNA",
          domains: [
            {
              id: "d1",
              number: "01",
              title: "Network Fundamentals",
              description: "",
              sections: [
                {
                  id: "v1",
                  title: "Volume 1",
                  chapters: [{ id: chapterId, title: "Transport", description: "" }],
                },
              ],
            },
          ],
          topics: [],
          labs: null,
        });
      if (url.startsWith("/api/study")) {
        if (blocked)
          return json(
            {
              error: {
                code: "STUDY_NOT_READY",
                message: "Private study storage is not activated.",
              },
            },
            503,
          );
        if (options.method && options.method !== "GET") {
          if (failedWrite)
            return json({ error: { message: "Private save failed; retry later." } }, 500);
          const body = JSON.parse(String(options.body));
          if (url === "/api/study/annotations") {
            const annotation = {
              id: crypto.randomUUID(),
              ...body,
              version: 1,
              createdAt: lesson.createdAt,
              updatedAt: lesson.updatedAt,
            };
            annotations.push(annotation);
            return json({ annotation });
          }
          if (url === "/api/study/progress") {
            storedProgress = {
              ...storedProgress,
              version: storedProgress.version + 1,
              state:
                body.action === "complete"
                  ? "COMPLETED"
                  : body.action === "start" || body.action === "reopen"
                    ? "IN_PROGRESS"
                    : storedProgress.state,
              blockId: body.action === "position" ? body.blockId : storedProgress.blockId,
            };
          }
          return json({ progress: storedProgress });
        }
        if (url.startsWith("/api/study/workspace"))
          return json({ items: [], page: 1, pageSize: 25, total: 0 });
        if (url.startsWith("/api/study/progress"))
          return json({ chapters: [], lessons: [], page: 1, pageSize: 25, total: 0 });
        return json({
          revisionId,
          annotations: auth.userId === "learner-a" ? annotations : [],
          progress: storedProgress,
        });
      }
      if (url === "/api/admin/lesson-media")
        return json(
          {
            error: {
              code: "MEDIA_NOT_READY",
              message: "Persistent media storage is not activated.",
            },
          },
          503,
        );
      if (url.includes("/api/chapters/")) return json({ items: [lesson] });
      return json({ lesson, previous: null, next: null });
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setAuthTokenGetter(null);
});
it("renders semantic formatting, H4, lists and accessible colored callouts without HTML", async () => {
  await render(
    <LessonContent
      blocks={[
        { id: "h", type: "heading", level: 4, text: "Detail" },
        {
          id: "r",
          type: "richText",
          alignment: "center",
          runs: [
            {
              text: "<script>unsafe</script>",
              underline: true,
              bold: true,
              color: "accent",
              highlight: "yellow",
            },
          ],
        },
        { id: "l", type: "list", ordered: true, items: ["First", "Second"] },
        {
          id: "c",
          type: "callout",
          tone: "important",
          title: "Exam caution",
          text: "Fallback",
          runs: [{ text: "Remember", italic: true }],
        },
      ]}
    />,
  );
  expect(host.querySelector("h4")?.textContent).toBe("Detail");
  expect(host.querySelector("u strong")).not.toBeNull();
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("ol")?.children).toHaveLength(2);
  expect(host.querySelector(".lesson-callout-important em")?.textContent).toBe("Remember");
});
it("restores only exact current-revision highlights and never auto-completes a lesson", async () => {
  annotations = [
    {
      id: blockId,
      lessonId,
      revisionId,
      kind: "HIGHLIGHT",
      anchor: { blockId, start: 0, end: 3, quote: "TCP" },
      body: "",
      color: "yellow",
      category: "",
      version: 1,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    },
    {
      id: chapterId,
      lessonId,
      revisionId: lessonId,
      kind: "NOTE",
      anchor: null,
      body: "Old private note",
      color: null,
      category: "",
      version: 1,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    },
  ];
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.querySelector(".study-highlight")?.textContent).toBe("TCP");
  expect(host.textContent).toContain("older revision");
  expect(calls.some((c) => c.options.method === "PUT")).toBe(false);
  await act(async () => window.dispatchEvent(new Event("scroll")));
  expect(calls.some((c) => c.options.method === "PUT")).toBe(false);
});
it("creates a highlight from stable selected text with current session intent", async () => {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const text = host.querySelector<HTMLElement>("[data-study-text]")!,
    range = document.createRange();
  range.selectNodeContents(text);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => text.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })));
  await wait();
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Highlight green"]')!;
  expect(button).not.toBeNull();
  await act(async () => button.click());
  await wait();
  const request = calls.find(
    (c) => c.url === "/api/study/annotations" && c.options.method === "POST",
  )!;
  expect(JSON.parse(String(request.options.body))).toMatchObject({
    revisionId,
    anchor: {
      blockId,
      start: 0,
      quote: lesson.blocks[0].type === "paragraph" ? lesson.blocks[0].text : "",
    },
    color: "green",
  });
  expect(new Headers(request.options.headers).get("X-Study-Session")).toBe("study-session");
  expect(JSON.parse(String(request.options.body))).not.toHaveProperty("userId");
});
it("saves and reloads an explicit section position, resumes it and never completes by scrolling", async () => {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const article = host.querySelector<HTMLElement>(".lesson-prose")!;
  article.getBoundingClientRect = () => ({ top: -500, height: 2000 }) as DOMRect;
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
  expect(host.textContent).not.toContain("Reading position 0%");
  expect(calls.some((call) => call.options.method === "PUT")).toBe(false);
  await click("Start this lesson");
  await click("Save Position");
  await click("Progress");
  const request = calls
    .filter((call) => call.url === "/api/study/progress" && call.options.method === "PUT")
    .at(-1)!;
  expect(JSON.parse(String(request.options.body))).toMatchObject({
    lessonId,
    revisionId,
    action: "position",
    blockId,
    version: 1,
  });
  expect(storedProgress).toMatchObject({ state: "IN_PROGRESS", blockId, version: 2 });
  // A fresh reader/client must recover the persisted server fixture, not cached state.
  await act(async()=>root.unmount());client.clear();
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});root=createRoot(host);
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);
  await click("Progress");
  expect(storedProgress).toMatchObject({state:"IN_PROGRESS",blockId,version:2});
  expect(host.textContent).toContain("Saved reading position: section 1");
  const resume = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Resume Saved Position",
  )!;
  expect(resume.disabled).toBe(false);
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  await act(async () => resume.click());
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "auto",
  });
  await click("Mark lesson completed");
  expect(storedProgress.state).toBe("COMPLETED");
  const writes = calls.filter((call) => call.options.method === "PUT").length;
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
  expect(calls.filter((call) => call.options.method === "PUT")).toHaveLength(writes);
});
it("attaches reading measurement when curriculum arrives after the lesson response", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (url === "/api/curriculum") await ready;
    return original(url, options);
  });
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.querySelector(".lesson-prose")).toBeNull();
  await act(async () => release());
  await wait();
  await wait();
  const article = host.querySelector<HTMLElement>(".lesson-prose")!;
  article.getBoundingClientRect = () => ({ top: -600, height: 2000 }) as DOMRect;
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
  expect(host.textContent).not.toContain("Reading position 0%");
});
it("focus transitions keep the note draft and do not send study writes", async () => {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const note = host.querySelector<HTMLTextAreaElement>("#private-study-note")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      note,
      "Unsaved local note",
    );
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Focus reading");
  await click("Exit focus reading");
  expect(host.querySelector<HTMLTextAreaElement>("#private-study-note")?.value).toBe(
    "Unsaved local note",
  );
  expect(
    calls.some((call) => ["POST", "PUT", "PATCH", "DELETE"].includes(call.options.method ?? "")),
  ).toBe(false);
});
it("keeps unactivated persistence honest while reading comfort controls work", async () => {
  blocked = true;
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.textContent).toContain("not activated");
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === "Save private note",
  )!;
  expect(button.disabled).toBe(true);
  await click("Focus reading");
  expect(host.querySelector(".lesson-focus-mode")).not.toBeNull();
  await click("Exit focus reading");
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
});
it("retains unsaved notes after a failed save and clears private items when identity changes", async () => {
  annotations = [
    {
      id: blockId,
      lessonId,
      revisionId,
      kind: "NOTE",
      anchor: null,
      body: "Learner A private note",
      color: null,
      category: "",
      version: 1,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    },
  ];
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const textarea = host.querySelector<HTMLTextAreaElement>("#private-study-note")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      textarea,
      "Unsaved private thought",
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  failedWrite = true;
  await click("Save private note");
  expect(textarea.value).toBe("Unsaved private thought");
  expect(host.textContent).toContain("Private save failed");
  auth.userId = "learner-b";
  auth.sessionId = "other-session";
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.textContent).not.toContain("Learner A private note");
  expect(host.querySelector<HTMLTextAreaElement>("#private-study-note")?.value).toBe("");
});
it("has session undo/redo, new duplicate IDs and safe internal links", () => {
  const initial = { past: [], present: { title: "A" }, future: [] };
  const edited = editHistory(initial, { type: "edit", patch: { title: "B" } });
  expect(editHistory(edited, { type: "undo" }).present.title).toBe("A");
  expect(editHistory(editHistory(edited, { type: "undo" }), { type: "redo" }).present.title).toBe(
    "B",
  );
  const block = newLessonBlock("list"),
    copy = duplicateLessonBlock(block);
  expect(copy.id).not.toBe(block.id);
  expect(copy.type).toBe("list");
  expect(safeLessonUrl("/api/lesson-media/" + blockId)).not.toBeNull();
  expect(safeLessonUrl("//evil.invalid")).toBeNull();
  expect(safeLessonUrl("/learn/chapters/\\evil")).toBeNull();
});
it("previews upload locally but preserves the existing image when storage is blocked", async () => {
  const insert = vi.fn();
  await render(
    <AdminSessionBoundary identity={auth}>
      <LessonImageUpload insert={insert} />
    </AdminSessionBoundary>,
  );
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "test.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait();
  expect(host.querySelector("img")?.alt).toContain("not uploaded");
  await click("Upload and use image");
  expect(host.textContent).toContain("not activated");
  expect(insert).not.toHaveBeenCalled();
});
