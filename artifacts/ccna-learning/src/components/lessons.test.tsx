// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { LessonContent, safeLessonUrl } from "./lesson-content";
import { AdminLessonManager, newLessonBlock, moveLessonBlock } from "./admin-lessons";
import { AdminSessionBoundary } from "./admin-session-boundary";
import { LessonReader, lessonError } from "../pages/lesson-reader";
import { LearningSidebar, publishedActivities } from "./learning-sidebar";
import {
  setAuthTokenGetter,
  type LessonAdmin,
  type LessonBlock,
} from "@workspace/api-client-react";
const auth = { isLoaded: true, isSignedIn: true, userId: "admin-a", sessionId: "session-a" };
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
const chapterId = "11111111-1111-4111-8111-111111111111",
  lessonId = "22222222-2222-4222-8222-222222222222";
const heading: LessonBlock = {
  id: "33333333-3333-4333-8333-333333333333",
  type: "heading",
  text: "Reliable transport",
  level: 2,
};
const chapter = { id: chapterId, title: "Transport protocols", description: "TCP and UDP" };
let lesson: LessonAdmin,
  root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  calls: { url: string; options: RequestInit }[],
  failed: number,
  empty: boolean;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wait = async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
};
async function render(component: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{component}</QueryClientProvider>),
  );
  await wait();
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw Error("Missing button " + text);
  await act(async () => button.click());
  await wait();
}
async function field(label: string, value: string) {
  const element = [...document.querySelectorAll("label")]
    .find((item) => item.textContent?.startsWith(label))
    ?.querySelector("input,textarea,select") as HTMLInputElement;
  if (!element) throw Error("Missing field " + label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  calls = [];
  failed = 0;
  empty = false;
  auth.isLoaded = true;
  auth.isSignedIn = true;
  auth.userId = "admin-a";
  auth.sessionId = "session-a";
  lesson = {
    id: lessonId,
    chapterId,
    title: "Transport behavior",
    description: "Compare reliable and connectionless transport.",
    objectives: ["Distinguish TCP from UDP"],
    estimatedMinutes: 6,
    displayOrder: 0,
    blocks: [
      heading,
      {
        id: "44444444-4444-4444-8444-444444444444",
        type: "paragraph",
        text: "TCP provides ordered delivery.",
      },
    ],
    status: "DRAFT",
    version: 1,
    publishedRevisionId: null,
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  setAuthTokenGetter(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
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
              id: "domain",
              number: "1.0",
              title: "Fundamentals",
              description: "",
              sections: [{ id: "s", title: "Book", chapters: [chapter] }],
            },
          ],
          topics: [],
          labs: null,
        });
      if (failed)
        return json(
          {
            error: {
              message: failed === 409 ? "Concurrent edit" : "Unavailable",
              ...(failed === 503 ? { code: "LESSONS_NOT_READY" } : {}),
            },
          },
          failed,
        );
      if (options.method === "POST" || options.method === "PUT") {
        const body = JSON.parse(String(options.body));
        if (url.endsWith("/publish"))
          lesson = {
            ...lesson,
            status: "PUBLISHED",
            publishedRevisionId: "revision",
            version: lesson.version + 1,
          };
        else if (url.endsWith("/unpublish"))
          lesson = {
            ...lesson,
            status: "DRAFT",
            publishedRevisionId: null,
            version: lesson.version + 1,
          };
        else lesson = { ...lesson, ...body, version: lesson.version + 1 };
        return json({ lesson });
      }
      if (url.endsWith("/revisions"))
        return json({
          items: [
            {
              id: "revision",
              lessonId,
              revisionNumber: 1,
              createdAt: lesson.createdAt,
              snapshot: lesson,
            },
          ],
        });
      if (url === `/api/admin/lessons/${lessonId}`) return json({ lesson });
      if (url.startsWith("/api/admin/lessons/library"))
        return json({
          items: empty
            ? []
            : [
                {
                  ...lesson,
                  domainId: "domain",
                  domainName: "Fundamentals",
                  chapterTitle: chapter.title,
                  volume: "V1",
                  chapterNumber: 1,
                  publishedRevisionNumber: lesson.status === "PUBLISHED" ? 1 : null,
                },
              ],
          total: empty ? 0 : 1,
          page: 1,
          pageSize: 25,
          summary: {
            total: empty ? 0 : 1,
            published: lesson.status === "PUBLISHED" ? 1 : 0,
            drafts: lesson.status === "DRAFT" && !empty ? 1 : 0,
            chapters: empty ? 0 : 1,
          },
        });
      if (url.startsWith("/api/admin/lessons")) return json({ items: empty ? [] : [lesson] });
      if (url.includes("/chapters/"))
        return json({ items: empty ? [] : [{ ...lesson, status: "PUBLISHED" }] });
      return json({
        lesson: {
          ...lesson,
          status: "PUBLISHED",
          revisionId: "revision",
          revisionNumber: 1,
          chapter: {
            ...chapter,
            bookReference: "V1 / Chapter 1",
            domainId: "domain",
            domainName: "Network Fundamentals",
          },
        },
        previous: null,
        next: { id: "next", title: "UDP in practice" },
      });
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
it("renders structured formatting and escapes authored HTML", async () => {
  await render(
    <LessonContent
      blocks={[
        {
          id: "r",
          type: "richText",
          runs: [
            {
              text: "<script>bad()</script>",
              bold: true,
              italic: true,
              code: true,
              href: "javascript:bad()",
            },
          ],
        },
        { id: "i", type: "image", url: "javascript:bad()", alt: "Unsafe" },
      ]}
    />,
  );
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("a")).toBeNull();
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("strong em code")?.textContent).toContain("<script>");
});
it.each([
  "javascript:alert(1)",
  "data:text/html,bad",
  "https://#",
  "https://user:password@example.com",
])("rejects unsafe media/link URL %s", (value) => expect(safeLessonUrl(value)).toBeNull());
it("supports HTTPS paths queries and fragments", () =>
  expect(safeLessonUrl("https://example.com/lab?q=1#step")).toBe(
    "https://example.com/lab?q=1#step",
  ));
