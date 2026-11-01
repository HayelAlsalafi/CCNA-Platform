// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
const state = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: "learner", sessionId: "session" },
  role: "USER",
  accountStatus: "ACTIVE",
  query: {} as any,
  queryCall: vi.fn(),
  progressCall: vi.fn(),
  lessons: { data: { items: [] }, isPending: false, isError: false } as any,
}));
vi.mock("@clerk/react", () => ({ useAuth: () => state.auth }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: (options: unknown) => {
    state.queryCall(options);
    return (options as { queryKey?: string[] }).queryKey?.[0] === '/api/chapters' ? state.lessons : state.query;
  },
}));
vi.mock("@workspace/api-client-react", async (original) => ({
  ...(await original<typeof import("@workspace/api-client-react")>()),
  useGetCurrentUser: () => ({
    data: { user: { role: state.role, status: state.accountStatus } },
    isError: false,
  }),
  useGetLearningProgress: (options: unknown) => {
    state.progressCall(options);
    return { data: undefined, isError: false };
  },
}));
import { CurriculumView, CurriculumExplorer } from "./curriculum";
import { curriculumDomains } from "../../../api-server/src/lib/curriculum-config";
import type { CurriculumSummary } from "@workspace/api-client-react";
let root: Root, container: HTMLDivElement;
const id = "d55a2e6b-2393-50f8-bb2a-7619ccd1f5a4";
const data: CurriculumSummary = {
  title: "CCNA 200-301",
  version: "test",
  domains: curriculumDomains,
  labs: null,
  topics: [
    {
      id,
      slug: "static-routing",
      name: "Existing routing topic",
      description: "Retained original description",
      status: "ACTIVE",
      questionCount: 4,
      chapterIds: [id],
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.auth = { isLoaded: true, isSignedIn: true, userId: "learner", sessionId: "session" };
  state.role = "USER";
  state.accountStatus = "ACTIVE";
  state.query = { data, isPending: false, isError: false };
  state.lessons = { data: { items: [] }, isPending: false, isError: false };
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const render = (admin = false) =>
  act(() => root.render(<CurriculumView data={data} admin={admin} />));
const click = (text: string) =>
  act(() => {
    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(text),
    );
    if (!button) throw Error("Missing button " + text);
    button.click();
  });
it("shows exactly six collapsed domains and deduplicated published counts", () => {
  render();
  expect(container.querySelectorAll(".curriculum-domain")).toHaveLength(6);
  expect(container.querySelectorAll("[aria-expanded=false]")).toHaveLength(6);
  expect(container.querySelectorAll(".curriculum-domain")[2].textContent).toContain(
    "4 published questions",
  );
  expect(container.querySelector("#curriculum-panel")).toBeNull();
});
it("expands in place, orders chapters, switches domains and collapses with Escape", () => {
  render();
  click("IP Connectivity");
  expect(
    [...container.querySelectorAll(".curriculum-chapters button")].map((b) =>
      b.textContent?.slice(2),
    ),
  ).toEqual(curriculumDomains[2].sections.flatMap((s) => s.chapters.map((c) => c.title)));
  expect(container.querySelectorAll(".curriculum-domain")).toHaveLength(6);
  click("Network Access");
  expect(container.querySelectorAll(".curriculum-chapters button")).toHaveLength(10);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(container.querySelector("#curriculum-panel")).toBeNull();
  expect(document.activeElement?.textContent).toContain("Network Access");
});
it("retains real topic UUID practice link, with no learner question-bank link or invented progress", () => {
  render();
  click("IP Connectivity");
  click("Configuring IPv4 Addresses and Static Routes");
  expect(container.querySelector('a[href="/practice?topicId=' + id + '"]')).not.toBeNull();
  expect(container.textContent).toContain("4 published questions");
  expect(container.textContent).toContain("Labs coming soon");
  expect(container.textContent).toContain("Learning progress unavailable");
  expect(container.textContent).not.toContain("View Questions");
});
it("shows authorized View Questions filtered by the original topic UUID", () => {
  render(true);
  click("IP Connectivity");
  click("Configuring IPv4 Addresses and Static Routes");
  expect(container.querySelector('a[href="/admin/questions?topicId=' + id + '"]')).not.toBeNull();
});
it("offers Start Learning separately from the unchanged topic-specific practice link", () => {
  state.lessons = { data: { items: [{ id: 'lesson-one' }] }, isPending: false, isError: false };
  render(); click("IP Connectivity"); click("Configuring IPv4 Addresses and Static Routes");
  expect(container.querySelector(`a[href="/learn/chapters/${id}"]`)?.textContent).toContain('Start Learning');
  expect(container.querySelector(`a[href="/practice?topicId=${id}"]`)).toBeTruthy();
});
it("shows honest lesson emptiness while preserving available practice", () => {
  render(); click("IP Connectivity"); click("Configuring IPv4 Addresses and Static Routes");
  expect(container.textContent).toContain('Lessons coming soon');
  expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Start Learning')?.disabled).toBe(true);
  expect(container.querySelector(`a[href="/practice?topicId=${id}"]`)).toBeTruthy();
});
it("keeps lesson activation errors separate from practice availability", () => {
  state.lessons = { data: undefined, isPending: false, isError: true };
  render(); click("IP Connectivity"); click("Configuring IPv4 Addresses and Static Routes");
  expect(container.textContent).toContain('Lesson availability could not load');
  expect(container.textContent).not.toContain('Lessons coming soon');
  expect(container.querySelector(`a[href="/practice?topicId=${id}"]`)).toBeTruthy();
});
it("disables practice for an empty chapter without inventing labs or counts", () => {
  render();
  click("Network Fundamentals");
  click("Fundamentals of Wireless");
  expect(container.textContent).toContain("No questions available yet");
  expect(
    [...container.querySelectorAll("button")].find((b) => b.textContent === "Start Practice")
      ?.disabled,
  ).toBe(true);
});
it("uses bounded panels, desktop 3 by 2 grid and mobile/reduced-motion rules", () => {
  const css = readFileSync(new NodeURL("../curriculum.css", import.meta.url), "utf8");
  expect(css).toContain("repeat(3, minmax(0, 1fr))");
  expect(css).toContain("max-width: 640px");
  expect(css).toContain("max-height: 420px");
  expect(css).toContain("prefers-reduced-motion");
});
it("blocks curriculum while signed out and disables its request", () => {
  state.auth.isSignedIn = false;
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).toContain("Sign in to explore");
  expect(container.querySelector(".curriculum-grid")).toBeNull();
  expect(state.queryCall.mock.lastCall?.[0].enabled).toBe(false);
});
it("renders loading and error boundaries without stale curriculum data", () => {
  state.query = { data: undefined, isPending: true, isError: false };
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).toContain("Loading curriculum");
  state.query = { data, isPending: false, isError: true };
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).toContain("Curriculum could not be loaded");
  expect(container.querySelector(".curriculum-domain")).toBeNull();
});
it("loads progress only on chapter selection, not when expanding a domain", () => {
  act(() => root.render(<CurriculumExplorer />));
  expect(state.progressCall.mock.lastCall?.[0].query.enabled).toBe(false);
  click("IP Connectivity");
  expect(state.progressCall.mock.lastCall?.[0].query.enabled).toBe(false);
  click("Configuring IPv4 Addresses and Static Routes");
  expect(state.progressCall.mock.lastCall?.[0].query.enabled).toBe(true);
});
it("shows mapping review only for an active server-authorized ADMIN", () => {
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).not.toContain("Unmapped Topics");
  state.role = "ADMIN";
  state.accountStatus = "DISABLED";
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).not.toContain("Unmapped Topics");
  state.accountStatus = "ACTIVE";
  act(() => root.render(<CurriculumExplorer />));
  expect(container.textContent).toContain("Unmapped Topics / Admin review");
});
