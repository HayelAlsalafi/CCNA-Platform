// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  current: true,
  request: vi.fn(),
  policy: vi.fn(),
  preview:vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@workspace/api-client-react", () => ({
  adminContentRequest: (...args: unknown[]) =>
    String(args[0]).endsWith("/delete-policy") ? state.policy(...args) : String(args[0]).endsWith("history-delete/preview") ? state.preview(...args) : state.request(...args),
}));
vi.mock("./admin-session-boundary", () => ({
  useAdminSession: () => ({
    identity: { userId: "admin", sessionId: "sess_verified" },
    isCurrent: () => state.current,
    capture: () => () => state.current,
  }),
}));
vi.mock("../lib/catalog-cache", () => ({
  refreshCatalog: (...args: unknown[]) => state.refresh(...args),
}));
import { useAdminDeleteControls } from "./admin-delete-controls";
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
let root: Root, container: HTMLDivElement, client: QueryClient;
function Fixture({ scope = "page-1" }: { scope?: string }) {
  const d = useAdminDeleteControls("questions", ids, scope, true);
  return (
    <>
      {d.controls}
      {ids.map((id) => (
        <div key={id}>
          {d.checkbox(id)}
          {d.deleteButton(id)}
        </div>
      ))}
    </>
  );
}
async function render(scope = "page-1") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Fixture scope={scope} />
      </QueryClientProvider>,
    ),
  );
}
async function click(text: string) {
  await act(async () => {
    const b = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
    if (!b) throw Error("Missing " + text);
    b.click();
  });
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setScheduler(queueMicrotask);
  state.current = true;
  state.request.mockReset();
  state.policy.mockReset();
  state.policy.mockResolvedValue({ mode: "permanent-only-v2" });
  state.preview.mockReset();state.preview.mockImplementation((_url,opts)=>Promise.resolve({token:ids[1],expiresAt:Date.now()+300000,confirmation:'DELETE QUESTIONS AND THEIR HISTORY',warning:'Shared sessions preserved.',requiresHistory:false,records:JSON.parse(opts.body).ids.map((id:string)=>({id,questionCode:'CCNA-Q-000001',revisions:[],deliveries:[],attempts:[],sessionItems:0,sessions:0}))}));
  state.refresh.mockReset();
  client = new QueryClient();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  notifyManager.setScheduler((fn) => setTimeout(fn, 0));
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
it('previews exact history identifiers without deleting and requires explicit loss acknowledgement and phrase',async()=>{
  state.preview.mockResolvedValue({requiresHistory:true,token:ids[1],expiresAt:Date.now()+300000,confirmation:'DELETE QUESTIONS AND THEIR HISTORY',warning:'Permanent history loss',records:[{id:ids[0],revisions:[ids[1]],deliveries:[],attempts:[ids[1]]}]});
  await click('Delete');await click('Preview deletion including history');
  expect(state.preview).toHaveBeenCalledTimes(1);
  const [url,options]=state.preview.mock.calls[0]!;
  expect(url).toBe('/api/admin/questions/history-delete/preview');
  expect(options.method).toBe('POST');expect(JSON.parse(options.body)).toEqual({ids:[ids[0]]});
  expect(document.body.textContent).toContain('1 revisions, 0 deliveries, 1 learner attempts');
  const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='Permanently delete listed questions and history')!;
  expect(confirm.disabled).toBe(true);
  expect(document.querySelector('[aria-label="History deletion confirmation phrase"]')).not.toBeNull();
  expect(document.body.textContent).toContain('I authorize permanent loss');
  expect(state.refresh).not.toHaveBeenCalled();
});
it("selects the current filtered page and clears selection across pagination/filter scopes", async () => {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  expect(container.textContent).toContain("2 selected");
  await render("page-2");
  expect(container.textContent).toContain("0 selected");
});
it("requires confirmation, sends only selected IDs with session precondition, and reports mixed outcomes", async () => {
  state.request.mockResolvedValue({
    items: [
      { id: ids[0], outcome: "DELETED", reason: "No dependencies" },
      { id: ids[1], outcome: "BLOCKED", reason: "Active questions" },
    ],
    deleted: 1,
    blocked: 1,
  });
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  await click("Delete Selected");
  expect(state.request).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Delete 2 questions?");
  await click("Confirm deletion");
  expect(state.request).toHaveBeenCalledWith(
    "/api/admin/questions/bulk-delete",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ids }),
      headers: expect.objectContaining({ "X-Admin-Session": "sess_verified" }),
    }),
  );
  expect(container.textContent).toContain("1 DELETED / 1 BLOCKED");
  expect(container.textContent).not.toContain("Archived");
  expect(container.textContent).toContain("0 selected");
  expect(state.refresh).toHaveBeenCalledOnce();
});
it("prevents double confirmation while deletion is pending", async () => {
  let resolve!: (v: unknown) => void;
  state.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  await click("Delete Selected");
  await act(async () => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Confirm deletion",
    )!;
    b.click();
    b.click();
  });
  expect(state.request).toHaveBeenCalledOnce();
  await act(async () => resolve({ items: [], deleted: 0, blocked: 0 }));
});
it("never applies a late mutation result or refetch to a superseded Admin lifetime", async () => {
  let resolve!: (v: unknown) => void;
  state.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  await click("Delete Selected");
  await click("Confirm deletion");
  state.current = false;
  await act(async () => resolve({ items: [], deleted: 2, blocked: 0 }));
  expect(state.refresh).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("2 DELETED");
});
it("refuses to send any deletion request to the older archiving backend", async () => {
  state.policy.mockResolvedValue({ mode: "archive-v1" });
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  await click("Delete Selected");
  await click("Confirm deletion");
  expect(state.request).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("No deletion request was sent");
});
it("never accepts ARCHIVED as a successful permanent-delete outcome", async () => {
  state.request.mockResolvedValue({
    items: [{ id: ids[0], outcome: "ARCHIVED", reason: "Old backend" }],
    deleted: 0,
    blocked: 0,
  });
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Select all on current filtered page"]')!
      .click(),
  );
  await click("Delete Selected");
  await click("Confirm deletion");
  expect(state.refresh).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("No success is assumed");
});
it('requires the second checkbox and phrase before sending a history deletion, then refreshes committed results',async()=>{
 state.preview.mockResolvedValue({token:ids[1],expiresAt:Date.now()+300000,confirmation:'DELETE QUESTIONS AND THEIR HISTORY',warning:'Shared sessions and unrelated items remain.',requiresHistory:true,records:[{id:ids[0],questionCode:'CCNA-Q-000060',revisions:[ids[1]],deliveries:[ids[1]],attempts:[ids[1]],sessionItems:1,sessions:1}]});
 state.request.mockResolvedValue({items:[{id:ids[0],outcome:'DELETED',reason:'Physically removed',auditId:ids[1]}],deleted:1,blocked:0,failed:0});
 await click('Delete');expect(document.body.textContent).toContain('CCNA-Q-000060');const first=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Confirm deletion')!;expect(first.disabled).toBe(true);
 await click('Preview deletion including history');expect(state.request).not.toHaveBeenCalled();await act(async()=>document.querySelector<HTMLInputElement>('.admin-dialog input[type="checkbox"]')!.click());
 const confirm=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Permanently delete listed questions and history')!;expect(confirm.disabled).toBe(true);
 await act(async()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="History deletion confirmation phrase"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'DELETE QUESTIONS AND THEIR HISTORY');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Permanently delete listed questions and history');expect(state.request).toHaveBeenCalledOnce();expect(state.request).toHaveBeenCalledWith('/api/admin/questions/history-delete/confirm',expect.objectContaining({body:JSON.stringify({token:ids[1],confirmation:'DELETE QUESTIONS AND THEIR HISTORY',acknowledgeHistoryLoss:true})}));expect(state.refresh).toHaveBeenCalledOnce();expect(container.textContent).toContain('1 DELETED / 0 BLOCKED / 0 FAILED');
});
it('rejects malformed dependency previews and displays FAILED without a destructive request',async()=>{
 state.preview.mockResolvedValue({records:[]});await click('Delete');expect(document.body.textContent).toContain('FAILED');expect(state.request).not.toHaveBeenCalled();expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Confirm deletion')!.disabled).toBe(true);
});
it('shows FAILED outcomes accurately without claiming a successful deletion',async()=>{
 state.request.mockResolvedValue({items:[{id:ids[0],outcome:'FAILED',reason:'Transaction rolled back'}],deleted:0,blocked:0,failed:1});await click('Delete');await click('Confirm deletion');expect(container.textContent).toContain('0 DELETED / 0 BLOCKED / 1 FAILED');expect(container.textContent).toContain('Transaction rolled back');
});