it("copies CLI code and reports failure accurately", async () => {
  const copy = vi.fn().mockRejectedValue(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  await render(
    <LessonContent
      blocks={[{ id: "code", type: "code", text: "show ip route", language: "Cisco IOS" }]}
    />,
  );
  await click("Copy code");
  expect(copy).toHaveBeenCalledWith("show ip route");
  expect(host.textContent).toContain("Copy unavailable");
});
it("knowledge checks are local and create no practice writes", async () => {
  await render(
    <LessonContent
      blocks={[
        {
          id: "check",
          type: "knowledgeCheck",
          prompt: "Reliable transport?",
          choices: ["UDP", "TCP"],
          correctIndex: 1,
          explanation: "TCP tracks delivery.",
        },
      ]}
    />,
  );
  await act(async () => (host.querySelectorAll("input")[1] as HTMLInputElement).click());
  await click("Check understanding");
  expect(host.textContent).toContain("Correct.");
  expect(calls).toHaveLength(0);
});
it("keeps stable section identifiers when reordered", () => {
  const second = newLessonBlock("code");
  expect(moveLessonBlock([heading, second], 1, -1).map((item) => item.id)).toEqual([
    second.id,
    heading.id,
  ]);
  expect(newLessonBlock("paragraph").id).not.toBe(newLessonBlock("paragraph").id);
});
it("shows coming-soon state without fake lessons", async () => {
  empty = true;
  await render(<LessonReader chapterId={chapterId} />);
  expect(host.textContent).toContain("Lessons coming soon");
  expect(host.querySelector('a[href*="/lessons/"]')).toBeNull();
});
it("lists published lessons and preserves chapter route", async () => {
  await render(<LessonReader chapterId={chapterId} />);
  expect(
    host.querySelector(`a[href="/learn/chapters/${chapterId}/lessons/${lessonId}"]`),
  ).not.toBeNull();
  expect(host.textContent).toContain("Transport behavior");
});
it("renders reader objectives TOC previous/next and typography controls", async () => {
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.textContent).toContain("Distinguish TCP from UDP");
  expect(host.querySelector(`a[href="#section-${heading.id}"]`)).not.toBeNull();
  expect(host.querySelector(`a[href="/learn/chapters/${chapterId}/lessons/next"]`)).not.toBeNull();
  expect(host.textContent).toContain("Published revision 1");
  await click("Dark reading");
  expect(host.querySelector(".lesson-dark")).not.toBeNull();
});
it("does not request lessons before authentication is ready", async () => {
  auth.isLoaded = false;
  await render(<LessonReader chapterId={chapterId} />);
  expect(host.textContent).toContain("Loading your learning session");
  expect(calls).toHaveLength(0);
});
it("reports migration activation gate and permits a real retry", async () => {
  failed = 503;
  await render(<LessonReader chapterId={chapterId} />);
  expect(host.textContent).toContain("not activated");
  failed = 0;
  await click("Retry");
  expect(host.textContent).toContain("Transport behavior");
});
it("reports missing or unpublished lesson without showing content", async () => {
  failed = 404;
  await render(<LessonReader chapterId={chapterId} lessonId={lessonId} />);
  expect(host.textContent).toContain("not available");
  expect(host.textContent).not.toContain("TCP provides ordered delivery");
});
it("admin edits save with session binding and optimistic version", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await field("Lesson title", "Reliable transport revised");
  await click("Save draft changes");
  const call = calls.find((item) => item.options.method === "PUT");
  expect(JSON.parse(String(call?.options.body))).toMatchObject({
    version: 1,
    title: "Reliable transport revised",
    chapterId,
  });
  expect(new Headers(call?.options.headers).get("X-Admin-Session")).toBe("session-a");
});
it("requires a saved draft before publishing and permits unpublish", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await click("Publish revision");
  expect(
    calls.some((item) => item.url.endsWith("/publish") && item.options.method === "POST"),
  ).toBe(true);
  await click("Unpublish");
  expect(
    calls.some((item) => item.url.endsWith("/unpublish") && item.options.method === "POST"),
  ).toBe(true);
});
it("retains unsaved text on concurrent update and never assumes success", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await field("Lesson title", "My unsaved title");
  failed = 409;
  await click("Save draft changes");
  expect(document.body.textContent).toContain("Another administrator changed");
  expect((document.querySelector("input[maxlength]") as HTMLInputElement).value).toBe(
    "My unsaved title",
  );
});
it("guards closing with unsaved edits", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await field("Lesson title", "Do not lose this");
  vi.mocked(window.confirm).mockReturnValue(false);
  await click("Back to lesson library");
  expect(document.querySelector(".lesson-studio-workspace")).not.toBeNull();
  expect(window.confirm).toHaveBeenCalledWith("Discard unsaved lesson changes?");
});
it("distinguishes missing API routes from missing drafts and the migration gate", () => {
  expect(
    lessonError({ status: 404, data: "<pre>Cannot POST /api/admin/lessons</pre>" }, "admin"),
  ).toContain("Restart the API");
  expect(
    lessonError({ status: 404, data: { error: { code: "LESSON_NOT_FOUND" } } }, "admin"),
  ).toContain("draft no longer exists");
  expect(
    lessonError({ status: 503, data: { error: { code: "LESSONS_NOT_READY" } } }, "admin"),
  ).toContain("storage is not activated");
  expect(lessonError({ status: 503 }, "admin")).toContain("temporarily unavailable");
});
it("distinguishes an old library-as-UUID route from invalid filters and server publication data", () => {
  expect(
    lessonError(
      {
        status: 400,
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Review the lesson fields.",
            details: [{ path: "", message: "Invalid UUID" }],
          },
        },
      },
      "library",
    ),
  ).toContain("treated the lesson library route as a lesson ID");
  expect(
    lessonError(
      {
        status: 400,
        data: {
          error: {
            code: "VALIDATION_ERROR",
            details: [{ path: "pageSize", message: "Invalid size" }],
          },
        },
      },
      "library",
    ),
  ).toContain("filters");
  expect(
    lessonError({
      status: 500,
      data: {
        error: {
          code: "LESSON_RESPONSE_INVALID",
          message: "Invalid metadata",
          details: [{ path: "items.0.revisionId", code: "invalid_type" }],
        },
      },
    }),
  ).toContain("items.0.revisionId");
  expect(
    lessonError({
      status: 500,
      data: {
        error: { code: "LESSON_PUBLISHED_DATA_INVALID", message: "Stored metadata invalid" },
      },
    }),
  ).toBe("Stored metadata invalid");
});
it("retains unsaved changes after an actual missing-route HTML response", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await field("Lesson title", "Retain this draft");
  const previous = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options: RequestInit = {}) =>
      options.method === "PUT"
        ? Promise.resolve(
            new Response("<pre>Cannot PUT /api/admin/lessons/id</pre>", {
              status: 404,
              headers: { "content-type": "text/html" },
            }),
          )
        : previous(url, options),
    ),
  );
  await click("Save draft changes");
  expect(document.body.textContent).toContain("Restart the API");
  expect(document.body.textContent).not.toContain("may be unpublished");
  expect((document.querySelector("input[maxlength]") as HTMLInputElement).value).toBe(
    "Retain this draft",
  );
  expect(document.body.textContent).not.toContain("Saved. Existing");
});
it("previews unsaved official content locally without fetching a published lesson", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await field("Lesson title", "Unpublished local preview");
  const before = calls.length;
  await click("Preview lesson");
  expect(document.querySelector(".visual-preview-pane h1")?.textContent).toBe(
    "Unpublished local preview",
  );
  expect(calls.length).toBe(before);
  expect(calls.some((c) => c.url.startsWith("/api/lessons/"))).toBe(false);
});
it("disables saving while pending and rejects same-tick duplicate form submissions", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  const previous = globalThis.fetch;
  let release!: (response: Response) => void;
  const writes = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options: RequestInit = {}) =>
      options.method === "PUT" ? writes() : previous(url, options),
    ),
  );
  const form = document.querySelector("#lesson-draft-form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(writes).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);
  expect(document.querySelector("button[type=submit]")?.textContent).toBe("Saving lesson…");
  await act(async () => {
    release(json({ lesson: { ...lesson, version: 2 } }));
  });
  await wait();
  expect(document.body.textContent).toContain(
    "Saved. Existing published content changes only when you publish.",
  );
});
it("creates a new draft through the authenticated POST endpoint", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>("[role=combobox][aria-label=Chapter]")!.click(),
  );
  await wait();
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>("[role=option]")]
      .find((item) => item.textContent?.includes(chapter.title))!
      .click(),
  );
  await wait();
  await click("Create lesson");
  await field("Lesson title", "A new draft");
  await click("Save draft changes");
  const write = calls.find((c) => c.url === "/api/admin/lessons" && c.options.method === "POST");
  expect(write).toBeTruthy();
  expect(JSON.parse(String(write?.options.body))).toMatchObject({
    title: "A new draft",
    chapterId,
  });
  expect(new Headers(write?.options.headers).get("X-Admin-Session")).toBe("session-a");
  expect(new Headers(write?.options.headers).get("Content-Type")).toBe("application/json");
  expect(document.querySelector(".lesson-studio-workspace")?.textContent).toContain(
    "Saved. Existing published content changes only when you publish.",
  );
  await field("Lesson title", "The same saved draft");
  await click("Save draft changes");
  expect(
    calls.filter((c) => c.url === "/api/admin/lessons" && c.options.method === "POST"),
  ).toHaveLength(1);
  expect(
    calls.some((c) => c.url === `/api/admin/lessons/${lessonId}` && c.options.method === "PUT"),
  ).toBe(true);
});

