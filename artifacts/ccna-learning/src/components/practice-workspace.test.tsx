// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PracticeWorkspace } from "./practice-workspace";
import { refreshCatalog } from "../lib/catalog-cache";
const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "admin-a",
  sessionId: "session-a",
}));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
const topic = {
  id: "topic-a",
  slug: "pilot",
  name: "Pilot topic",
  description: "",
  displayOrder: 0,
  questionCount: 2,
};
const questions = [0, 1].map((i) => ({
  id: "question-" + i,
  deliveryId: "delivery-" + i,
  revisionId: "revision-" + i,
  expiresAt: "2030-01-01T00:00:00Z",
  questionCode: "Q" + i,
  topic: { id: topic.id, slug: topic.slug, name: topic.name },
  text: "Question " + i,
  difficulty: "EASY",
  type: "MULTIPLE_CHOICE_SINGLE",
  options: [
    { optionKey: "A", text: "Option A" },
    { optionKey: "B", text: "Option B" },
  ],
}));
let client: QueryClient,
  root: Root,
  container: HTMLDivElement,
  topics: (typeof topic)[],
  late: ((response: Response) => void) | null,
  delayed: boolean;
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const el = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
async function click(text: string) {
  await act(async () => {
    const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
    if (!b) throw Error("Missing " + text);
    b.click();
  });
}
async function start() {
  await act(async () => el("button-start-practice").click());
}
async function choose() {
  await act(async () => container.querySelector<HTMLInputElement>('input[value="A"]')!.click());
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  Object.assign(auth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "admin-a",
    sessionId: "session-a",
  });
  topics = [topic];
  late = null;
  delayed = false;
  window.history.replaceState({}, "", "/practice?topicId=topic-a");
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url === "/api/topics") return Promise.resolve(json(topics));
      if (url === "/api/curriculum") return Promise.resolve(json({ domains: [], topics: [] }));
      if (url === "/api/practice/sessions") {
        const n = JSON.parse(String(options?.body)).count;
        return Promise.resolve(json({ questions: questions.slice(0, n) }));
      }
      if (url.startsWith("/api/practice/questions/")) {
        if (delayed)
          return new Promise<Response>((resolve) => {
            late = resolve;
          });
        return Promise.resolve(
          json({
            isCorrect: url.includes("question-0"),
            correctOption: { optionKey: "A", text: "Option A" },
            explanation: "Server rationale",
          }),
        );
      }
      return Promise.reject(Error("Unexpected request " + url));
    }),
  );
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PracticeWorkspace isAuthLoaded isSignedIn />
      </QueryClientProvider>,
    );
  });
  const input = container.querySelector<HTMLInputElement>("#practice-count")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
it("shows setup availability and makes no delivery request before Start Practice", () => {
  expect(container.textContent).toContain("2 available questions");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/practice/sessions")).toBe(false);
});
it("preserves selected answers and flags through next/previous and direct navigation", async () => {
  await start();
  await choose();
  await click("Flag for Review");
  await act(async () => el("button-next-question").click());
  expect(container.textContent).toContain("Question 2 of 2");
  expect(container.textContent).toContain("Progress: 0%");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Question 1, unanswered, flagged"]')!
      .click(),
  );
  expect(container.querySelector<HTMLInputElement>('input[value="A"]')!.checked).toBe(true);
  expect(container.textContent).toContain("1 flagged");
});
it("submits only the server delivery and selected key, and counts confirmed answers rather than position", async () => {
  await start();
  await choose();
  await act(async () => el("button-submit-answer").click());
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => String(url).endsWith("question-0/answer"));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ optionKey: "A", deliveryId: "delivery-0" });
  expect(container.textContent).toContain("Progress: 50%");
  expect(container.textContent).toContain("1 answered");
});
it("confirms finishing with unanswered selections and scores only accepted submissions", async () => {
  await start();
  await choose();
  await act(async () => el("button-submit-answer").click());
  await click("Finish Practice");
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await click("Confirm Finish");
  expect(el("practice-results").textContent).toContain("50%");
  expect(container.textContent).toContain("1 correct · 0 incorrect · 1 unanswered · 2 total");
  expect(container.textContent).toContain("Server rationale");
});
it("renders correct and incorrect results without requiring an unanswered confirmation", async () => {
  await start();
  await choose();
  await act(async () => el("button-submit-answer").click());
  await act(async () => el("button-next-question").click());
  await choose();
  await act(async () => el("button-submit-answer").click());
  await click("Finish Practice");
  expect(container.textContent).toContain("1 correct · 1 incorrect · 0 unanswered · 2 total");
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
it("hides an archived topic from new answering but preserves submitted history", async () => {
  await start();
  await choose();
  await act(async () => el("button-submit-answer").click());
  topics = [];
  await act(async () => {
    await refreshCatalog(client, { userId: "admin-a", sessionId: "session-a" }, () => true);
  });
  expect(container.querySelector('[data-testid="panel-practice-question"]')).toBeNull();
  expect(container.textContent).toContain("no longer active");
});
it("suppresses duplicate submissions while a grading request is in flight", async () => {
  await start();
  await choose();
  delayed = true;
  await act(async () => {
    el("button-submit-answer").click();
    el("button-submit-answer").click();
  });
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/answer")),
  ).toHaveLength(1);
  await act(async () =>
    late!(
      json({
        isCorrect: true,
        correctOption: { optionKey: "A", text: "Option A" },
        explanation: "Saved",
      }),
    ),
  );
});
it("does not attach a late accepted grade to another signed-in session", async () => {
  await start();
  await choose();
  delayed = true;
  await act(async () => el("button-submit-answer").click());
  auth.userId = "other";
  auth.sessionId = "other-session";
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PracticeWorkspace isAuthLoaded isSignedIn />
      </QueryClientProvider>,
    ),
  );
  await act(async () =>
    late!(
      json({
        isCorrect: true,
        correctOption: { optionKey: "A", text: "Option A" },
        explanation: "PRIVATE OLD RESULT",
      }),
    ),
  );
  expect(container.textContent).not.toContain("PRIVATE OLD RESULT");
  expect(container.querySelector('[data-testid="result-practice-answer"]')).toBeNull();
});
