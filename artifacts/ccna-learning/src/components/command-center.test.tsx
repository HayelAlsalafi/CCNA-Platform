// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { NexusAnalytics } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { NexusOverview } from "../pages/nexus-overview";
import { recommendTopic } from "../lib/nexus";
import { coveragePercent } from "./command-center-insights";
const auth = { isLoaded: true, isSignedIn: true, userId: "learner-a", sessionId: "session-a" };
vi.mock("@clerk/react", () => ({
  useAuth: () => auth,
  useUser: () => ({ user: { id: auth.userId, firstName: "Alex" } }),
}));
const domain = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "1.0",
  name: "Network Fundamentals",
  version: "1.1",
  available: 8,
  attempted: 3,
  attempts: 12,
  correct: 8,
  chapters: 12,
  covered_chapters: 4,
};
const topic = {
  id: domain.id,
  name: "Switch forwarding",
  available: 8,
  attempted: 3,
  attempts: 12,
  correct: 8,
};
let data: NexusAnalytics, root: Root, host: HTMLDivElement, client: QueryClient, fail: boolean;
const calls: string[] = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 35));
beforeEach(() => {
  auth.isLoaded = true;
  auth.isSignedIn = true;
  auth.userId = "learner-a";
  auth.sessionId = "session-a";
  fail = false;
  calls.length = 0;
  data = {
    totals: {
      attempts: 12,
      correct: 8,
      unique: 4,
      lastActivity: "2026-10-25T12:00:00Z",
      available: 8,
      unmapped: 0,
      unmappedAttempts: 0,
    },
    domains: [domain],
    topics: [topic],
    timeline: [
      {
        day: "2026-10-25",
        attempts: 12,
        correct: 8,
        incorrect: 4,
        completedSessions: 1,
        completedExams: 0,
      },
    ],
    persistence: true,
    sessions: { items: [], total: 0, page: 1, totalPages: 1 },
    resume: null,
    range: "30",
    granularity: "day",
    taxonomyBasis: "Canonical chapters",
    studyTime: null,
    streak: null,
    commandCenter: {
      timezone: "Asia/Riyadh",
      cohort: "ALL_COMMITTED_PRACTICE",
      coverage: {
        availableQuestions: 8,
        practicedQuestions: 3,
        availableChapters: 4,
        practicedChapters: 2,
      },
      domains: [
        { ...domain, weightPercent: 20, uniqueQuestions: 4, accuracy: 67, status: "REVIEW" },
      ],
      exams: { available: false, completed: 0, latest: null },
      timeline: { maximumBuckets: 30, truncated: false },
    },
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler((cb) => cb());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      calls.push(path);
      if (path.includes("analytics"))
        return new Response(JSON.stringify(fail ? { error: { message: "Unavailable" } } : data), {
          status: fail ? 503 : 200,
          headers: { "content-type": "application/json" },
        });
      if (path.includes("/nexus/progress"))
        return Response.json({
          timezone: "UTC",
          framework: {
            id: "ccna-practice-evidence.v1",
            minimumAnswers: 10,
            minimumUnique: 3,
            sampleTarget: 20,
          },
          skills: [],
          evidence: {},
          capabilities: {},
          badges: [],
        });
      if (path.includes("/nexus/activity"))
        return Response.json({
          year: 2026,
          timezone: "UTC",
          days: [],
          totals: { answers: 0, sessions: 0, activeDays: 0, longestStreak: 0 },
          supportedEvents: {},
        });
      return Response.json({ items: [] });
    }),
  );
});
afterEach(async () => {
  setAuthTokenGetter(null);
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <NexusOverview />
      </QueryClientProvider>,
    );
    await pause();
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button!.click();
    await pause();
  });
}
it("keeps the banner and all five distinct tabs, adding real supporting insights", async () => {
  await render();
  expect(host.querySelector("h1")?.textContent).toBe("Welcome back, Alex.");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(5);
  expect(host.querySelector('[data-testid="dashboard-insights"]')?.textContent).toContain("3 of 8");
  expect(host.textContent).toContain("38%");
  await click("Domain topology");
  await click("Accessible list");
  expect(host.querySelector(".nexus-domain-grid.list")).toBeTruthy();
  await click("Activity");
  expect(host.querySelector("#overview-panel-activity")?.textContent).toContain(
    "Accuracy over time",
  );
  expect(host.querySelector("#overview-panel-activity")?.textContent).toContain(
    "Yearly learning activity",
  );
  await click("Skill evidence");
  expect(host.querySelector("#overview-panel-skills")?.textContent).toContain("Where to focus");
  expect(host.querySelector("#overview-panel-skills")?.textContent).toContain(
    "Your CCNA Skill Matrix",
  );
  await click("Next steps");
  expect(host.querySelector("#overview-panel-next")?.textContent).toContain(
    "67% accuracy from 12 answers",
  );
  expect(host.querySelector('a[href="/exam"]')).toBeTruthy();
});
it("preserves keyboard tabs and keeps inactive panels hidden", async () => {
  await render();
  const first = host.querySelector<HTMLButtonElement>('[role="tab"]')!;
  await act(async () => {
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
  });
  expect(host.querySelector('[aria-selected="true"]')?.textContent).toBe("Next steps");
  expect(host.querySelector<HTMLElement>("#overview-panel-glance")?.hidden).toBe(true);
  expect(document.activeElement?.id).toBe("overview-tab-next");
});
it("does not invent coverage or completion when there is no content", async () => {
  data.totals.attempts = data.totals.correct = data.totals.unique = data.totals.available = 0;
  data.topics = [];
  data.timeline = [];
  data.commandCenter!.coverage = {
    availableQuestions: 0,
    practicedQuestions: 0,
    availableChapters: 0,
    practicedChapters: 0,
  };
  await render();
  expect(host.querySelector('[data-testid="dashboard-insights"]')?.textContent).toContain(
    "No published questions",
  );
  expect(host.querySelector('[aria-label="Current question coverage"]')).toBeNull();
  await click("Next steps");
  expect(host.querySelector("#overview-panel-next")?.textContent).toContain(
    "no recorded practice is assumed",
  );
});
it("requests real local-calendar periods while lifetime counters retain their scope", async () => {
  await render();
  await click("Activity");
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Analytics period"]')!;
  await act(async () => {
    select.value = "90";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await pause();
  });
  expect(calls.some((path) => path.includes("range=90") && path.includes("timezone="))).toBe(true);
  expect(host.querySelector("#overview-panel-activity")?.textContent).toContain(
    "All-time statistics",
  );
  await click("At a glance");
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).toContain(
    "12",
  );
});
it("keeps signed-out users from requesting learner analytics", async () => {
  auth.isSignedIn = false;
  await render();
  expect(calls).toEqual([]);
  expect(host.textContent).toContain("Sign in to see your own progress");
});
it("shows only supported completed exam evidence separately from practice accuracy", async () => {
  data.commandCenter!.exams = { available: true, completed: 2, latest: { id: domain.id, status: "EXPIRED", finalizedAt: "2026-10-25T12:00:00Z", questionCount: 7, percentage: 100 * 5 / 7 } };
  await render();
  const summary = host.querySelector('.command-center-exam')!;
  expect(summary.textContent).toContain("2 completed exams"); expect(summary.textContent).toContain("Time expired");
  expect(summary.textContent).toContain("Practice accuracy above excludes exam results");
  expect(summary.querySelector('a')?.getAttribute('href')).toBe(`/exam?session=${domain.id}`);
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).toContain("12");
});
it("keeps the yearly calendar and other tabs usable when a selected trend fails", async () => {
  await render(); await click("Activity"); fail = true;
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Analytics period"]')!;
  await act(async () => { select.value = "90"; select.dispatchEvent(new Event("change", { bubbles: true })); await pause(); });
  expect(host.querySelector('#overview-panel-activity')?.textContent).toContain("Recent trend could not load");
  expect(host.querySelector('#overview-panel-activity')?.textContent).toContain("Yearly learning activity");
  await click("At a glance"); expect(host.querySelector('[data-testid="dashboard-insights"]')).toBeTruthy();
});
it("uses a loading state rather than zero counters before metrics arrive", async () => {
  let release: (response: Response) => void = () => undefined;
  const previous = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, options?: RequestInit) => String(url).includes("analytics") ? new Promise<Response>(resolve => { release = resolve; }) : previous(url, options)));
  await render();
  expect(host.querySelector('[aria-label="Loading learning metrics"]')).toBeTruthy();
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')).toBeNull();
  await act(async () => { release(Response.json(data)); await pause(); });
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')).toBeTruthy();
});
it("presents analytics failures honestly and supports retry", async () => {
  fail = true;
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Learning data could not load",
  );
  fail = false;
  await click("Retry");
  expect(host.querySelector('[data-testid="dashboard-insights"]')).toBeTruthy();
});
it("waits for Clerk readiness before requesting private metrics", async () => {
  auth.isLoaded = false;
  await render();
  expect(calls).toEqual([]);
  auth.isLoaded = true;
  await render();
  expect(host.querySelector('[data-testid="dashboard-insights"]')).toBeTruthy();
});
it("awaits the existing token getter before making authenticated analytics requests", async () => {
  let ready: (token: string) => void = () => undefined;
  const token = new Promise<string>(resolve => { ready = resolve; });
  setAuthTokenGetter(() => token);
  await render();
  expect(calls).toEqual([]);
  await act(async () => { ready("test-only-token"); await pause(); });
  expect(host.querySelector('[data-testid="dashboard-insights"]')).toBeTruthy();
  const request = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("analytics"));
  expect(new Headers(request?.[1]?.headers).get("Authorization")).toBe("Bearer test-only-token");
});
it.each([false, true])("refetches on return after navigation (persisted answer: %s) without writing answers", async (submitted) => {
  await render();
  const initial = calls.filter(p => p.includes("analytics")).length;
  await act(async () => { root.render(null); await pause(); });
  if (submitted) data = { ...data, totals: { ...data.totals, attempts: 13, correct: 9 } };
  await render();
  expect(calls.filter(p => p.includes("analytics")).length).toBeGreaterThan(initial);
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).toContain(submitted ? "13" : "12");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(5);
  for (const [, options] of vi.mocked(fetch).mock.calls) expect(options?.method ?? "GET").toBe("GET");
});
it("invalidates active metrics and fetches committed values instead of replaying submissions", async () => {
  await render();
  data = { ...data, totals: { ...data.totals, attempts: 14 } };
  await act(async () => {
    await client.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('/api/nexus/') });
    await pause();
  });
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).toContain("14");
});
it("keeps a persistent error visible and performs no automatic retry loop", async () => {
  fail = true;
  await render();
  const count = calls.filter(p => p.includes("analytics")).length;
  await act(pause);
  expect(calls.filter(p => p.includes("analytics"))).toHaveLength(count);
  await click("Retry");
  expect(calls.filter(p => p.includes("analytics"))).toHaveLength(count + 1);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Learning data could not load");
  expect(host.querySelector('[data-testid="dashboard-insights"]')).toBeNull();
});
it("aborts abandoned analytics on rapid navigation and ignores a late response", async () => {
  const previous = globalThis.fetch;
  let oldSignal: AbortSignal | null | undefined;
  let release: (response: Response) => void = () => undefined;
  let first = true;
  vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, options?: RequestInit) => {
    if (String(url).includes("analytics") && first) {
      first = false;
      oldSignal = options?.signal;
      // Even a transport ignoring cancellation must not repopulate the new observer.
      return new Promise<Response>(resolve => { release = resolve; });
    }
    return previous(url, options);
  }));
  await render();
  await act(async () => { root.render(null); await pause(); });
  expect(oldSignal?.aborted).toBe(true);
  const stale = { ...data, totals: { ...data.totals, attempts: 999 } };
  data = { ...data, totals: { ...data.totals, attempts: 15 } };
  await render();
  await act(async () => { release(Response.json(stale)); await pause(); });
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).toContain("15");
  expect(host.textContent).not.toContain("999");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("does not carry one learner's cached metrics into another session", async () => {
  await render();
  auth.userId = "learner-b";
  auth.sessionId = "session-b";
  data = { ...data, totals: { ...data.totals, attempts: 0, correct: 0 } };
  await render();
  expect(host.querySelector('[data-testid="metric-answers-submitted"]')?.textContent).not.toContain(
    "12",
  );
});
it("recommends only a real review gap or unattempted published coverage, with deterministic ties", () => {
  expect(recommendTopic([{ ...topic, attempts: 20, correct: 20, attempted: 8 }])).toBeNull();
  expect(recommendTopic([{ ...topic, available: 0 }])).toBeNull();
  expect(
    recommendTopic([
      { ...topic, id: "b" },
      { ...topic, id: "a" },
    ])?.id,
  ).toBe("a");
  expect(
    recommendTopic([
      { ...topic, attempts: 1, correct: 0, attempted: 1 },
      { ...topic, id: "review", attempts: 10, correct: 2 },
    ])?.id,
  ).toBe("review");
  expect(coveragePercent(0, 0)).toBeNull();
  expect(coveragePercent(3, 8)).toBe(38);
});