const sidebarCurriculum = {
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
          chapters: [
            chapter,
            {
              id: "55555555-5555-4555-8555-555555555555",
              title: "IPv4 addressing",
              description: "",
            },
          ],
        },
      ],
    },
    {
      id: "d2",
      number: "02",
      title: "Network Access",
      description: "",
      sections: [
        {
          id: "v2",
          title: "Volume 2",
          chapters: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              title: "Switching operations",
              description: "",
            },
          ],
        },
      ],
    },
  ],
  topics: [],
  labs: null,
};
it("opens the selected chapter, highlights the current lesson and lazily loads other domains", async () => {
  await render(
    <LearningSidebar curriculum={sidebarCurriculum} chapterId={chapterId} lessonId={lessonId} />,
  );
  const current = host.querySelector("[aria-current=page]");
  expect(current?.textContent).toContain(lesson.title);
  expect(current?.getAttribute("href")).toBe(`/learn/chapters/${chapterId}/lessons/${lessonId}`);
  expect(calls.filter((c) => c.url.includes("/api/chapters/"))).toHaveLength(1);
  const domain = [...host.querySelectorAll<HTMLDetailsElement>(".learning-domain")].find((d) =>
    d.textContent?.includes("Switching operations"),
  )!;
  await act(async () => {
    domain.open = true;
    domain.dispatchEvent(new Event("toggle"));
  });
  await wait();
  const ch = domain.querySelector<HTMLDetailsElement>(".learning-chapter")!;
  await act(async () => {
    ch.open = true;
    ch.dispatchEvent(new Event("toggle"));
  });
  await wait();
  expect(
    calls.some((c) => c.url.includes("/api/chapters/66666666-6666-4666-8666-666666666666/lessons")),
  ).toBe(true);
  expect(host.querySelector("progress")).toBeNull();
  expect(host.textContent).toContain("Completion is never inferred from navigation");
});
it("offers a focus-managed mobile navigation dialog and closes it on lesson selection", async () => {
  await render(
    <LearningSidebar curriculum={sidebarCurriculum} chapterId={chapterId} lessonId={lessonId} />,
  );
  await click("Browse learning activities");
  const dialog = document.querySelector("[role=dialog]");
  expect(dialog).not.toBeNull();
  expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
  expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  await wait();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  await click("Browse learning activities");
  await act(async () =>
    document
      .querySelector("[role=dialog]")!
      .querySelector<HTMLAnchorElement>("[aria-current=page]")!
      .click(),
  );
  await wait();
  expect(document.querySelector("[role=dialog]")).toBeNull();
});
it("creates activity links only for real published CLI, checks and lab references", () => {
  const activities = publishedActivities({
    ...lesson,
    blocks: [
      heading,
      { id: "cli", type: "code", text: "show ip route", language: "cisco-ios" },
      {
        id: "quiz",
        type: "knowledgeCheck",
        prompt: "Which route?",
        choices: ["a", "b"],
        correctIndex: 0,
        explanation: "Review longest prefix.",
      },
      {
        id: "lab",
        type: "labReference",
        title: "Author supplied lab",
        url: "https://example.org/lab",
        description: "",
      },
    ],
  } as Parameters<typeof publishedActivities>[0]);
  expect(activities.map((a) => a.kind)).toEqual(["cli", "quiz", "reference"]);
  expect(activities.map((a) => a.id)).toEqual(["cli", "quiz", "lab"]);
});
it("uses server-side search and pagination for studio metadata with real summary counts", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  expect(host.textContent).toContain("Total lessons");
  expect(host.textContent).toContain("Drafts (including unpublished)");
  await field("Search lessons", "TCP");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  await wait();
  expect(
    calls.some((c) => c.url.includes("/api/admin/lessons/library?") && c.url.includes("q=TCP")),
  ).toBe(true);
  await field("Lessons per page", "10");
  await wait();
  expect(calls.some((c) => c.url.includes("pageSize=10") && c.url.includes("page=1"))).toBe(true);
});
it("preserves the server-published lesson order and retries failed sidebar reads", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let rejectList = true;
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    if (String(input).includes("/api/chapters/"))
      return rejectList
        ? json({ error: { message: "Temporary lesson error" } }, 500)
        : json({
            items: [
              {
                ...lesson,
                id: "ordered-first",
                title: "First published reading",
                status: "PUBLISHED",
              },
              {
                ...lesson,
                id: "ordered-second",
                title: "Second published reading",
                status: "PUBLISHED",
              },
            ],
          });
    return original(input, options);
  });
  await render(<LearningSidebar curriculum={sidebarCurriculum} chapterId={chapterId} />);
  expect(host.textContent).toContain("Lessons could not load");
  rejectList = false;
  await click("Retry lessons");
  const links = [...host.querySelectorAll<HTMLAnchorElement>(".learning-activities>li>a")];
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    `/learn/chapters/${chapterId}/lessons/ordered-first`,
    `/learn/chapters/${chapterId}/lessons/ordered-second`,
  ]);
  expect(links.map((link) => link.querySelector(".learning-activity-number")?.textContent)).toEqual(
    ["1", "2"],
  );
});

