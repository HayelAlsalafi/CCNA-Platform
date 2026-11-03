// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "learner-a",
  sessionId: "session-a",
}));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
import { ExamSimulatorPage } from "./exam-simulator";
const qid = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
let host: HTMLDivElement,
  root: Root,
  client: QueryClient,
  run: any,
  calls: { url: string; body: any }[],
  available: number,
  ready: boolean,
  saveFail: boolean,
  availabilityFail: boolean;
function question(multi = false) {
  return {
    deliveryId: multi
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
    position: multi ? 1 : 0,
    removed: false,
    questionCode: multi ? "CCNA-Q-000002" : "CCNA-Q-000001",
    text: multi ? "Select transport protocols." : "Select a transport protocol.",
    type: multi ? "MULTIPLE_CHOICE_MULTIPLE" : "MULTIPLE_CHOICE_SINGLE",
    options: [
      { optionKey: "A", text: "UDP" },
      { optionKey: "B", text: "TCP" },
      { optionKey: "C", text: "Ethernet" },
    ],
    requiredSelectionCount: multi ? 2 : 1,
    selectedOptionKeys: [],
    flagged: false,
    answerVersion: 0,
    mapping: {
      chapter: { id: qid, code: "CCNA-V1-01", title: "Networking", volume: "V1", chapterNumber: 1 },
      domain: { id: qid, code: "1.0", name: "Network Fundamentals" },
    },
  };
}
const response = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  available = 2;
  ready = true;
  saveFail = false;
  availabilityFail = false;
  calls = [];
  Object.assign(auth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "learner-a",
    sessionId: "session-a",
  });
  run = {
    id,
    status: "ACTIVE",
    config: {},
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 300000).toISOString(),
    serverNow: new Date().toISOString(),
    finalizedAt: null,
    needsFinalization: false,
    contentRemoved: false,
    questionCount: 2,
    result: null,
    questions: [question(), question(true)],
  };
  window.history.replaceState({}, "", "/exam");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler((fn) => fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      const text = String(url),
        body = options.body ? JSON.parse(String(options.body)) : null;
      calls.push({ url: text, body });
      if (text.includes("/availability") && availabilityFail) return response({ error: { message: "Availability unavailable" } }, 503);
      if (text.includes("/availability"))
        return response({
          ready,
          available,
          chapters: [
            {
              id: qid,
              code: "CCNA-V1-01",
              title: "Networking",
              volume: "V1",
              chapterNumber: 1,
              domainId: qid,
              domainCode: "1.0",
              domainName: "Network Fundamentals",
              weight: 20,
              available,
            },
          ],
          limits: { maxQuestions: 100, minMinutes: 5, maxMinutes: 180 },
          gradingPolicy: "equal-weight-complete-set-v1",
        });
      if (text.includes("/items/")) {
        expect(new Headers(options.headers).get("x-practice-session")).toBe("session-a");
        if (saveFail)
          return response({ error: { message: "Save unavailable. Refresh recorded state." } }, 503);
        const q = run.questions.find((q: any) => text.endsWith(q.deliveryId));
        q.selectedOptionKeys = body.selectedOptionKeys;
        q.flagged = body.flagged;
        q.answerVersion++;
        return response(run);
      }
      if (text.endsWith("/submit")) {
        run.status = run.needsFinalization ? "EXPIRED" : "SUBMITTED";
        run.result = {
          total: 2,
          correct: 2,
          incorrect: 0,
          unanswered: 0,
          percentage: 100,
          completionSeconds: 12,
          domains: [],
          chapters: [],
        };
        for (const q of run.questions) {
          q.result = { outcome: "CORRECT", isCorrect: true };
          q.review = {
            correctOption: { optionKey: "A", text: "UDP" },
            ...(q.type === "MULTIPLE_CHOICE_MULTIPLE"
              ? {
                  correctOptions: [
                    { optionKey: "A", text: "UDP" },
                    { optionKey: "B", text: "TCP" },
                  ],
                }
              : {}),
            explanation: "SERVER EXPLANATION",
          };
        }
        return response(run);
      }
      if (options.method === "POST") {
        expect(body).not.toHaveProperty("userId");
        return response(run);
      }
      if (text.includes("?page="))
        return response({
          items: [
            {
              id,
              status: run.status,
              startedAt: run.startedAt,
              questionCount: 2,
              result: run.result,
            },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        });
      return response(run);
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ExamSimulatorPage />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(el: HTMLElement | null) {
  expect(el).not.toBeNull();
  await act(async () => el!.click());
  await flush();
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
async function input(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}
it("empty and migration-pending banks provide honest states and no start action", async () => {
  available = 0;
  ready = false;
  await render();
  expect(host.textContent).toContain("No published questions");
  expect(host.textContent).toContain("reviewed runtime permissions");
  expect(button("Start exam").disabled).toBe(true);
});
it("starts an owned configured exam and keeps the stable session deep link", async () => {
  await render();
  await input(host.querySelector("input[type=number]")!, "2");
  await click(button("Start exam"));
  expect(window.location.search).toBe("?session=" + id);
  expect(host.textContent).toContain("Select a transport protocol.");
  expect(calls.find((c) => c.body?.requestId)?.body).toMatchObject({
    questionCount: 2,
    durationMinutes: 5,
  });
});
it("resumes answers, review flags and question order from the server after refresh", async () => {
  run.questions[0].selectedOptionKeys = ["A"];
  run.questions[0].flagged = true;
  window.history.replaceState({}, "", "/exam?session=" + id);
  await render();
  expect(host.querySelector<HTMLInputElement>("input[type=radio]")?.checked).toBe(true);
  expect(button("Unmark review")).not.toBeNull();
  expect(host.textContent).not.toContain("SERVER EXPLANATION");
});
it("saves single and multiple choices using the expected version and shows results only after submit", async () => {
  window.history.replaceState({}, "", "/exam?session=" + id);
  await render();
  await click(host.querySelector("input[type=radio]"));
  expect(calls.find((c) => c.body?.expectedVersion === 0)?.body.selectedOptionKeys).toEqual(["A"]);
  await click(button("Next"));
  expect(host.textContent).toContain("Choose 2 answers");
  await click(host.querySelector("input[type=checkbox]"));
  await click(host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1]);
  expect(run.questions[1].selectedOptionKeys).toEqual(["A", "B"]);
  expect(host.textContent).not.toContain("SERVER EXPLANATION");
  await click(button("Submit exam"));
  expect(document.querySelector("[role=alertdialog]")).not.toBeNull();
  await click(button("Submit and grade saved answers"));
  expect(host.textContent).toContain("Exam results");
  expect(host.textContent).toContain("100.0%");
  expect(host.textContent).toContain("SERVER EXPLANATION");
});
it("failed save preserves the local selection and prevents assumed success or submission", async () => {
  saveFail = true;
  window.history.replaceState({}, "", "/exam?session=" + id);
  await render();
  await click(host.querySelector("input[type=radio]"));
  expect(host.textContent).toContain("not confirmed saved");
  expect(button("Submit exam").disabled).toBe(true);
  expect(run.questions[0].selectedOptionKeys).toEqual([]);
  saveFail = false;
  await click(button("Retry saving"));
  expect(run.questions[0].selectedOptionKeys).toEqual(["A"]);
  expect(button("Submit exam").disabled).toBe(false);
});
it("expiration requests server finalization and disables further editing", async () => {
  run.needsFinalization = true;
  run.deadlineAt = new Date(Date.now() - 1000).toISOString();
  window.history.replaceState({}, "", "/exam?session=" + id);
  await render();
  await flush();
  expect(calls.filter((c) => c.url.endsWith("/submit"))).toHaveLength(1);
  expect(host.textContent).toContain("Expired exam results");
});
it("owned history resumes the exact saved session", async () => {
  await render();
  await click(
    [...host.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === "Resume")!,
  );
  expect(window.location.search).toBe("?session=" + id);
  expect(host.textContent).toContain("Select a transport protocol.");
});
it("signed-out visitors see sign-in without leaking an existing run", async () => {
  auth.isSignedIn = false;
  window.history.replaceState({}, "", "/exam?session=" + id);
  await render();
  expect(host.textContent).toContain("Sign in to save exams");
  expect(host.textContent).not.toContain("Select a transport protocol");
  expect(calls).toHaveLength(0);
});

it("uses real availability, blocks oversized presets and never invents history statistics", async () => {
  available = 16; ready = false;
  await render();
  const metrics = host.querySelector("[aria-label='Exam statistics']")!;
  expect(metrics.textContent).toContain("16");
  expect(metrics.textContent).toContain("History not available");
  expect(metrics.querySelectorAll("strong")[1].textContent).toBe("\u2014");
  expect(metrics.querySelectorAll("strong")[2].textContent).toBe("\u2014");
  expect(button("Custom").disabled).toBe(false);
  expect(button("30").disabled).toBe(true);
  expect(button("100").disabled).toBe(true);
  expect(button("Start exam").disabled).toBe(true);
  expect(calls.some(c => c.url.includes("?page="))).toBe(false);
  expect(host.textContent).toContain("No demo questions will be used");
});
it("updates configuration summary and preserves domain and chapter selection payloads", async () => {
  available = 16;
  await render();
  await input(host.querySelector("#exam-question-count")!, "10");
  await click(button("60 min"));
  const summary = host.querySelector(".exam-summary")!;
  expect(summary.textContent).toContain("6.0 min");
  expect(summary.textContent).toContain("All Domains");
  await click(host.querySelector(".exam-domain-card input"));
  expect(summary.textContent).toContain("1 selected");
  await click(host.querySelector(".exam-chapters summary"));
  await click(host.querySelector(".exam-chapter-select input"));
  await click(button("Start exam"));
  expect(calls.find(c => c.body?.requestId)?.body).toMatchObject({ questionCount: 10, durationMinutes: 60, domainIds: [qid], chapterIds: [qid] });
});
it("availability failure is unavailable rather than zero and cannot start an exam", async () => {
  availabilityFail = true;
  await render();
  expect(host.textContent).toContain("Availability unavailable");
  expect(host.querySelector(".exam-metric strong")?.textContent).toBe("\u2014");
  expect(button("Retry availability")).toBeTruthy();
  expect(button("Start exam").disabled).toBe(true);
  expect(calls.some(c => c.body?.requestId)).toBe(false);
});
it("invalid custom values have feedback and no misleading pace", async () => {
  await render();
  await input(host.querySelector("#exam-question-count")!, "101");
  expect(host.querySelector("#exam-question-count")?.getAttribute("aria-invalid")).toBe("true");
  expect(host.textContent).toContain("Choose a whole number from 1 to 2");
  expect(button("Start exam").disabled).toBe(true);
  expect(host.querySelector(".exam-summary dl > div:last-child dd")?.textContent).toBe("\u2014");
});

it("scales automatic practice timing for 30, 60 and 100 question presets", async () => {
  available = 100;
  await render();
  for (const [count, minutes] of [[30, 36], [60, 72], [100, 120]]) {
    await click(button(String(count)));
    expect(host.querySelector<HTMLInputElement>("#exam-duration")!.value).toBe(String(minutes));
    expect(host.querySelector(".exam-summary")!.textContent).toContain("1.2 min");
  }
  expect(host.textContent).toContain("Practice approximation");
  expect(button("Automatic timing").getAttribute("aria-pressed")).toBe("true");
});
it("preserves manual timing until automatic timing is explicitly restored", async () => {
  available = 100;
  await render();
  await input(host.querySelector("#exam-duration")!, "50");
  await click(button("60"));
  expect(host.querySelector<HTMLInputElement>("#exam-duration")!.value).toBe("50");
  await click(button("Restore automatic timing"));
  expect(host.querySelector<HTMLInputElement>("#exam-duration")!.value).toBe("72");
  await click(button("Custom"));
  expect(document.activeElement?.id).toBe("exam-question-count");
  await input(host.querySelector("#exam-question-count")!, "16");
  expect(host.querySelector<HTMLInputElement>("#exam-duration")!.value).toBe("19");
  await input(host.querySelector("#exam-question-count")!, "1");
  expect(host.querySelector<HTMLInputElement>("#exam-duration")!.value).toBe("5");
  expect(host.textContent).toContain("Minimum duration is 5 minutes");
});
it("does not shrink a chosen exam when the eligible bank changes", async () => {
  available = 100;
  await render();
  await click(button("60"));
  available = 16;
  await act(async () => { await client.invalidateQueries({ queryKey: ["/api/exams/availability"] }); });
  await flush();
  expect(host.querySelector<HTMLInputElement>("#exam-question-count")!.value).toBe("60");
  expect(button("Start exam").disabled).toBe(true);
  expect(button("60").disabled).toBe(true);
});
