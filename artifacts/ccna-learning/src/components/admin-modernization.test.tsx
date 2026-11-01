import {ccnaBookChapters} from "../lib/ccna-book-chapters";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "USER",
  topicError: false,
  topicsPending: false,
  retry: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
  request: vi.fn(),
  auth: { isLoaded: true, isSignedIn: true, userId: "user-1", sessionId: "session-1" },
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => state.auth,
  useUser: () => ({ user: { id: state.auth.userId, fullName: "Hayel Salafi", username: "hayel" } }),
  useClerk: () => ({ signOut: state.signOut, openUserProfile: state.profile }),
}));
vi.mock("./admin-session-boundary", () => ({
  useAdminSession: () => ({
    identity: { userId: "user-1", sessionId: "session-1" },
    isCurrent: () => true,
    capture: () => () => true,
  }),
}));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/api-client-react")>()),
  useGetCurrentUser: () => ({
    data: { user: { role: state.role, displayName: "Stored name" } },
    isError: false,
    refetch: state.retry,
  }),
  useHealthCheck: () => ({ data: { status: "ok" }, isError: false, isPending: false }),
  useAdminListTopics: () => ({
    data: state.topicError ? undefined : [{ id: "topic-1" }, { id: "topic-2" }],
    isError: state.topicError,
    isPending: state.topicsPending,
    refetch: state.retry,
  }),
  useAdminListQuestions: () => ({
    data: { items: [], total: 127 },
    isError: false,
    isPending: false,
    refetch: state.retry,
  }),
  adminContentRequest: state.request,
}));
import { AccountMenu } from "./application-navigation";
import { NexusAppShell } from './nexus-shell';
import { AdminOverview } from "./admin-overview";
import { AdminTaxonomyManager } from "./admin-taxonomy";
import { AdminToast } from "./admin-ui";
const blueprint = "11111111-1111-4111-8111-111111111111",
  domain = "22222222-2222-4222-8222-222222222222";
const catalog = {
 canonicalReady:true,
 chapters:ccnaBookChapters.slice(0,2).map((c,i)=>({id:c.topicId,code:c.code,title:c.title,slug:c.slug,volume:c.volume,chapterNumber:c.chapterNumber,domainCode:c.primaryDomain,domainId:domain,blueprintId:blueprint,description:"",displayOrder:i,status:i?"DISABLED":"ACTIVE",version:"2026-10-17T10:00:00.123456Z",questionCount:0})),
  blueprints: [
    {
      id: blueprint,
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
      id: domain,
      blueprintId: blueprint,
      code: "1.0",
      name: "Network fundamentals",
      weightPercent: 20,
      displayOrder: 0,
    },
  ],
  objectives: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      blueprintId: blueprint,
      domainId: domain,
      domainCode: "1.0",
      code: "1.1",
      description: "Explain network components",
      displayOrder: 0,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      blueprintId: blueprint,
      domainId: domain,
      domainCode: "1.0",
      code: "1.2",
      description: "Describe topologies",
      displayOrder: 1,
    },
  ],
};
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.role = "USER";
  state.topicError = false;
  state.topicsPending = false;
  state.auth = { isLoaded: true, isSignedIn: true, userId: "user-1", sessionId: "session-1" };
  state.retry.mockReset();
  state.profile.mockReset();
  state.signOut.mockReset().mockResolvedValue(undefined);
  state.request.mockReset().mockResolvedValue(catalog);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  window.history.replaceState({}, "", "/admin");
  if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent;
  if (!HTMLElement.prototype.hasPointerCapture)
    HTMLElement.prototype.hasPointerCapture = () => false;
  if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = () => {};
  if (!HTMLElement.prototype.releasePointerCapture)
    HTMLElement.prototype.releasePointerCapture = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