it("uses an in-page preview-first workspace and keeps Save outside both switchable panes", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  const workspace = host.querySelector(".lesson-studio-workspace")!;
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector(".lesson-library-filters")).toBeNull();
  const panes = workspace.querySelector(".visual-lesson-workspace")!;
  expect(panes.firstElementChild?.id).toBe("lesson-preview-pane");
  expect(panes.lastElementChild?.id).toBe("lesson-editor-pane");
  const save = [...workspace.querySelectorAll("button")].find(
    (b) => b.textContent === "Save draft changes",
  )!;
  expect(save.getAttribute("form")).toBe("lesson-draft-form");
  expect(panes.contains(save)).toBe(false);
  expect(document.activeElement?.id).toBe("lesson-studio-title");
  await click("Preview lesson");
  expect(panes.getAttribute("data-mobile-view")).toBe("preview");
  expect(save.disabled).toBe(false);
  await click("Save draft changes");
  expect(calls.filter((c) => c.options.method === "PUT")).toHaveLength(1);
  await click("Editor");
  expect(panes.getAttribute("data-mobile-view")).toBe("editor");
  expect(workspace.querySelector(".lesson-studio-metadata summary")?.textContent).toContain(
    "metadata",
  );
});
it("cancelling publication leaves the draft and published revisions unchanged", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  vi.mocked(window.confirm).mockReturnValue(false);
  await click("Publish revision");
  expect(calls.some((c) => c.url.endsWith("/publish"))).toBe(false);
  expect(host.querySelector(".lesson-studio-workspace")).not.toBeNull();
});

