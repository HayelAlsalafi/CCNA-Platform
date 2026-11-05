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


const exportMocks=vi.hoisted(()=>({collect:vi.fn(),build:vi.fn(),download:vi.fn()}));
vi.mock("../lib/study-export",()=>({collectStudyExport:exportMocks.collect,buildStudyExport:exportMocks.build,downloadStudyExport:exportMocks.download}));
beforeEach(()=>{exportMocks.collect.mockResolvedValue([{id:"private-item"}]);exportMocks.build.mockResolvedValue(new Blob(["fixture"]));exportMocks.download.mockReset();});
async function tab(label:string,scope:ParentNode=document){
 const button=[...scope.querySelectorAll<HTMLElement>('[role="tab"]')].find(node=>node.textContent===label)!;
 await act(async()=>{button.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}));button.click();});await wait();
}
async function input(element:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}));});}
async function choose(element:HTMLSelectElement,value:string){await act(async()=>{element.value=value;element.dispatchEvent(new Event("change",{bubbles:true}));});await wait();}
const annotation=(kind:"NOTE"|"HIGHLIGHT"|"BOOKMARK",id:string):StudyAnnotation=>({id,lessonId,revisionId,kind,anchor:kind==="NOTE"?null:{blockId,start:0,end:3,quote:"TCP"},body:kind==="NOTE"?"Review delivery guarantees":"",color:kind==="HIGHLIGHT"?"blue":null,category:"Transport",version:1,createdAt:"2026-10-30T00:00:00Z",updatedAt:"2026-10-31T00:00:00Z"});
it("keeps outline anchors, real lesson counts and an unsaved note across hub tabs",async()=>{
 annotations=[annotation("NOTE","11111111-1111-4111-8111-111111111111"),annotation("HIGHLIGHT","66666666-6666-4666-8666-666666666666"),annotation("BOOKMARK","77777777-7777-4777-8777-777777777777")];
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);
 expect(host.querySelector('[aria-label="Study Hub sections"]')).not.toBeNull();
 expect([...host.querySelectorAll('[aria-label="Study Hub sections"] [role="tab"]')].map(node=>node.textContent)).toEqual(["Outline","My Study","Progress"]);
 await tab("My Study");const counts=host.querySelector('[aria-label="Saved items in this lesson"]')!;
 expect([...counts.querySelectorAll("strong")].map(node=>node.textContent)).toEqual(["1","1","1"]);
 const note=host.querySelector<HTMLTextAreaElement>("#private-study-note")!;await input(note,"Keep this unsaved note");
 await tab("Progress");await tab("Outline");await tab("My Study");
 expect(host.querySelector<HTMLTextAreaElement>("#private-study-note")!.value).toBe("Keep this unsaved note");
 expect(host.querySelector('[aria-label="Study Hub sections"] [data-state="active"]')?.textContent).toBe("My Study");
 expect(calls.some(call=>["POST","PUT","DELETE","PATCH"].includes(call.options.method??""))).toBe(false);
 expect(host.textContent).toContain("Manage this item");
});
it("opens the workspace with scoped totals, search, clearable advanced filters and readable source cards",async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url,options)=>{
  if(String(url).startsWith("/api/study/workspace")){const u=new URL(String(url),"http://fixture");const kind=u.searchParams.get("kind");const total=kind==="NOTE"?5:kind==="HIGHLIGHT"?2:1;
   return json({items:kind==="NOTE"?[{...annotation("NOTE","11111111-1111-4111-8111-111111111111"),lessonTitle:lesson.title,chapterId,chapterTitle:"Transport",domainName:"Network Fundamentals",domainCode:"1.0",currentRevisionId:revisionId}]:[],total,page:1,pageSize:Number(u.searchParams.get("pageSize")??25)});
  }return original(url,options);
 });
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);await tab("My Study");await click("Open My Study Workspace");
 const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;expect(dialog.textContent).toContain("My Study Workspace");
 expect([...dialog.querySelectorAll('[aria-label="Saved items in selected scope"] strong')].map(node=>node.textContent)).toEqual(["5","2","1"]);
 expect(dialog.querySelector(".study-workspace-item time")?.getAttribute("dateTime")).toBe("2026-10-31T00:00:00Z");
 expect(dialog.textContent).toContain("Open original lesson");
 const search=dialog.querySelector<HTMLInputElement>('input[type="search"]')!;await input(search,"delivery");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();
 expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("q=delivery"))).toBe(true);
 expect(dialog.querySelector('[aria-label="Active filters"]')?.textContent).toContain("delivery");await click("Clear Filters");expect(search.value).toBe("");
 expect(dialog.querySelector('[aria-label="Active filters"]')).toBeNull();
 expect(dialog.querySelector('[aria-label="Study workspace pages"]')).not.toBeNull();
});
it("presents scope, domain, chapter and lesson completion from existing progress data",async()=>{
 const original=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url,options)=>String(url).startsWith("/api/study/progress")?json({chapters:[{chapterId,chapterTitle:"Transport",domainName:"Network Fundamentals",domainCode:"1.0",total:4,completed:1,inProgress:2}],lessons:[{id:lessonId,title:lesson.title,chapterId,revisionId,state:"COMPLETED",blockId}],total:1,page:1,pageSize:25}):original(url,options));
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);await tab("Progress");
 expect(host.querySelector<HTMLProgressElement>('progress[aria-label="Chapter completion"]')!.value).toBe(25);
 await tab("My Study");await click("Open My Study Workspace");const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;await tab("Progress",dialog);
 expect(dialog.querySelector<HTMLProgressElement>('progress[aria-label="Selected scope completion"]')!.value).toBe(25);
 expect(dialog.querySelector(".study-progress-domain summary")?.textContent).toContain("1/4");expect(dialog.querySelector(".study-progress-chapter summary")?.textContent).toContain("Transport");
 expect(dialog.textContent).toContain("completed");expect(calls.some(call=>call.options.method==="PUT")).toBe(false);
});
it("uses a focused export dialog and retains all three existing generators plus empty feedback",async()=>{
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);await tab("My Study");await click("Export study materials");await wait();
 const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
 const format=[...dialog.querySelectorAll("label")].find(label=>label.textContent?.startsWith("File format"))!.querySelector("select")!;
 for(const value of ["xlsx","docx","pdf"]){await choose(format,value);await click("Download my export");expect(exportMocks.build.mock.calls.at(-1)?.[1]).toBe(value);expect(exportMocks.download.mock.calls.at(-1)?.[1]).toBe(value);}
 exportMocks.collect.mockResolvedValue([]);await click("Download my export");expect(dialog.textContent).toContain("No saved study items match this scope.");expect(exportMocks.download).toHaveBeenCalledTimes(3);
});
it("discards a formatted export when a fresh server projection removes a paid excerpt",async()=>{
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);await tab("My Study");await click("Export study materials");await wait();
 exportMocks.collect.mockResolvedValueOnce([{id:"private-item",body:"My note",anchor:{quote:"Paid excerpt"}}]);
 exportMocks.collect.mockResolvedValueOnce([{id:"private-item",body:"My note",anchor:null}]);
 await click("Download my export");
 expect(exportMocks.build).toHaveBeenCalled();expect(exportMocks.download).not.toHaveBeenCalled();
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Study items changed during export. Retry for a consistent download.");
});
it("uses a full-width mobile hub drawer and retains unsaved text after close and reopen",async()=>{
 vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);await click("Open Study Hub");
 const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;expect(dialog.className).toContain("study-hub-drawer");await tab("My Study",dialog);
 await input(dialog.querySelector<HTMLTextAreaElement>("#private-study-note")!,"Mobile unsaved note");
 const close=[...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Close")!;await act(async()=>close.click());await wait();await click("Open Study Hub");await tab("My Study",document.querySelector('[role="dialog"]')!);
 expect(document.querySelector<HTMLTextAreaElement>("#private-study-note")!.value).toBe("Mobile unsaved note");expect(calls.some(call=>call.options.method==="POST")).toBe(false);
});

