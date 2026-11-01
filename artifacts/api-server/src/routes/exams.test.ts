import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  user: null as any,
  start: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  available: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@clerk/express", () => ({ getAuth: state.auth }));
vi.mock("@workspace/db", async () => {
  const chain = () => {
    const c: any = {};
    for (const k of ["from", "where", "set", "values", "onConflictDoNothing"]) c[k] = () => c;
    c.limit = c.returning = async () => (state.user ? [state.user] : []);
    return c;
  };
  return {
    ...(await import("@workspace/db/schema")),
    db: { select: chain, update: chain, insert: chain },
  };
});
vi.mock("../lib/exams", async (original) => ({
  ...(await original<any>()),
  examStart: state.start,
  examSession: state.read,
  examSave: state.save,
  examSubmit: state.submit,
  examAvailability: state.available,
  examHistory: state.history,
}));
import router from "./exams";
import { ExamError } from "../lib/exams";
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
const id = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: vi.fn() } as any;
    next();
  });
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api/exams";
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  state.user = {
    id,
    clerkUserId: "test-clerk",
    role: "USER",
    status: "ACTIVE",
    email: "test@example.invalid",
    displayName: "Synthetic learner",
  };
  state.auth.mockReturnValue({
    userId: "test-clerk",
    sessionId: "session-verified",
    sessionClaims: { role: "ADMIN", email: "test@example.invalid" },
  });
  for (const fn of [
    state.start,
    state.read,
    state.save,
    state.submit,
    state.available,
    state.history,
  ])
    fn.mockResolvedValue({ status: "ACTIVE" });
});
const post = (path = "", body: any = {}, headers: any = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Practice-Session": "session-verified",
      ...headers,
    },
    body: JSON.stringify(body),
  });
it("blocks signed-out callers before accessing any exam service", async () => {
  state.auth.mockReturnValue({ userId: null, sessionId: null });
  state.user = null;
  expect((await fetch(base + "/availability")).status).toBe(401);
  expect(state.available).not.toHaveBeenCalled();
});
it("disabled database status overrides token ADMIN claims", async () => {
  state.user.status = "DISABLED";
  expect((await fetch(base + "/" + id)).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled();
});
it("registered exam routes use only the authenticated database actor and no-store", async () => {
  const r = await fetch(base + "/" + id);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(id, state.user.id);
});
it("rejects stale sign-in headers before any write", async () => {
  expect((await post("", {}, { "X-Practice-Session": "another-session" })).status).toBe(409);
  expect(state.start).not.toHaveBeenCalled();
});
it("passes creation config separately from the authoritative actor/session", async () => {
  const body = { requestId: id, questionCount: 2, durationMinutes: 5 };
  expect((await post("", body)).status).toBe(200);
  expect(state.start).toHaveBeenCalledWith(body, state.user.id, "session-verified");
});
it("save and submit remain owner-bound for every route", async () => {
  const r = await fetch(base + "/" + id + "/items/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Practice-Session": "session-verified" },
    body: JSON.stringify({ selectedOptionKeys: ["A"], flagged: false, expectedVersion: 0 }),
  });
  expect(r.status).toBe(200);
  expect(state.save.mock.calls[0][3]).toBe(state.user.id);
  expect((await post("/" + id + "/submit")).status).toBe(200);
  expect(state.submit).toHaveBeenCalledWith(id, state.user.id);
});
it("active result requests never return keys before final submission", async () => {
  expect((await fetch(base + "/" + id + "/result")).status).toBe(409);
});
it("foreign or nonexistent exams return the same sanitized 404", async () => {
  state.read.mockRejectedValue(new ExamError(404, "NOT_FOUND", "Exam not found."));
  const r = await fetch(base + "/" + id);
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: { code: "NOT_FOUND", message: "Exam not found." } });
});
it("malformed IDs stop before services and malformed filters are sanitized", async () => {
  expect((await fetch(base + "/not-a-uuid")).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled();
  expect((await fetch(base + "/availability?domainIds=a&domainIds=b")).status).toBe(400);
});
it("unexpected database errors do not expose raw credentials or query text", async () => {
  state.submit.mockRejectedValue(
    Object.assign(new Error("password=DO-NOT-EXPOSE"), { code: "23514" }),
  );
  const r = await post("/" + id + "/submit");
  expect(r.status).toBe(409);
  expect(JSON.stringify(await r.json())).not.toContain("DO-NOT-EXPOSE");
});
it("history queries never accept a browser owner as authoritative", async () => {
  await fetch(base + "?page=2");
  expect(state.history).toHaveBeenCalledWith({ page: "2" }, state.user.id);
});