async function render(element: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>),
  );
  await flush();
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  )!;
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await flush();
}
async function input(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  });
  await flush();
}
async function key(element: HTMLElement, value: string) {
  await act(async () =>
    element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })),
  );
  await flush();
}
it("shows the authenticated name, initials and server role without hardcoding Admin", async () => {
  await render(<AccountMenu />);
  expect(container.textContent).toContain("Hayel Salafi");
  expect(container.textContent).toContain("HS");
  expect(container.textContent).toContain("USER");
  expect(container.textContent).not.toContain("ADMIN");
});
it("supports keyboard opening, menu navigation, Escape and focus return", async () => {
  await render(<AccountMenu />);
  const trigger = container.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
  trigger.focus();
  await key(trigger, "ArrowDown");
  const menu = document.querySelector<HTMLElement>("[role=menu]")!;
  expect(menu).not.toBeNull();
  const items = [...menu.querySelectorAll<HTMLElement>("[role=menuitem]")];
  expect(items).toHaveLength(2);
  items[0].focus();
  await key(items[0], "ArrowDown");
  expect(document.activeElement).toBe(items[1]);
  await key(menu, "Escape");
  expect(document.querySelector("[role=menu]")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(state.signOut).not.toHaveBeenCalled();
});
it("uses the supported Clerk profile action and existing sign-out redirect", async () => {
  await render(<AccountMenu basePath="/learning" />);
  const trigger = container.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
  await key(trigger, "Enter");
  await click(document.querySelector<HTMLElement>("[role=menuitem]")!);
  expect(state.profile).toHaveBeenCalledTimes(1);
  await key(trigger, "Enter");
  await click(document.querySelector<HTMLElement>("[data-testid=button-sign-out]")!);
  expect(state.signOut).toHaveBeenCalledWith({ redirectUrl: "/learning/" });
});
it("offers sign-in without exposing an account menu for signed-out users", async () => {
  state.auth = { ...state.auth, isSignedIn: false };
  await render(<AccountMenu />);
  expect(container.querySelector("[aria-haspopup=menu]")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/sign-in");
});
it("discards a delayed sign-out failure after the authenticated session changes", async () => {
  let reject!: (error: Error) => void;
  state.signOut.mockImplementation(
    () =>
      new Promise((_, failure) => {
        reject = failure;
      }),
  );
  await render(<AccountMenu />);
  await key(container.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!, "Enter");
  await click(document.querySelector<HTMLElement>("[data-testid=button-sign-out]")!);
  state.auth = { ...state.auth, userId: "user-2", sessionId: "session-2" };
  await render(<AccountMenu />);
  await act(async () => reject(new Error("old session failed")));
  await flush();
  expect(container.querySelector("[role=alert]")).toBeNull();
  expect(container.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")?.disabled).toBe(false);
});
it("offers accessible notification dismissal and removes private content on unmount", async () => {
  const dismiss = vi.fn();
  await render(<AdminToast message="Topic saved for this session" onDismiss={dismiss} />);
  expect(document.body.textContent).toContain("Topic saved for this session");
  await click(document.querySelector<HTMLButtonElement>('[aria-label="Dismiss notification"]')!);
  expect(dismiss).toHaveBeenCalledTimes(1);
  await render(<div />);
  expect(document.body.textContent).not.toContain("Topic saved for this session");
});
it("mobile drawer has named navigation, an active module and closes after navigation", async () => {
  state.role = "ADMIN";
  window.history.replaceState({}, "", "/admin/import");
  await render(<NexusAppShell />);
  await click(container.querySelector<HTMLButtonElement>('[aria-label="Open learning navigation"]')!);
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog).not.toBeNull();
  expect(dialog.querySelector('[aria-label="Administration navigation"]')).not.toBeNull();
  expect(dialog.querySelector("a[aria-current=page]")?.textContent).toContain("Bulk import");
  await click(
    [...dialog.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.textContent === "Questions",
    )!,
  );
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(window.location.pathname).toBe("/admin/questions");
});
it("overview displays real supplied API totals and labels unavailable future capabilities", async () => {
  await render(<AdminOverview />);
  const numbers = [...container.querySelectorAll(".admin-stat-card>strong")].map(
    (e) => e.textContent,
  );
  expect(numbers).toEqual(["2", "127", "1", "2"]);
  expect(container.textContent).toContain("future capabilities");
  expect(container.querySelector('a[href="/admin/import"]')).not.toBeNull();
});
it("overview reports errors and retry rather than showing a fabricated zero", async () => {
  state.topicError = true;
  await render(<AdminOverview />);
  const card = container.querySelector(".admin-stat-card")!;
  expect(card.textContent).toContain("Unavailable");
  expect(card.querySelector("strong")).toBeNull();
  await click(card.querySelector("button")!);
  expect(state.retry).toHaveBeenCalledTimes(1);
});
it("overview has a labelled loading state until real statistics arrive", async () => {
  state.topicsPending = true;
  await render(<AdminOverview />);
  expect(
    container.querySelector('[role=status][aria-label="Loading Curriculum topics"]'),
  ).not.toBeNull();
  expect(container.querySelector(".admin-stat-card")?.querySelector("strong")).toBeNull();
});
it("taxonomy searches chapters and filters status without writes",async()=>{
 await render(<AdminTaxonomyManager/>);await input(container.querySelector('input[type=search]')!,"Ethernet");
 expect(container.querySelector('tbody')?.textContent).toContain("Fundamentals of Ethernet LANs");expect(container.querySelector('tbody')?.textContent).not.toContain("Introduction to TCP/IP Networking");
 await input(container.querySelectorAll('select')[2],"ACTIVE");expect(container.textContent).toContain("No chapters match");expect(state.request.mock.calls.every(c=>!c[1]?.method)).toBe(true);
});
it("taxonomy keeps creation in an accessible dialog with cancel performing no write", async () => {
  await render(<AdminTaxonomyManager />);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  await click(button("Create missing chapter"));
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  await click(button("Cancel"));
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(state.request.mock.calls.every((c) => !c[1]?.method)).toBe(true);
});
it("directs question associations to the chapter-aware question editor",async()=>{
 window.history.replaceState({},"","/admin/taxonomy?question=55555555-5555-4555-8555-555555555555");await render(<AdminTaxonomyManager/>);
 expect(container.querySelector('a[href="/admin/questions"]')).not.toBeNull();expect(container.textContent).not.toContain("Save objective associations");expect(state.request.mock.calls.every(c=>!c[1]?.method)).toBe(true);
});
