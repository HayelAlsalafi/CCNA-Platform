// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { AdminQuestionManager } from "./question-bank-studio";
import { AdminSessionBoundary } from "./admin-session-boundary";
import { newStudioForm, validateStudioForm, studioCsv } from "../lib/question-studio-form";
const identity = { userId: "admin-a", sessionId: "session-a" },
  id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  topicId = "33333333-3333-4333-8333-333333333333",
  objectiveId = "44444444-4444-4444-8444-444444444444",
  blueprintId = "55555555-5555-4555-8555-555555555555",
  token = "a".repeat(64);
const question = {
  id,
  questionCode: "CCNA-Q-000001",
  topicId,
  text: "Router# show ip route\n  C 192.0.2.0/24 is directly connected\nWhich route is connected?",
  type: "MULTIPLE_CHOICE_SINGLE",
  difficulty: "MEDIUM",
  status: "ACTIVE",
  explanation: "C identifies a directly connected route in Cisco IOS.",
  referenceNotes: "Cisco exam objective 3.1",
  imageKey: null,
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
  options: ["A", "B", "C", "D"].map((optionKey, i) => ({
    optionKey,
    text: ["192.0.2.0/24", "Default route", "OSPF route", "BGP route"][i],
    isCorrect: i === 0,
    displayOrder: i,
  })),
};
const row = {
  ...question,
  editToken: token,
  topicName: "Routing",
  topicSlug: "routing",
  chapterIds: [],
  objectives: [],
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  calls: { url: string; options: RequestInit }[],
  failure: number,
  previewFailure: boolean;
let savedQuestion: any, savedAssignments: any[], createdTopic: any, readinessReply: any;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const find = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw Error("Missing " + selector);
  return node;
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
async function selectTopic() {
  await click('[aria-label="Choose chapter"]');
  const item = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find((e) =>
    e.textContent?.includes("Routing"),
  )!;
  await act(async () => item.click());
}
async function fill() {
  await selectTopic();
  await input("#question-text", "Which port belongs to VLAN 10?");
  for (const key of ["A", "B", "C", "D"])
    await input('[aria-label="Option ' + key + ' text"]', "Answer " + key);
  await click('[aria-label="Mark option A as correct"]');
}
async function edit() {
  await button(question.questionCode);
  await button("Edit");
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  failure = 0;
  previewFailure = false;
  calls = [];
  savedQuestion=null;savedAssignments=[];createdTopic=null;readinessReply={ready:true,blockers:[],warnings:[]};
  window.history.replaceState({}, "", "/admin/questions");
  localStorage.clear();
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
      if (url.endsWith("/studio/readiness")) return json(readinessReply);
      if (url.includes("/slug-suggestion?")) return json({slug:"inline-transport"});
      if (options.method && options.method !== "GET") {
        if (url.endsWith("/history-delete/preview"))
          return json(
            previewFailure
              ? { error: { message: "Denied" } }
              : {
                  token:other,expiresAt:Date.now()+300000,confirmation:'DELETE QUESTIONS AND THEIR HISTORY',warning:'Shared sessions preserved.',requiresHistory:true,
                  records:[{id,questionCode:question.questionCode,revisions:[id,other],deliveries:[id],attempts:[id],sessionItems:1,sessions:1}],
                },
            previewFailure ? 403 : 200,
          );
        if (url.endsWith("/duplicates"))
          return json({
            items: [{ id: other, questionCode: "CCNA-Q-000002", text: question.text }],
          });
        if (failure)
          return json(
            {
              error: {
                message:
                  failure === 409
                    ? "Possible duplicate question. Review before saving."
                    : "Write rejected",
              },
            },
            failure,
          );
        if (url.endsWith("/bulk"))
          return json({
            items: [{ id, outcome: "UPDATED", reason: "Learner history preserved" }],
            updated: 1,
            blocked: 0,
          });
        if (options.method === "DELETE")
          return json({
            items: [{ id, outcome: "BLOCKED", reason: "Immutable revisions and learner attempts" }],
            deleted: 0,
            blocked: 1,
          });
        if(url.endsWith("/topics/manage")) {
          createdTopic={id:other,name:"Inline Transport",slug:"inline-transport",status:"ACTIVE"};return json(createdTopic);
        }
        const data=JSON.parse(String(options.body));
        savedQuestion={...question,...data.question};savedAssignments=data.assignments??[];
        return json({ question:savedQuestion, editToken: token });
      }
      if (url.endsWith("/delete-policy")) return json({ mode: "permanent-only-v2" });
      if (url.endsWith("/manage/metadata"))
        return json({
          curriculumDomains: [],
          chapters: [{ id: "d1-c1", title: "Network fundamentals", domainId: "d1" }],
          taxonomyDomains: [
            { id: blueprintId, code: "3.0", name: "IP Connectivity", version: "1.1" },
          ],
        });
      if (url.includes("/studio/lookup"))
        return json({
          items:
            new URL(url, "http://localhost").searchParams.get("kind") === "topics"
              ? [
                  {
                    id: topicId,
                    label: "Routing",
                    slug: "routing",
                    status: "ACTIVE",
                    chapterIds: [],
                  },
                ]
              : [
                  {
                    id: objectiveId,
                    label: "3.1 Routing table · 1.1",
                    blueprintId,
                    domainId: blueprintId,
                    code: "3.1",
                  },
                ],
          hasMore: false,
          page: 1,
        });
      if (url.includes("/studio/" + id) || url.includes("/studio/" + other))
        return json({
          question: { ...(savedQuestion??question), id: url.includes(other) ? other : id },
          editToken: token,
          assignments: savedAssignments,
          topicName: "Routing",
          topicSlug: "routing",
          chapterIds: [],
          revisionCount: 2,
          revisions: [{ id: other, contentHash: token, createdAt: question.createdAt }],
          revisionPage: 1,
        });
      if (url.includes("/studio?")) {
        const p = Number(new URL(url, "http://localhost").searchParams.get("page"));
        return json({
          items: [p === 2 ? { ...row, id: other, questionCode: "CCNA-Q-000002" } : row],
          total: 26,
          page: p,
          pageSize: 25,
          totalPages: 2,
          stats: {
            total: 26,
            active: 24,
            disabled: 2,
            missingObjectives: 2,
            easy: 8,
            medium: 10,
            hard: 8,
          },
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
          <AdminQuestionManager />
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
it("replaces permanent creation form with bounded studio listing and honest real-state metrics", () => {
  expect(document.querySelector("#question-text")).toBeNull();
  expect(host.textContent).toContain("Question Bank");
  expect(host.textContent).toContain("Unpublished / disabled");
  expect(calls.some((c) => c.url.includes("pageSize=25"))).toBe(true);
  expect(calls.some((c) => c.url === "/api/admin/questions")).toBe(false);
});
it("creates an unpublished question with four validated options and verified session intent", async () => {
  await button("Create Question");
  await fill();
  await click('[data-testid="button-save-question"]');
  const write = calls.find((c) => c.options.method === "POST")!;
  const body = JSON.parse(String(write.options.body));
  expect(body.question.status).toBe("DISABLED");
  expect(body.question.options).toHaveLength(4);
  expect(new Headers(write.options.headers).get("X-Admin-Session")).toBe(identity.sessionId);
  expect(document.querySelector("#question-text")).toBeNull();
});
it("blocks incomplete publication and shows a publishing checklist", async () => {
  await button("Create Question");
  await fill();
  await input("#question-status", "ACTIVE");
  await click('[data-testid="button-save-question"]');
  expect(document.body.textContent).toContain(
    "Publication requires a useful technical explanation.",
  );
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
  await input("#question-explanation", "An access port is assigned to one data VLAN.");
  await click('[data-testid="button-save-question"]');
  expect(
    JSON.parse(String(calls.find((c) => c.options.method === "POST")!.options.body)).question
      .status,
  ).toBe("ACTIVE");
});
it("requires one correct answer and distinct nonblank choices", async () => {
  await button("Create Question");
  await fill();
  await input('[aria-label="Option B text"]', "Answer A");
  await click('[data-testid="button-save-question"]');
  expect(document.body.textContent).toContain("Answer option text must be distinct");
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
});
it("reorders and removes options without automatically guessing another correct answer", async () => {
  await edit();
  await click('[aria-label="Move option A down"]');
  expect(
    [...document.querySelectorAll(".studio-answer-text textarea")].map(
      (e) => (e as HTMLTextAreaElement).value,
    )[0],
  ).toBe("Default route");
  await click('[aria-label="Remove option A"]');
  await click('[data-testid="button-save-question"]');
  expect(document.body.textContent).toContain("Select exactly one correct answer.");
  expect(calls.some((c) => c.options.method === "PATCH")).toBe(false);
});
it("retains drafts on failed requests and carries an exact content-and-mapping edit token", async () => {
  await edit();
  await input("#question-text", "Unsaved current question");
  failure = 403;
  await click('[data-testid="button-save-question"]');
  const write = calls.find((c) => c.options.method === "PATCH")!;
  expect(JSON.parse(String(write.options.body)).expectedToken).toBe(token);
  expect((find("#question-text") as HTMLTextAreaElement).value).toBe("Unsaved current question");
  expect(document.body.textContent).toContain("Write rejected");
  expect(calls.filter((c) => c.options.method === "PATCH")).toHaveLength(1);
});
it("protects unsaved question changes through accessible discard confirmation", async () => {
  await button("Create Question");
  await input("#question-text", "Unsaved");
  await button("Cancel");
  expect(document.body.textContent).toContain("Discard unsaved question changes?");
  await button("Keep editing");
  expect((find("#question-text") as HTMLTextAreaElement).value).toBe("Unsaved");
  await button("Cancel");
  await button("Discard changes");
  expect(document.querySelector("#question-text")).toBeNull();
});
it("shows possible duplicates and requires deliberate acknowledgement after conflict", async () => {
  await edit();
  await button("Check possible duplicates");
  expect(document.body.textContent).toContain("CCNA-Q-000002");
  failure = 409;
  await click('[data-testid="button-save-question"]');
  expect(document.body.textContent).toContain("Possible duplicate question");
  expect(document.querySelector('.studio-duplicate-warning input[type="checkbox"]')).not.toBeNull();
});
it("saves an explicit chapter UUID and does not recreate objective mappings",async()=>{
 await edit();await selectTopic();expect(document.querySelector('[aria-label="CCNA Exam Objectives"]')).toBeNull();await click('[data-testid="button-save-question"]');
 const body=JSON.parse(String(calls.find(c=>c.options.method==="PATCH")!.options.body));expect(body.question.topicId).toBe(question.topicId);expect(body.assignments).toEqual([]);
});
it("previews answer feedback locally without writing attempts, deliveries or questions", async () => {
  await button(question.questionCode);
  await button("Preview");
  const before = calls.length;
  await click('input[name="preview-answer"]');
  await button("Check preview answer");
  expect(document.body.textContent).toContain("Correct · Correct answer: A");
  expect(document.body.textContent).toContain(question.explanation);
  expect(calls).toHaveLength(before);
});
it("details expose answer keys to Admin with read-only revision references and mapping status", async () => {
  await button(question.questionCode);
  expect(document.body.textContent).toContain("Correct answer");
  expect(document.body.textContent).toContain("2 immutable content revisions");
  expect(document.body.textContent).toContain("Missing chapter mapping");
  expect(document.body.textContent).toContain("Cisco exam objective 3.1");
});
it("duplicates into a new unpublished identity rather than overwriting the source", async () => {
  await button(question.questionCode);
  await button("Duplicate");
  expect((find(".studio-form input[readonly]") as HTMLInputElement).value).toBe(
    "Generated by PostgreSQL after creation",
  );
  await click('.studio-duplicate-warning input[type="checkbox"]');
  await click('[data-testid="button-save-question"]');
  const write = calls.find((c) => c.options.method === "POST")!;
  expect(write.url).toBe("/api/admin/questions/studio");
  expect(JSON.parse(String(write.options.body)).question.status).toBe("DISABLED");
  expect(calls.some((c) => c.options.method === "PATCH")).toBe(false);
});
it("synchronizes search, sorting, filters and pagination to server and URL", async () => {
  await input('input[type="search"]', "router%");
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  await input("#filter-question-difficulty", "HARD");
  await input('[aria-label="Mapping status filter"]', "chapter");
  await input('[aria-label="Sort questions"]', "code");
  await input('[aria-label="Question page size"]', "10");
  await button("Next");
  expect(calls.at(-1)!.url).toContain("page=2");
  expect(calls.at(-1)!.url).toContain("search=router%25");
  expect(window.location.search).toContain("mapping=chapter");
  expect(window.location.search).toContain("pageSize=10");
  await button("Clear all filters");
  expect(window.location.search).not.toContain("difficulty=HARD");
});
it("uses shared server rows for cards and stores only the display preference", async () => {
  await button("Cards");
  expect(document.querySelector(".studio-cards")).not.toBeNull();
  expect(localStorage.getItem("ccna-question-view")).toBe("cards");
  expect(localStorage.length).toBe(1);
  await button("Table");
  expect(document.querySelector(".studio-table")).not.toBeNull();
});
it("keeps cross-page selection but clears it when filters change", async () => {
  await click('[aria-label="Select question ' + id + '"]');
  await button("Next");
  await click('[aria-label="Select all on current filtered page"]');
  expect(host.textContent).toContain("2 selected");
  await input("#filter-question-status", "DISABLED");
  expect(host.textContent).toContain("0 selected");
});
it("confirms exact cross-page bulk UUIDs and token preconditions", async () => {
  await click('[aria-label="Select question ' + id + '"]');
  await button("Next");
  await click('[aria-label="Select question ' + other + '"]');
  await button("Disable selected");
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
  await button("Confirm bulk change");
  expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/bulk"))!.options.body))).toEqual({
    items: [
      { id, editToken: token },
      { id: other, editToken: token },
    ],
    change: { status: "DISABLED" },
  });
  expect(host.textContent).toContain("questions updated");
});
it("previews protected history and requires separate confirmation without implicit archival or history loss", async () => {
  await click('[aria-label="Select question ' + id + '"]');
  await button("Delete Selected");
  expect(document.body.textContent).toContain(
    "1 attempts, 1 deliveries, 2 revisions",
  );
  expect(calls.some((c) => c.options.method === "DELETE")).toBe(false);
  expect((find(".admin-dialog button.button-primary") as HTMLButtonElement).disabled).toBe(true);
  await button("Preview deletion including history");
  expect(document.body.textContent).toContain("I authorize permanent loss");
  expect((find(".admin-dialog button.button-primary") as HTMLButtonElement).disabled).toBe(true);
  expect(calls.some((c) => c.url.includes("/history-delete/confirm"))).toBe(false);
});
it("fails closed when dependency evidence is unavailable", async () => {
  previewFailure = true;
  await click('[aria-label="Select question ' + id + '"]');
  await button("Delete Selected");
  expect((find(".admin-dialog button.button-primary") as HTMLButtonElement).disabled).toBe(true);
  expect(document.body.textContent).toContain("FAILED");
  expect(calls.some((c) => c.options.method === "DELETE")).toBe(false);
});
it("renders technical content as safe text and never executes HTML in preview", async () => {
  await button("Create Question");
  await input("#question-text", "<img src=x onerror=alert(1)>\n  show ip route");
  expect(document.querySelector(".studio-preview img")).toBeNull();
  expect(document.querySelector(".studio-preview")?.textContent).toContain(
    "<img src=x onerror=alert(1)>",
  );
});
it("validates and safely exports summaries without answer keys or spreadsheet formulas", () => {
  expect(validateStudioForm(newStudioForm(), true)).toHaveProperty("options");
  const csv = studioCsv([
    {
      questionCode: "CCNA-Q-1",
      text: '=HYPERLINK("bad")',
      topicName: "Routing",
      difficulty: "EASY",
      status: "ACTIVE",
    },
  ]);
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toMatch(/isCorrect|Correct answer/);
});
it("guards browser Back with a dirty editor and navigates only after explicit discard", async () => {
  await edit();
  await input("#question-text", "Unsaved before Back");
  const original = window.location.href;
  await act(async () => {
    window.history.replaceState({}, "", "/admin/questions?difficulty=EASY");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(window.location.href).toBe(original);
  expect(document.body.textContent).toContain("Discard unsaved question changes?");
  expect((find("#question-text") as HTMLTextAreaElement).value).toBe("Unsaved before Back");
  await button("Discard changes");
  expect(document.querySelector("#question-text")).toBeNull();
  expect(window.location.search).toContain("difficulty=EASY");
});
it("returns keyboard focus to Create Question after closing an unchanged drawer", async () => {
  await button("Create Question");
  await button("Cancel");
  await act(async () => new Promise((r) => setTimeout(r, 10)));
  expect(document.activeElement).toBe(
    document.querySelector('[data-testid="create-studio-question"]'),
  );
});

it("edits Multiple Answers with exact configurable count and sends complete mappings",async()=>{
 await edit();await input('[aria-label="Question Type"]','MULTIPLE_CHOICE_MULTIPLE');
 expect(document.querySelectorAll('.studio-correct input[type="checkbox"]')).toHaveLength(4);
 await click('[aria-label="Mark option B as correct"]');
 await input('[aria-label="Required selection count"]','3');
 await click('[data-testid="button-save-question"]');expect(calls.filter(c=>c.options.method==='PATCH')).toHaveLength(0);
 expect(document.body.textContent).toContain('configured required number');
 await click('[aria-label="Mark option C as correct"]');
 await click('[data-testid="button-save-question"]');
 const payload=JSON.parse(String(calls.find(c=>c.options.method==='PATCH')!.options.body));
 expect(payload.question.type).toBe('MULTIPLE_CHOICE_MULTIPLE');expect(payload.question.options.filter((o:any)=>o.isCorrect)).toHaveLength(3);
 expect(payload.question).not.toHaveProperty('requiredSelectionCount');expect(payload.assignments).toEqual([]);
 expect(calls.some(c=>c.url.endsWith('/studio/'+id)&&(!c.options.method||c.options.method==='GET'))).toBe(true);
 expect(document.body.textContent).toContain('updated.');
 await edit();expect((find('[aria-label="Question Type"]') as HTMLSelectElement).value).toBe('MULTIPLE_CHOICE_MULTIPLE');
 expect((find('[aria-label="Required selection count"]') as HTMLInputElement).value).toBe('3');
});
it("multiple preview uses checkboxes, exact count and full-set feedback without learner writes",async()=>{
 await edit();await input('[aria-label="Question Type"]','MULTIPLE_CHOICE_MULTIPLE');await click('[aria-label="Mark option B as correct"]');
 const choices=[...document.querySelectorAll<HTMLInputElement>('input[name="preview-answer"]')];expect(choices.every(e=>e.type==='checkbox')).toBe(true);
 await act(async()=>choices[0].click());expect((find('.studio-preview button') as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>choices[1].click());await button('Check preview answer');expect(document.querySelector('.studio-preview [role="status"]')?.textContent).toContain('Correct');
 expect(document.querySelector('.studio-preview [role="status"]')?.textContent).toContain('A, B');
 expect(calls.some(c=>c.url.includes('/practice/'))).toBe(false);
});
it("preserves unsaved question edits while choosing a canonical chapter and links to chapter management",async()=>{
 await edit();await input('#question-text','Retained unsaved transport question');await selectTopic();
 expect((find('#question-text') as HTMLTextAreaElement).value).toBe('Retained unsaved transport question');expect(document.querySelector('a[href="/admin/taxonomy"]')).not.toBeNull();expect(document.body.textContent).not.toContain('+ Create New Topic');
 expect(calls.some(c=>c.url.endsWith('/topics/manage')&&c.options.method==='POST')).toBe(false);
});
it("retains question edits and chapter selection after permission failure",async()=>{
 await edit();await input('#question-text','Unsaved main draft');await selectTopic();failure=403;await click('[data-testid="button-save-question"]');
 expect((find('#question-text') as HTMLTextAreaElement).value).toBe('Unsaved main draft');expect(find('[aria-label="Choose chapter"]').textContent).toContain('Routing');expect(document.body.textContent).toContain('Write rejected');
});
it("uses compact server-backed readiness and does not claim Ready on failed server checks",async()=>{
 readinessReply={ready:false,blockers:['Enable the topic before publishing this question.'],warnings:[]};await edit();
 await act(async()=>new Promise(resolve=>setTimeout(resolve,450)));
 expect(document.body.textContent).toContain('Needs Attention');expect(document.body.textContent).not.toContain('Ready to Publish');
 expect((find('.studio-publish-checklist') as HTMLDetailsElement).open).toBe(true);
 expect(document.body.textContent).toContain('Enable the topic before publishing this question.');
});
