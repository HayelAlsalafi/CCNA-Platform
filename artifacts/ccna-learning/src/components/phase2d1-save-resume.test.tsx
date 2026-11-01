// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { setAuthTokenGetter, type LessonPublished, type StudyAnnotation } from "@workspace/api-client-react";
import { LessonReader } from "../pages/lesson-reader";
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
              blockId: body.blockId ?? storedProgress.blockId,
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

it("exposes Save before start, saves once with the existing start action, and reloads Resume", async () => {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("Outline");
  const button=()=>[...host.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent?.trim()==="Save Position")!;
  expect(button().disabled).toBe(false);
  expect(host.textContent).toContain("No saved position. Save explicitly; completion is separate.");
  await act(async()=>{button().click();button().click();});await wait();await wait();
  const writes=calls.filter(call=>call.url==="/api/study/progress"&&call.options.method==="PUT");
  expect(writes).toHaveLength(1);
  expect(JSON.parse(String(writes[0].options.body))).toMatchObject({action:"start",blockId,lessonId,revisionId,version:0});
  expect(storedProgress).toMatchObject({state:"IN_PROGRESS",blockId});
  // A fresh query client and mounted reader simulate reload; server fixture retains only persisted state.
  await act(async()=>root.unmount());client.clear();client=new QueryClient({defaultOptions:{queries:{retry:false}}});root=createRoot(host);
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const resume=[...host.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent==="Resume Saved Position")!;
  expect(resume).toBeTruthy();await act(async()=>resume.click());
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({block:"start",behavior:"auto"});
  expect(calls.filter(call=>call.options.method==="PUT")).toHaveLength(1);
});
it("keeps first-save errors visible and never invents a saved Resume target", async()=>{
  failedWrite=true;await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  await click("Save Position");expect(host.textContent).toContain("Private save failed; retry later.");
  expect(storedProgress.state).toBe("NOT_STARTED");
  expect([...host.querySelectorAll("a")].some(node=>node.textContent==="Resume saved position")).toBe(false);
});
it("saving a completed lesson position preserves explicit completion", async()=>{
  storedProgress={state:"COMPLETED",blockId,version:4};await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  await click("Save Position");
  const request=calls.find(call=>call.url==="/api/study/progress"&&call.options.method==="PUT")!;
  expect(JSON.parse(String(request.options.body))).toMatchObject({action:"position",version:4});
  expect(storedProgress.state).toBe("COMPLETED");
});

it("does not offer the previous lesson saved target after switching lessons", async()=>{
  storedProgress={state:"IN_PROGRESS",blockId,version:2};
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const second="66666666-6666-4666-8666-666666666666",secondRevision="77777777-7777-4777-8777-777777777777",secondBlock="88888888-8888-4888-8888-888888888888";
  const original=vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async(url,options)=>{
    if(url===`/api/lessons/${second}`)return json({lesson:{...lesson,id:second,revisionId:secondRevision,publishedRevisionId:secondRevision,blocks:[{id:secondBlock,type:"paragraph",text:"Another lesson"}]},previous:null,next:null});
    if(url===`/api/study/lessons/${second}`)return json({revisionId:secondRevision,annotations:[],progress:{state:"NOT_STARTED",blockId:null,version:0}});
    return original(url,options);
  });
  await render(<LessonReader chapterId={chapterId} lessonId={second} />);
  expect(host.textContent).toContain("Saved reading position: Not saved");
  expect([...host.querySelectorAll("a")].some(node=>node.textContent==="Resume saved position")).toBe(false);
  expect(calls.filter(call=>call.options.method==="PUT")).toHaveLength(0);
});

it("keeps one sticky control group with focus, save, resume, settings and live progress",async()=>{
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const toolbar=host.querySelector('[aria-label="Reading controls"]')!;
  const actions=()=>[...toolbar.querySelectorAll("button")];
  expect(actions().some(button=>button.textContent==="Focus reading")).toBe(true);
  expect(actions().some(button=>button.textContent==="Save Position")).toBe(true);
  expect(actions().find(button=>button.textContent==="Resume Saved Position")!.disabled).toBe(true);
  expect(toolbar.querySelector(".lesson-reading-settings")).not.toBeNull();
  expect(toolbar.querySelector('progress[aria-label="Reading position"]')).not.toBeNull();
  expect(host.querySelectorAll(".lesson-reading-tools")).toHaveLength(1);
  expect([...host.querySelectorAll("button")].filter(button=>button.textContent==="Focus reading")).toHaveLength(1);
  expect([...host.querySelectorAll("button")].filter(button=>button.textContent==="Save Position")).toHaveLength(1);
  await click("Focus reading");expect(host.querySelector(".lesson-focus-mode")).not.toBeNull();
  expect(host.querySelector("#private-study-note")).not.toBeNull();
  await click("Exit focus reading");expect(host.querySelector(".lesson-focus-mode")).toBeNull();
  expect(calls.some(call=>call.options.method==="PUT")).toBe(false);
});

it("defaults focus width to Wide, preserves the anchor on width changes and leaves normal preferences alone",async()=>{
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  const normal=()=>[...host.querySelectorAll("label")].find(label=>label.textContent?.trim().startsWith("Reading width"))!.querySelector("select")!;
  expect(normal().value).toBe("comfortable");
  await click("Focus reading");
  const select=[...host.querySelectorAll("label")].find(label=>label.textContent?.trim().startsWith("Focus reading width"))!.querySelector("select")!;
  expect(select.value).toBe("wide");
  const visibleArticle=host.querySelector<HTMLElement>(".lesson-prose")!;
  expect(visibleArticle.style.width).toBe("100%");
  expect(visibleArticle.style.maxWidth).toBe("1120px");
  for(const [choice,expected] of [["comfortable","800px"],["wide","1120px"],["full","none"]]) {
    await act(async()=>{select.value=choice;select.dispatchEvent(new Event("change",{bubbles:true}));});await wait();
    expect(visibleArticle.style.maxWidth).toBe(expected);
    expect(getComputedStyle(visibleArticle).maxWidth).toBe(expected);
  }
  await act(async()=>{select.value="wide";select.dispatchEvent(new Event("change",{bubbles:true}));});await wait();

  expect([...select.options].map(option=>option.value)).toEqual(["comfortable","wide","full"]);
  const article=host.querySelector<HTMLElement>(".lesson-prose")!,section=article.querySelector<HTMLElement>("[data-section-id]")!;
  article.getBoundingClientRect=()=>({top:-500,height:2000}) as DOMRect;
  section.getBoundingClientRect=()=>({top:host.querySelector<HTMLElement>(".lesson-workspace")!.dataset.focusWidth==="full"?-40:-120}) as DOMRect;
  const scroll=vi.spyOn(window,"scrollBy").mockImplementation(()=>{});
  await act(async()=>{select.value="full";select.dispatchEvent(new Event("change",{bubbles:true}));});await wait();
  expect(scroll).toHaveBeenCalledWith({top:80,behavior:"auto"});
  await click("Exit focus reading");expect(normal().value).toBe("comfortable");
  expect(visibleArticle.getAttribute("style")).toBe("");
  await click("Focus reading");expect(host.querySelector<HTMLElement>(".lesson-workspace")!.dataset.focusWidth).toBe("full");
  expect(calls.some(call=>call.options.method==="PUT")).toBe(false);
});