it("supports keyboard navigation of the three hub tabs without a persistence write",async()=>{
 await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);
 const outline=host.querySelector<HTMLButtonElement>('[aria-label="Study Hub sections"] [role="tab"]')!;
 await act(async()=>{outline.focus();outline.dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));});await wait();
 expect(host.querySelector('[aria-label="Study Hub sections"] [data-state="active"]')?.textContent).toBe("Progress");
 expect(calls.some(call=>call.options.method==="PUT")).toBe(false);
});

it("updates the active outline link from scrolling below the sticky toolbar without saving",async()=>{
 const blocks=lesson.blocks,second="99999999-9999-4999-8999-999999999999";
 lesson.blocks=[{id:blockId,type:"heading",level:2,text:"First section"},{id:second,type:"heading",level:2,text:"Second section"}];
 try {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId}/>);
  const article=host.querySelector<HTMLElement>(".lesson-prose")!,toolbar=host.querySelector<HTMLElement>(".lesson-reading-tools")!;
  article.getBoundingClientRect=()=>({top:-500,height:2000,bottom:1500}) as DOMRect;
  toolbar.getBoundingClientRect=()=>({top:68,height:80,bottom:148}) as DOMRect;
  const sections=article.querySelectorAll<HTMLElement>("[data-section-id]");let secondTop=150;
  sections[0].getBoundingClientRect=()=>({top:-100,bottom:100,height:200}) as DOMRect;
  sections[1].getBoundingClientRect=()=>({top:secondTop,bottom:secondTop+200,height:200}) as DOMRect;
  await act(async()=>{window.dispatchEvent(new Event("scroll"));await new Promise(resolve=>setTimeout(resolve,35));});
  const outline=host.querySelector('[aria-label="Lesson table of contents"]')!;
  expect(outline.querySelector('[aria-current="location"]')?.getAttribute("href")).toBe(`#section-${second}`);
  secondTop=400;await act(async()=>{window.dispatchEvent(new Event("scroll"));await new Promise(resolve=>setTimeout(resolve,35));});
  expect(outline.querySelector('[aria-current="location"]')?.getAttribute("href")).toBe(`#section-${blockId}`);
  expect(host.querySelector(`#section-${blockId}`)).not.toBeNull();
  expect(calls.some(call=>call.options.method==="PUT")).toBe(false);
 } finally {lesson.blocks=blocks;}
});
