// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { AdminTopics } from "./topics-manager";
import { AdminSessionBoundary } from "./admin-session-boundary";
import { validateTopicForm, initialTopicSlug } from "../lib/topic-form";
const identity = { userId: "admin-a", sessionId: "session-a" },
  id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const topic = {
  id,
  name: "Routing",
  slug: "routing",
  description: "Route selection and longest prefix matching.",
  displayOrder: 0,
  status: "ACTIVE",
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
  version: "2026-10-10T00:00:00.123456Z",
  questionCount: 3,
  publishedQuestionCount: 2,
  chapterIds: [],
  objectiveCodes: ["3.1"],
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  calls: { url: string; options: RequestInit }[],
  failure: number,
  previewFailure: boolean,
  listFailure: boolean,
  listEmpty: boolean;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const find = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw Error("Missing " + selector);
  return el;
};
async function button(text: string) {
  const el = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (e) => e.textContent?.trim() === text,
  );
  if (!el) throw Error("Missing button " + text);
  await act(async () => el.click());
}
async function click(selector: string) {
  await act(async () => find(selector).click());
}
async function input(selector: string, value: string) {
  await act(async () => {
    const el = find(selector) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function settle() {
  await act(async () => new Promise((r) => setTimeout(r, 350)));
}
async function edit() {
  await button("Routing");
  await button("Edit topic");
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  failure = 0;
  previewFailure = false;
  listFailure = false;
  listEmpty = false;
  calls = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      calls.push({ url, options });
      if (options.method && options.method !== "GET") {
        if (url.endsWith("/deletion-preview"))
          return json(
            previewFailure
              ? { error: { message: "Denied" } }
              : {
                  items: [{ ...topic, attempts: 0, revisionSnapshots: 1, blocked: true }],
                  missingIds: [],
                },
            previewFailure ? 403 : 200,
          );
        if (failure)
          return json({ error: { message: "Concurrent update; reload before saving." } }, failure);
        if (url.endsWith("/bulk-status"))
          return json({
            items: [{ id, outcome: "UPDATED", reason: "Visibility updated" }],
            updated: 1,
            blocked: 0,
          });
        if (options.method === "DELETE")
          return json({
            items: [
              {
                id,
                outcome: "BLOCKED",
                reason: "3 active questions; immutable revision snapshots",
              },
            ],
            deleted: 0,
            blocked: 1,
          });
        return json(topic);
      }
      if (url.endsWith("/delete-policy")) return json({ mode: "permanent-only-v1" });
      if (url.endsWith("/metadata"))
        return json({
          curriculumDomains: [{ id: "d1", title: "Network Fundamentals" }],
          chapters: [{ id: "d1-c1", title: "Introduction to Networking", domainId: "d1" }],
          taxonomyDomains: [],
        });
      if (url.includes("slug-suggestion")) return json({ slug: "new-topic-2" });
      if (url.includes("/manage/" + id))
        return json({
          topic,
          questions: [],
          questionPage: 1,
          questionPages: 1,
          objectives: [],
          objectivesTruncated: false,
        });
      if (url.includes("/manage?")) {
        if (listFailure) return json({ error: { message: "List unavailable" } }, 500);
        const p = Number(new URL(url, "http://localhost").searchParams.get("page"));
        return json({
          items: listEmpty
            ? []
            : [p === 2 ? { ...topic, id: other, name: "Switching", slug: "switching" } : topic],
          total: 26,
          page: p,
          pageSize: 25,
          totalPages: 2,
          stats: { total: 26, active: 24, disabled: 2 },
        });
      }
      return json([]);
    }),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AdminSessionBoundary identity={identity}>
          <AdminTopics />
        </AdminSessionBoundary>
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
it("loads bounded server pages and hides creation form until requested", () => {
  expect(document.querySelector("#topic-name")).toBeNull();
  expect(host.textContent).toContain("Routing");
  expect(calls.some((c) => c.url.includes("pageSize=25"))).toBe(true);
  expect(calls.some((c) => c.url === "/api/admin/topics")).toBe(false);
  expect(host.textContent).toContain("3.1");
});
it("routes creation to canonical management instead of offering arbitrary topics",()=>{
 expect(host.querySelector('a[href="/admin/taxonomy"]')).not.toBeNull();
 expect([...host.querySelectorAll("button")].some(b=>b.textContent?.trim()==="Add topic")).toBe(false);
 expect(calls.some(c=>c.options.method==="POST")).toBe(false);
});
it("keeps canonical title and slug readonly while permitting metadata edits",async()=>{
 await edit();expect((find("#topic-name") as HTMLInputElement).readOnly).toBe(true);expect((find("#topic-slug") as HTMLInputElement).readOnly).toBe(true);
 await input("#topic-description","Updated chapter description");await click('[data-testid="button-save-topic"]');
 const write=calls.find(c=>c.options.method==="PATCH")!;expect(JSON.parse(String(write.options.body)).description).toBe("Updated chapter description");expect(new Headers(write.options.headers).get("X-Admin-Session")).toBe(identity.sessionId);
});
it("protects unsaved changes and returns keyboard focus after discarding", async () => {
  await edit();
  await input("#topic-description", "Unsaved");
  await button("Cancel");
  expect(document.body.textContent).toContain("Discard unsaved changes?");
  await button("Keep editing");
  expect((find("#topic-description") as HTMLTextAreaElement).value).toBe("Unsaved");
  await button("Cancel");
  await button("Discard changes");
  expect(document.querySelector("#topic-name")).toBeNull();
});
it("uses exact edit version and retains draft on concurrent edit failure without retry", async () => {
  await edit();
  await input("#topic-name", "Unsaved edit");
  failure = 409;
  await click('[data-testid="button-save-topic"]');
  expect(
    JSON.parse(String(calls.find((c) => c.options.method === "PATCH")!.options.body))
      .expectedVersion,
  ).toBe(topic.version);
  expect((find("#topic-name") as HTMLInputElement).value).toBe("Unsaved edit");
  expect(document.body.textContent).toContain("Concurrent update");
  expect(calls.filter((c) => c.options.method === "PATCH")).toHaveLength(1);
});
it("debounces literal search and passes it to the server", async () => {
  await input('input[type="search"]', "routing%");
  await settle();
  expect(calls.some((c) => c.url.includes("search=routing%25"))).toBe(true);
});
it("uses server sorting, page sizes and status filters", async () => {
  await input('[aria-label="Sort topics"]', "updatedAt");
  await button("Ascending");
  await input('[aria-label="Rows per page"]', "50");
  await input('[aria-label="Filter status"]', "DISABLED");
  expect(calls.at(-1)!.url).toContain("status=DISABLED");
  expect(calls.at(-1)!.url).toContain("pageSize=50");
  expect(calls.at(-1)!.url).toContain("sort=updatedAt");
  expect(calls.at(-1)!.url).toContain("direction=desc");
});
it("searchable relationship selectors apply exact chapter filters", async () => {
  await click('[aria-label="Chapters"]');
  await input('[placeholder="Search chapters"]', "Introduction");
  const item = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find((e) =>
    e.textContent?.includes("Introduction"),
  )!;
  await act(async () => item.click());
  expect(calls.at(-1)!.url).toContain("chapter=d1-c1");
});
it("preserves selection across pages and clears it when filters change", async () => {
  await click('[aria-label="Select topic ' + id + '"]');
  await button("Next");
  expect(host.textContent).toContain("Switching");
  expect(host.textContent).toContain("1 selected");
  await click('[aria-label="Select all on current filtered page"]');
  expect(host.textContent).toContain("2 selected");
  await input('[aria-label="Filter status"]', "ACTIVE");
  expect(host.textContent).toContain("0 selected");
});
it("confirms bulk visibility and carries exact selected UUIDs and versions across pages", async () => {
  await click('[aria-label="Select topic ' + id + '"]');
  await button("Next");
  await click('[aria-label="Select topic ' + other + '"]');
  await button("Disable selected");
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
  await button("Confirm visibility change");
  const write = calls.find((c) => c.url.endsWith("/bulk-status"))!;
  expect(JSON.parse(String(write.options.body))).toEqual({
    status: "DISABLED",
    items: [
      { id, version: topic.version },
      { id: other, version: topic.version },
    ],
  });
  expect(host.textContent).toContain("0 selected");
});
it("shows dependency preview then reports BLOCKED without silently archiving", async () => {
  await click('[aria-label="Select topic ' + id + '"]');
  await button("Delete Selected");
  expect(document.body.textContent).toContain(
    "3 questions (2 published), 0 attempts, 1 revision snapshots",
  );
  expect(calls.some((c) => c.options.method === "DELETE")).toBe(false);
  await button("Confirm deletion");
  expect(host.textContent).toContain("0 DELETED");
  expect(host.textContent).toContain("1 BLOCKED");
  expect(host.textContent).toContain("Routing");
  expect(calls.some((c) => c.url.includes("/disable"))).toBe(false);
});
it("fails closed when dependency preview fails", async () => {
  previewFailure = true;
  await click('[aria-label="Select topic ' + id + '"]');
  await button("Delete Selected");
  expect((find(".admin-dialog button.button-primary") as HTMLButtonElement).disabled).toBe(true);
  expect(calls.some((c) => c.options.method === "DELETE")).toBe(false);
});
it("renders compact cards and a helpful details empty state with related question navigation", async () => {
  await button("Cards");
  expect(document.querySelector(".topic-card-grid")).not.toBeNull();
  await button("Routing");
  expect(document.body.textContent).toContain("No questions are linked");
  expect(document.querySelector('a[href="/admin/questions?topicId=' + id + '"]')).not.toBeNull();
});
it("validates field boundaries without data changes", () => {
  expect(
    validateTopicForm({
      name: "",
      slug: "a",
      description: "x".repeat(2001),
      displayOrder: "100001",
      status: "ACTIVE",
    }),
  ).toHaveProperty("displayOrder");
  expect(initialTopicSlug("Éthernet")).toBe("ethernet");
  expect(initialTopicSlug("شبكات")).toBe("topic");
});
it("opens contextual actions from the keyboard and edits the selected topic", async () => {
  await act(async () =>
    find('[aria-label="Actions for Routing"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (e) => e.textContent === "Edit topic",
  )!;
  expect(item).toBeTruthy();
  await act(async () => item.click());
  expect((find("#topic-name") as HTMLInputElement).value).toBe("Routing");
});
it("shows recoverable list errors without a write", async () => {
  listFailure = true;
  await input('[aria-label="Sort topics"]', "name");
  expect(host.textContent).toContain("Topics could not load");
  listFailure = false;
  await button("Retry");
  expect(host.textContent).toContain("Routing");
  expect(calls.some((c) => c.options.method !== "GET")).toBe(false);
});
it("shows an empty state for filtered results", async () => {
  listEmpty = true;
  await input('[aria-label="Filter status"]', "DISABLED");
  expect(host.textContent).toContain("No matching topics");
  expect(document.querySelector(".topic-table")).toBeNull();
});
