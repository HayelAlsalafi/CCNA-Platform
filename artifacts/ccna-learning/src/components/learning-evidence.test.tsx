// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  YearlyActivity,
  SkillMatrix,
  AchievementGallery,
  calendarWeeks,
} from "./learning-evidence";
import { LearnerProfile } from "../pages/learner-profile";
import { TooltipProvider } from "./ui/tooltip";
const auth = { isLoaded: true, isSignedIn: true, userId: "learner-a", sessionId: "session-a" };
vi.mock("@clerk/react", () => ({
  useAuth: () => auth,
  useUser: () => ({ user: { id: auth.userId, firstName: "Alex", fullName: "Alex Learner" } }),
}));
const skills = ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"].map((code, i) => ({
  id: "domain-" + i,
  code,
  name: [
    "Network Fundamentals",
    "Network Access",
    "IP Connectivity",
    "IP Services",
    "Security Fundamentals",
    "Automation and Programmability",
  ][i],
  available: 10,
  attempted: 1,
  attempts: 1,
  correct: 1,
  accuracy: 100,
  coverage: 10,
  score: null,
  status: "INSUFFICIENT_EVIDENCE",
}));
const progress = {
  timezone: "UTC",
  framework: {
    id: "ccna-practice-evidence.v1",
    minimumAnswers: 10,
    minimumUnique: 3,
    sampleTarget: 20,
    scoreLabel: "Practice evidence index",
  },
  skills,
  capabilities: { sessions: true, achievements: true },
  evidence: { attempts: 6, correct: 6, unique: 6, sessions: 1, streak: 1 },
  badges: [
    {
      id: "first-packet.v1",
      name: "First Packet",
      description: "One completed tracked session.",
      supported: true,
      eligible: true,
      progress: 100,
      requirements: [{ label: "Completed sessions", current: 1, target: 1 }],
      awardedAt: "2026-10-15T05:00:00Z",
      awardEvidence: { timezone: "UTC" },
    },
    {
      id: "precision-90.v1",
      name: "Precision 90",
      description: "Thirty answers across ten questions with 90% accuracy.",
      supported: true,
      eligible: false,
      progress: 20,
      requirements: [{ label: "Answers", current: 6, target: 30 }],
      awardedAt: null,
      awardEvidence: null,
    },
  ],
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  calls: { url: string; options: RequestInit }[];
beforeEach(() => {
  Object.assign(auth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "learner-a",
    sessionId: "session-a",
  });
  calls = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler((fn) => fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      calls.push({ url: String(url), options });
      const parsed = new URL(String(url), "http://localhost");
      let body: any = progress;
      if (parsed.pathname.endsWith("/activity")) {
        const year = Number(parsed.searchParams.get("year")),
          days = [];
        for (
          let d = new Date(Date.UTC(year, 0, 1));
          d.getUTCFullYear() === year;
          d.setUTCDate(d.getUTCDate() + 1)
        )
          days.push({
            date: d.toISOString().slice(0, 10),
            answers: 0,
            sessions: 0,
            total: 0,
            level: 0,
          });
        body = {
          year,
          timezone: parsed.searchParams.get("timezone"),
          days,
          totals: { answers: 0, sessions: 0, activeDays: 0, longestStreak: 0 },
          supportedEvents: { PRACTICE_COMPLETED: true },
        };
      }
      if (options.method === "POST") body = { awarded: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <TooltipProvider>{node}</TooltipProvider>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 40));
  });
}
async function click(text: string) {
  const b = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
  expect(b).toBeTruthy();
  await act(async () => {
    b!.click();
    await new Promise((r) => setTimeout(r, 40));
  });
}
it("aligns leap-year dates to weekdays without inventing padded activity", () => {
  const days = [{ date: "2024-02-29", answers: 1, sessions: 0, total: 1, level: 1 }];
  const weeks = calendarWeeks(days);
  expect(weeks[0].filter(Boolean)).toHaveLength(1);
  expect(weeks[0][4]?.date).toBe("2024-02-29");
});
it("renders a full calendar, local timezone, legend and no-activity state", async () => {
  await render(<YearlyActivity />);
  expect(host.querySelectorAll("[role=gridcell]")).toHaveLength(
    new Date().getFullYear() % 4 === 0 ? 366 : 365,
  );
  expect(host.textContent).toContain("No recorded learning activity");
  expect(host.textContent).toContain("Page visits do not count");
  expect(host.querySelector('[aria-label^="Activity intensity"]')).toBeTruthy();
  expect(calls[0].url).toContain("timezone=");
});
it("offers year navigation and keyboard date navigation", async () => {
  await render(<YearlyActivity />);
  const first = host.querySelector<HTMLButtonElement>("[role=gridcell]")!;
  await act(async () => {
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(document.activeElement?.getAttribute("aria-label")).toContain("-01-08");
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="Previous activity year"]')!.click();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(calls.some((c) => c.url.includes("year=" + (new Date().getFullYear() - 1)))).toBe(true);
});
it("does not plot unsupported skill scores as mastery or zero", async () => {
  await render(<SkillMatrix data={progress as any} />);
  expect(host.textContent).toContain("Insufficient data");
  expect(host.textContent).toContain("not mastery");
  expect(host.querySelector('polygon[fill="#14b8a620"]')).toBeNull();
  await click("Accessible table");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
  expect(host.textContent).toContain("100% (1/1)");
  expect(host.textContent).toContain("Insufficient evidence");
});
it("earned and locked badges use server award records and exact eligibility", async () => {
  await render(<AchievementGallery data={progress as any} />);
  expect(host.textContent).toContain("Earned · recorded");
  expect(host.textContent).toContain("Locked");
  expect(host.textContent).toContain("Answers: 6/30");
  expect(calls).toHaveLength(0);
  await click("Check earned badges");
  expect(new Headers(calls[0].options.headers).get("X-Practice-Session")).toBe("session-a");
  expect(Object.keys(JSON.parse(calls[0].options.body as string))).toEqual(["timezone"]);
});
it("does not invent an earned badge when storage is unavailable", async () => {
  await render(
    <AchievementGallery
      data={
        { ...progress, capabilities: { sessions: false, achievements: false }, badges: [] } as any
      }
    />,
  );
  expect(host.textContent).toContain("separately approved achievement migration");
  expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  expect(host.querySelectorAll(".nexus-badge.earned")).toHaveLength(0);
});
it("profile uses own Clerk identity and never awards badges on page load", async () => {
  await render(<LearnerProfile />);
  expect(host.textContent).toContain("Alex Learner");
  expect(host.textContent).toContain("Distinct questions");
  expect(calls.every((c) => !c.options.method || c.options.method === "GET")).toBe(true);
});
it("signed-out profiles do not request private learner data", async () => {
  auth.isSignedIn = false;
  await render(<LearnerProfile />);
  expect(host.textContent).toContain("Your learning profile is private");
  expect(calls).toHaveLength(0);
});
