// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ current: true, request: vi.fn() }));
vi.mock("./admin-session-boundary", () => ({
  useAdminSession: () => ({
    identity: { userId: "admin", sessionId: "session" },
    isCurrent: () => state.current,
    capture: () => () => state.current,
  }),
}));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/api-client-react")>()),
  adminContentRequest: state.request,
  useAdminListTopics: () => ({ data: [] }),
  useAdminListQuestions: () => ({ data: { items: [] } }),
}));
import { AdminQuestionImport } from "./admin-question-import";
import { AdminTaxonomyManager } from "./admin-taxonomy";
let root: Root, container: HTMLDivElement, client: QueryClient;
const preview = {
  previewId: "token",
  expiresAt: "2030-01-01T00:00:00Z",
  summary: { accepted: 1, rejected: 1, duplicates: 1, total: 3 },
  rows: [
    {
      row: 2,
      status: "accepted",
      text: "Question preview",
      errors: [],
      question: {
        text: "Question preview",
        difficulty: "EASY",
        explanation: "Reason",
        options: [
          { optionKey: "A", text: "Correct", isCorrect: true },
          { optionKey: "B", text: "Wrong", isCorrect: false },
        ],
      },
    },
    {
      row: 3,
      status: "rejected",
      text: "Bad question",
      errors: [{ path: "correctOption", message: "Exactly one answer" }],
    },
    { row: 4, status: "duplicate", text: "Duplicate question", errors: [] },
  ],
};
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
beforeEach(() => {
  state.current = true;
  state.request.mockReset();
  state.request.mockImplementation(async (path: string) =>
    path.endsWith("/preview")
      ? preview
      : path.endsWith("/confirm")
        ? { imported: 1, rejected: 1, duplicates: 1 }
        : { blueprints: [], domains: [], objectives: [] },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
async function render(content: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{content}</QueryClientProvider>),
  );
  await flush();
}
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
async function chooseFile() {
  const file = new File(["csv"], "q.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode("csv").buffer,
  });
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
it("previews row statuses/errors and never writes before explicit confirmation", async () => {
  await render(<AdminQuestionImport />);
  await chooseFile();
  await act(async () => button("Validate and preview").click());
  await flush();
  expect(container.textContent).toContain("1 accepted");
  expect(container.textContent).toContain("Exactly one answer");
  expect(state.request.mock.calls.some((c) => String(c[0]).endsWith("/confirm"))).toBe(false);
  expect(button("Import accepted").disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
  expect(button("Import accepted").disabled).toBe(false);
  await act(async () => button("Import accepted").click());
  await flush();
  expect(state.request.mock.calls.some((c) => String(c[0]).endsWith("/confirm"))).toBe(false);
  await act(async () => button("Confirm draft import").click());
  await flush();
  const request = state.request.mock.calls.find((c) => String(c[0]).endsWith("/confirm"))!;
  expect(JSON.parse(request[1].body)).toEqual({ previewId: "token", confirmed: true });
  expect(request[1].headers["X-Admin-Session"]).toBe("session");
  expect(container.textContent).toContain("Import complete");
});
it("drops a late preview when the active Admin session changes", async () => {
  let resolve!: (value: unknown) => void;
  state.request.mockImplementation((path: string) =>
    path.endsWith("/preview")
      ? new Promise((r) => {
          resolve = r;
        })
      : Promise.resolve({ blueprints: [], domains: [], objectives: [] }),
  );
  await render(<AdminQuestionImport />);
  await chooseFile();
  await act(async () => button("Validate and preview").click());
  await flush();
  state.current = false;
  await act(async () => resolve(preview));
  await flush();
  expect(container.textContent).not.toContain("Review before import");
});
it("shows the canonical chapter reset prerequisite without creating classifications",async()=>{
 await render(<AdminTaxonomyManager/>);await flush();
 expect(container.textContent).toContain("Chapters & domains");
 expect(container.textContent).toContain("awaiting the separately confirmed development reset");
 expect(state.request.mock.calls.some(c=>c[1]?.method)).toBe(false);
});
it("lets an administrator cancel the final import dialog without writes", async () => {
  await render(<AdminQuestionImport />);
  await chooseFile();
  await act(async () => button("Validate and preview").click());
  await flush();
  await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
  await act(async () => button("Import accepted").click());
  await flush();
  expect(document.querySelector("[role=alertdialog]")).not.toBeNull();
  await act(async () => button("Back to preview").click());
  await flush();
  expect(state.request.mock.calls.some((c) => String(c[0]).endsWith("/confirm"))).toBe(false);
  expect(container.textContent).toContain("Review before import");
});
it("blocks expired previews instead of sending a confirmation request", async () => {
  state.request.mockImplementation(async (path: string) =>
    path.endsWith("/preview")
      ? { ...preview, expiresAt: "2000-01-01T00:00:00Z" }
      : { blueprints: [], domains: [], objectives: [] },
  );
  await render(<AdminQuestionImport />);
  await chooseFile();
  await act(async () => button("Validate and preview").click());
  await flush();
  expect(container.textContent).toContain("This preview expired");
  expect(button("Import accepted").disabled).toBe(true);
  expect(state.request.mock.calls.some((c) => String(c[0]).endsWith("/confirm"))).toBe(false);
});
it("filters preview rows while preserving the actual summary counts", async () => {
  await render(<AdminQuestionImport />);
  await chooseFile();
  await act(async () => button("Validate and preview").click());
  await flush();
  const select = container.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
      select,
      "rejected",
    );
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.querySelector("tbody")?.textContent).toContain("Bad question");
  expect(container.textContent).toContain("1 accepted");
});
