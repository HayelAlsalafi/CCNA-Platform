// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ccnaBookDomains, ccnaBookChapters } from "../lib/ccna-book-chapters";
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./admin-session-boundary", () => ({
  useAdminSession: () => ({
    identity: { userId: "admin", sessionId: "session" },
    isCurrent: () => true,
    capture: () => () => true,
  }),
}));
vi.mock("@workspace/api-client-react", async (original) => ({
  ...(await original<typeof import("@workspace/api-client-react")>()),
  adminContentRequest: state.request,
  useAdminListQuestions: () => ({ data: { items: [] } }),
}));
import { AdminTaxonomyManager } from "./admin-taxonomy";
import { TaxonomyBookChapters } from "./taxonomy-book-chapters";
const bp = "11111111-1111-4111-8111-111111111111",
  did = "22222222-2222-4222-8222-222222222222",
  oid = "33333333-3333-4333-8333-333333333333";
const catalog = {
  blueprints: [
    {
      id: bp,
      examCode: "200-301",
      version: "1.1",
      title: "CCNA",
      status: "DRAFT",
      sourceUrl: null,
      verifiedAt: null,
    },
  ],
  domains: [
    {
      id: did,
      blueprintId: bp,
      code: "1.0",
      name: "Network Fundamentals",
      weightPercent: 20,
      displayOrder: 0,
    },
  ],
  objectives: [
    {
      id: oid,
      domainId: did,
      blueprintId: bp,
      domainCode: "1.0",
      code: "1.1",
      description: "Describe network components",
      displayOrder: 0,
    },
  ],
};
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  window.history.replaceState({}, "", "/admin/taxonomy");
  state.request
    .mockReset()
    .mockImplementation(async (path: string) => (path.includes("/questions/") ? [] : catalog));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  document.documentElement.lang = "en";
  document.documentElement.removeAttribute("dir");
  notifyManager.setScheduler((fn) => setTimeout(fn, 0));
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
async function render(manager = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {manager ? <AdminTaxonomyManager /> : <TaxonomyBookChapters />}
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function click(label: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  )!;
  expect(b).toBeDefined();
  await act(async () => {
    b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    b.click();
  });
}
async function input(node: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  });
}
it("renders six ordered domain sections with exact weights/counts and all 48 chapters in three-column tables", async () => {
  await render();
  const sections = [...host.querySelectorAll(".book-domain-section")];
  expect(sections).toHaveLength(6);
  sections.forEach((section, i) => {
    const d = ccnaBookDomains[i];
    expect(section.querySelector("h3")?.textContent).toBe(d.name);
    expect(section.querySelector(".book-domain-code")?.textContent).toBe(d.code);
    expect(section.querySelector(".book-domain-weight strong")?.textContent).toBe(
      `${d.examWeight}%`,
    );
    expect(section.querySelector("header p")?.textContent).toContain(
      `${d.chapters.length} chapters`,
    );
    expect([...section.querySelectorAll("thead th")].map((n) => n.textContent)).toEqual([
      "Book",
      "Chapter",
      "Chapter title",
    ]);
    expect(section.querySelectorAll("tbody tr")).toHaveLength(d.chapters.length);
  });
  expect(host.querySelectorAll("tbody tr")).toHaveLength(48);
  expect(
    [...host.querySelectorAll("tbody tr")].map((row) => [
      row.querySelector("td span")?.textContent,
      Number(row.querySelectorAll("td")[1].textContent),
      row.querySelector("th")?.textContent,
    ]),
  ).toEqual(ccnaBookChapters.map((c) => [c.volume, c.chapterNumber, c.title]));
  expect(state.request).not.toHaveBeenCalled();
});
it("filters V2 and chapter search together, keeps original numbering and resets the complete reference", async () => {
  await render();
  await input(host.querySelector("select")!, "V2");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(19);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("19 of 48");
  await input(host.querySelector('input[type="search"]')!, "chef");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.querySelector(".book-chapter-number")?.textContent).toBe("19");
  expect(host.querySelector(".book-domain-weight strong")?.textContent).toBe("10%");
  await click("Clear filters");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(48);
});
it("has a useful no-match state and a keyboard-focusable reset", async () => {
  await render();
  await input(host.querySelector('input[type="search"]')!, "nonexistent-reference");
  expect(host.textContent).toContain("No matching chapters");
  expect(host.querySelector("table")).toBeNull();
  await click("Clear filters");
  expect(host.querySelectorAll("table")).toHaveLength(6);
});
it("localizes table labels and supports RTL while preserving English book titles", async () => {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  await render();
  expect(host.querySelector(".taxonomy-book-view")?.getAttribute("dir")).toBe("rtl");
  expect([...host.querySelectorAll("thead th")].slice(0, 3).map((n) => n.textContent)).toEqual([
    "الكتاب",
    "الفصل",
    "عنوان الفصل",
  ]);
  expect(host.querySelector('tbody th[lang="en"] bdi[dir="ltr"]')?.textContent).toBe(
    "Introduction to TCP/IP Networking",
  );
  expect(document.documentElement.lang).toBe("ar");
});

it("replaces objective management with chapter management and does not write during browsing",async()=>{
 await render(true);expect(host.textContent).toContain("Chapters & domains");expect(host.textContent).not.toContain("Blueprints & objectives");
 expect(host.textContent).toContain("awaiting the separately confirmed development reset");
 await click("Book chapters");expect(host.querySelectorAll("tbody tr")).toHaveLength(48);
 expect(state.request.mock.calls.every(c=>!c[1]?.method)).toBe(true);
});
it("preserves the book reference deep link",async()=>{
 window.history.replaceState({},"","/admin/taxonomy?view=book-chapters");await render(true);
 expect(host.querySelectorAll(".book-domain-section")).toHaveLength(6);
});
it("lists, filters and edits persisted chapters with an exact concurrency token",async()=>{
 const c=ccnaBookChapters[0],version="2026-10-17T10:00:00.123456Z";
 state.request.mockImplementation(async(_path:string,options:any)=>options?.method?{}:{...catalog,canonicalReady:true,chapters:[{id:c.topicId,code:c.code,volume:c.volume,chapterNumber:c.chapterNumber,title:c.title,slug:c.slug,description:"",domainCode:c.primaryDomain,domainId:did,blueprintId:bp,status:"ACTIVE",displayOrder:0,version,questionCount:0}]});
 await render(true);expect(host.textContent).toContain(c.title);
 await click("Edit "+c.code);await click("Save chapter");
 const write=state.request.mock.calls.find(c=>c[1]?.method==="PUT");expect(write?.[0]).toBe(`/api/admin/taxonomy/chapters/${c.topicId}`);
 expect(JSON.parse(write?.[1].body)).toEqual({code:c.code,description:"",status:"ACTIVE",displayOrder:0,expectedVersion:version});
});