it("reveals metadata and editor when a hidden field fails native validation in preview mode", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  await click("Preview lesson");
  const metadata = host.querySelector<HTMLDetailsElement>(".lesson-studio-metadata")!;
  const title = host.querySelector<HTMLInputElement>('input[maxlength="180"]')!;
  await act(async () => {
    title.dispatchEvent(new Event("invalid", { bubbles: false, cancelable: true }));
  });
  expect(metadata.open).toBe(true);
  expect(host.querySelector(".visual-lesson-workspace")?.getAttribute("data-mobile-view")).toBe(
    "editor",
  );
  expect(calls.some((c) => ["POST", "PUT"].includes(c.options.method || ""))).toBe(false);
});
it("keeps all existing section actions and revision access inside the full-width editor", async () => {
  await render(
    <AdminSessionBoundary identity={auth}>
      <AdminLessonManager />
    </AdminSessionBoundary>,
  );
  await click("Edit / preview");
  const editor = host.querySelector("#lesson-editor-pane")!;
  for (const label of ["Add before", "Add after", "Duplicate section", "Remove section"])
    expect(
      [...editor.querySelectorAll("button")].some((b) => b.textContent?.trim() === label),
    ).toBe(true);
  expect(editor.querySelector('[aria-label="Lesson outline"]')).not.toBeNull();
  expect(editor.textContent).toContain("Immutable revision history");
  expect(editor.querySelector("#lesson-add-block")?.querySelectorAll("option")).toHaveLength(13);
  expect(editor.querySelectorAll("fieldset[id^=edit-block-]")).toHaveLength(2);
  expect(editor.querySelector("fieldset")?.id).toBe("edit-block-" + heading.id);
});
