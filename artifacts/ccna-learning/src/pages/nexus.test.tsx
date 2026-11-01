// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { accuracy, recommendTopic } from "../lib/nexus";
import { NetworkTopologyMap, LearningAnalytics } from "../components/nexus-visuals";
import { NexusPractice } from "./nexus-practice";
import { SubmitPracticeAnswerBody } from "@workspace/api-zod";
import { NexusOverview } from "./nexus-overview";
import { NexusHistory } from "./nexus-history";
const auth = { isLoaded: true, isSignedIn: true, userId: "learner-a", sessionId: "session-a" };
vi.mock("@clerk/react", () => ({
  useAuth: () => auth,
  useUser: () => ({ user: { id: auth.userId, firstName: "Alex" } }),
}));
const domain = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "1",
  name: "Network Fundamentals",
  version: "1.1",
  available: 10,
  attempted: 2,
  attempts: 4,
  correct: 3,
  chapters: 5,
  covered_chapters: 2,
};
const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "IPv4 addressing",
  available: 10,
  attempts: 4,
  correct: 3,
  attempted: 2,
};
const analytics = {
  totals: { attempts: 4, correct: 3, unique: 2, available: 10, unmapped: 0, lastActivity: null },
  domains: [domain],
  topics: [topic],
  timeline: [],
  sessions: { items: [], total: 0 },
  persistence: true,
  resume: null,
  granularity: "day",
  taxonomyBasis: "Current mappings",
};
const q = {
  id: "33333333-3333-4333-8333-333333333333",
  deliveryId: "44444444-4444-4444-8444-444444444444",
  revisionId: "55555555-5555-4555-8555-555555555555",
  questionCode: "CCNA-Q-000001",
  expiresAt: "2030-01-01",
  topic,
  text: "Which prefix is a /24?",
  difficulty: "EASY",
  options: [
    { optionKey: "A", text: "255.255.255.0" },
    { optionKey: "B", text: "255.255.0.0" },
  ],
  domains: [domain],
  selected: null,
  flagged: false,
  result: null,
};
let root: Root,
  host: HTMLDivElement,
  calls: { url: string; options: RequestInit }[],
  mode: string,
  selected: string | null;
let multiple=false, flagged=false;
let persistence = true,
  questionCount = 1;
beforeEach(() => {
  Object.assign(auth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "learner-a",
    sessionId: "session-a",
  });
  multiple=false;flagged=false;
  mode = "PRACTICE";
  persistence = true;
  questionCount = 1;
  selected = null;
  calls = [];
  window.history.replaceState({}, "", "/practice");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler((fn) => fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      calls.push({ url: String(url), options });
      let body: any;
      if (String(url).includes("/nexus/progress"))
        body = {
          timezone: "UTC",
          framework: {
            id: "ccna-practice-evidence.v1",
            minimumAnswers: 10,
            minimumUnique: 3,
            sampleTarget: 20,
          },
          skills: [],
          evidence: { attempts: 4, correct: 3, unique: 2, sessions: 0, streak: 0 },
          capabilities: { sessions: false, achievements: false },
          badges: [],
        };
      else if (String(url).includes("/nexus/activity"))
        body = {
          year: 2026,
          timezone: "UTC",
          days: [],
          totals: { answers: 0, sessions: 0, activeDays: 0, longestStreak: 0 },
          supportedEvents: { PRACTICE_COMPLETED: false },
        };
      else if (String(url).includes("analytics")) body = analytics;
      else if (String(url).includes("/api/practice/history"))
        body = { items: [], nextCursor: null };
      else if (String(url).includes("sessions?"))
        body = {
          items: [
            {
              id: "run",
              mode: "LEARN",
              status: "COMPLETED",
              createdAt: "2026-10-14T12:00:00Z",
              questionCount: 1,
              answered: 1,
              correct: 1,
              topics: "IPv4 addressing",
            },
          ],
          total: 11,
          page: Number(new URL(String(url), "http://localhost").searchParams.get("page") || 1),
          totalPages: 2,
        };
      else if (String(url).includes("availability"))
        body = { available: 10, persistence, topics: [topic] };
      else if (options.method === "PATCH") {
        selected = JSON.parse(options.body as string).optionKey;
        flagged = JSON.parse(options.body as string).flagged;
        body = { saved: true };
      } else if (String(url).endsWith("/answer"))
        body = {
          isCorrect: true,
          correctOption: q.options[0],
          explanation: "A /24 leaves eight host bits.",
        };
      else if (String(url).endsWith("/finish") || String(url).endsWith("/submissions"))
        body = {
          id: persistence ? "run" : null,
          mode,
          status: "COMPLETED",
          questions: [
            {
              ...q,
              ...(multiple ? {type:"MULTIPLE_CHOICE_MULTIPLE",requiredSelectionCount:2} : {}),
              flagged: String(url).endsWith("/submissions") ? JSON.parse(String(options.body)).answers[0].flagged : flagged,
              selected: String(url).endsWith("/submissions")
                ? JSON.parse(options.body as string).answers[0].optionKey
                : selected,
              result: {
                isCorrect: true,
                correctOption: q.options[0],
                ...(multiple ? {correctOptions:q.options} : {}),
                explanation: "A /24 leaves eight host bits.",
              },
            },
          ],
          persistence,
        };
      else {
        if (options.method === "POST") mode = JSON.parse(options.body as string).mode;
        body = {
          id: persistence ? "run" : null,
          mode,
          status: "ACTIVE",
          persistence,
          canResume: true,
          questions: Array.from({ length: questionCount }, (_, i) => ({
            ...q,
            ...(multiple ? {type:"MULTIPLE_CHOICE_MULTIPLE",requiredSelectionCount:2} : {}),
            id: i ? "66666666-6666-4666-8666-666666666666" : q.id,
            deliveryId: i ? "77777777-7777-4777-8777-777777777777" : q.deliveryId,
            selected,
            result:
              String(url).endsWith("/run") &&
              selected &&
              calls.some((c) => c.url.endsWith("/answer"))
                ? {
                    isCorrect: true,
                    correctOption: q.options[0],
                ...(multiple ? {correctOptions:q.options} : {}),
                    explanation: "A /24 leaves eight host bits.",
                  }
                : null,
          })),
        };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        {node}
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function chooseMode(mode: string) {
  const select = Array.from(host.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === "LEARN"),
  )!;
  await act(async () => {
    select.value = mode;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
}
it("does not invent accuracy for zero submissions", () => {
  expect(accuracy(0, 0)).toBeNull();
  expect(accuracy(3, 4)).toBe(75);
});
it("prioritizes weaknesses only after five answers and otherwise expands coverage", () => {
  expect(
    recommendTopic([
      { ...topic, id: "few", attempts: 1, correct: 0, attempted: 1 },
      { ...topic, id: "weak", attempts: 5, correct: 2, attempted: 5 },
    ])?.id,
  ).toBe("weak");
  expect(recommendTopic([{ ...topic, available: 0 }])).toBeNull();
});
it("keeps domain coverage and accuracy separate and offers a keyboard-accessible list", async () => {
  await render(<NetworkTopologyMap domains={[domain]} />);
  expect(host.textContent).toContain("10 available");
  expect(host.textContent).toContain("75% accuracy");
  expect(host.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("20");
  await click("Accessible list");
  await click("Network Fundamentals");
  expect(host.textContent).toContain("2/5 chapters");
  expect(host.textContent).toContain("Small sample");
});
it("shows an honest empty analytics state instead of a fabricated chart", async () => {
  await render(<LearningAnalytics data={analytics as any} range="30" onRange={() => {}} />);
  expect(host.textContent).toContain("build this timeline");
  expect(host.querySelector("polyline")).toBeNull();
});
it("shows real availability and creates an authenticated revision-bound session", async () => {
  await render(<NexusPractice />);
  expect(host.textContent).toContain("10");
  await click("Start Practice");
  expect(
    new Headers(calls.find((c) => c.options.method === "POST")?.options.headers).get(
      "X-Practice-Session",
    ),
  ).toBe("session-a");
  expect(host.textContent).toContain("Which prefix");
  expect(host.textContent).not.toContain("A /24 leaves");
});
it("persists selection before Learn grading and displays only server feedback", async () => {
  await render(<NexusPractice />);
  await chooseMode("LEARN");
  await click("Start Practice");
  await act(async () => {
    host.querySelector<HTMLInputElement>("input[type=radio]")!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(calls.find((c) => c.options.method === "PATCH")?.options.body).toContain(
    '"optionKey":"A"',
  );
  expect(calls.some((c) => c.url.endsWith("/answer"))).toBe(false);
  await click("Check answer (Learn mode)");
  expect(host.textContent).toContain("A /24 leaves eight host bits");
});
it("Practice mode defers grading until explicit Finish confirmation", async () => {
  await render(<NexusPractice />);
  const select = Array.from(host.querySelectorAll("select")).find((s) =>
    s.textContent?.includes("Learn ·"),
  )!;
  await act(async () => {
    select.value = "PRACTICE";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Start Practice");
  await act(async () => {
    host.querySelector<HTMLInputElement>("input[type=radio]")!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(calls.some((c) => c.url.endsWith("/answer"))).toBe(false);
  expect(host.textContent).not.toContain("Submit answer");
  await click("Finish & Submit");
  expect(document.body.textContent).toContain("Finish and grade");
  expect(calls.some((c) => c.url.endsWith("/finish"))).toBe(false);
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    (b) => b.textContent === "Finish & Submit",
  );
  await act(async () => {
    buttons.at(-1)!.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(host.textContent).toContain("Challenge complete");
  expect(host.textContent).toContain("100%");
});
it("does not request learner data or start sessions when signed out", async () => {
  auth.isSignedIn = false;
  await render(<NexusPractice />);
  expect(host.textContent).toContain("Sign in to start");
  expect(calls).toHaveLength(0);
});
it("Overview displays real totals and personalized identity without invented readiness", async () => {
  await render(<NexusOverview />);
  expect(host.textContent).toContain("Welcome back, Alex");
  expect(host.textContent).toContain("3 correct of 4");
  expect(host.textContent).toContain("10 questions currently available");
  expect(host.textContent).not.toContain("exam ready");
});
it("history paginates persisted sessions and separates original individual answers", async () => {
  await render(<NexusHistory />);
  expect(host.textContent).toContain("Original submissions, preserved");
  expect(host.textContent).toContain("IPv4 addressing");
  await click("Next");
  expect(calls.some((c) => c.url.includes("sessions?page=2"))).toBe(true);
});
it("resume loads the owned run without creating another delivery", async () => {
  window.history.replaceState({}, "", "/practice?resume=11111111-1111-4111-8111-111111111111");
  await render(<NexusPractice />);
  expect(host.textContent).toContain("Which prefix");
  expect(calls.some((c) => c.options.method === "POST")).toBe(false);
});
it("failed availability keeps Start disabled and offers retry", async () => {
  vi.mocked(fetch).mockRejectedValue(Error("offline"));
  await render(<NexusPractice />);
  const button = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Start Practice"),
  );
  expect(button?.disabled).toBe(true);
  expect(host.textContent).toContain("Retry availability");
});
it("flagging saves only the owned question state without grading", async () => {
  await render(<NexusPractice />);
  await click("Start Practice");
  await click("Flag for review");
  expect(calls.find((c) => c.options.method === "PATCH")?.options.body).toContain('"flagged":true');
  expect(calls.some((c) => c.url.endsWith("/answer"))).toBe(false);
});

it("untracked Learn sends the exact optionKey contract accepted by the real API validator", async () => {
  persistence = false;
  await render(<NexusPractice />);
  await chooseMode("LEARN");
  await click("Start Practice");
  await act(async () => {
    host.querySelector<HTMLInputElement>("input[type=radio]")!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Check answer (Learn mode)");
  const request = calls.find(
    (c) => c.url.includes("/api/practice/questions/") && c.url.endsWith("/answer"),
  )!;
  const body = JSON.parse(request.options.body as string);
  expect(body).toEqual({ optionKey: "A", deliveryId: q.deliveryId });
  expect(SubmitPracticeAnswerBody.strict().safeParse(body).success).toBe(true);
  expect(
    SubmitPracticeAnswerBody.strict().safeParse({
      selectedOptionKey: "A",
      deliveryId: q.deliveryId,
    }).success,
  ).toBe(false);
  expect(SubmitPracticeAnswerBody.strict().safeParse({ ...body, optionKey: "" }).success).toBe(
    false,
  );
  expect(host.textContent).toContain("A /24 leaves eight host bits");
});
it("untracked Practice uses one atomic final-submit request after confirmation", async () => {
  persistence = false;
  await render(<NexusPractice />);
  await click("Start Practice");
  expect(host.textContent).not.toContain("Check answer");
  await act(async () => {
    host.querySelector<HTMLInputElement>("input[type=radio]")!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Finish & Submit");
  expect(calls.some((c) => c.url.endsWith("/submissions"))).toBe(false);
  const confirm = Array.from(document.querySelectorAll("button"))
    .filter((b) => b.textContent === "Finish & Submit")
    .at(-1)!;
  await act(async () => {
    confirm.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(calls.filter((c) => c.url.endsWith("/submissions"))).toHaveLength(1);
  expect(calls.some((c) => c.url.includes("/api/practice/questions/"))).toBe(false);
  expect(host.textContent).toContain("Challenge complete");
});

it("Practice exposes final submission only at the final question and preserves editable choices", async () => {
  questionCount = 2;
  await render(<NexusPractice />);
  await click("Start Practice");
  expect(host.textContent).not.toContain("Finish & Submit");
  expect(host.textContent).not.toContain("Check answer");
  await act(async () => {
    host.querySelectorAll<HTMLInputElement>("input[type=radio]")[0].click();
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Next Question");
  expect(host.textContent).toContain("Finish & Submit");
  const finish = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === "Finish & Submit",
  )!;
  expect(finish.disabled).toBe(true);
  expect(host.textContent).toContain("unanswered");
  await click("Previous");
  expect(host.querySelectorAll<HTMLInputElement>("input[type=radio]")[0].checked).toBe(true);
  await act(async () => {
    host.querySelectorAll<HTMLInputElement>("input[type=radio]")[1].click();
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Next Question");
  await act(async () => {
    host.querySelectorAll<HTMLInputElement>("input[type=radio]")[1].click();
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Finish & Submit")
      ?.disabled,
  ).toBe(false);
  expect(
    calls.some(
      (c) =>
        c.url.endsWith("/answer") || c.url.endsWith("/finish") || c.url.endsWith("/submissions"),
    ),
  ).toBe(false);
});

it("uncertain final submission locks choices and retries the same payload without duplicate writes", async () => {
  persistence = false;
  const original = vi.mocked(fetch).getMockImplementation()!,
    payloads: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input: any, options: any) => {
    if (String(input).endsWith("/submissions")) {
      payloads.push(options.body);
      if (payloads.length === 1)
        return new Response(
          JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "Final result unavailable." },
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
    }
    return original(input, options);
  });
  await render(<NexusPractice />);
  await click("Start Practice");
  await act(async () => {
    host.querySelector<HTMLInputElement>("input[type=radio]")!.click();
    await new Promise((r) => setTimeout(r, 30));
  });
  await click("Finish & Submit");
  let confirm = Array.from(document.querySelectorAll("button"))
    .filter((b) => b.textContent === "Finish & Submit")
    .at(-1)!;
  await act(async () => {
    confirm.click();
    confirm.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(payloads).toHaveLength(1);
  expect(host.textContent).toContain("Final submission is unconfirmed");
  expect(host.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
  await click("Finish & Submit");
  confirm = Array.from(document.querySelectorAll("button"))
    .filter((b) => b.textContent === "Finish & Submit")
    .at(-1)!;
  await act(async () => {
    confirm.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toBe(payloads[1]);
  expect(host.textContent).toContain("Challenge complete");
});

it.each([true,false])("Arena multiple answers require the full set before final grading (tracked=%s)",async tracked=>{
 multiple=true;persistence=tracked;
 await render(<NexusPractice/>);await click("Start Practice");
 expect(host.textContent).toContain("Choose 2 answers");
 const inputs=[...host.querySelectorAll<HTMLInputElement>('.nexus-option input[type="checkbox"]')];expect(inputs).toHaveLength(2);
 await act(async()=>{inputs[1].click();await new Promise(r=>setTimeout(r,30));});
 const finish=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Finish & Submit')!;
 expect(finish.disabled).toBe(true);expect(calls.some(c=>c.url.endsWith('/answer')||c.url.endsWith('/finish'))).toBe(false);
 await act(async()=>{inputs[0].click();await new Promise(r=>setTimeout(r,30));});
 expect(finish.disabled).toBe(false);await click('Flag for review');await click('Finish & Submit');
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='Finish & Submit');
 await act(async()=>{buttons.at(-1)!.click();await new Promise(r=>setTimeout(r,40));});
 const submitted=calls.find(c=>c.url.endsWith(tracked?'/finish':'/submissions'))!;expect(submitted).toBeTruthy();
 if(!tracked)expect(JSON.parse(String(submitted.options.body)).answers[0].optionKey).toBe('["A","B"]');
 expect(host.textContent).toContain('Challenge complete');expect(host.textContent).toContain('A. 255.255.255.0; B. 255.255.0.0');
});
