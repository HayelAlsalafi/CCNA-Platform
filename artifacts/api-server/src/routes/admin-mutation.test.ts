/** Real routes/auth/consistency guard; only SDK reader, DB and domain writes mocked. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request } from "express";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import {
  createQuestionInputSchema, updateQuestionInputSchema,
  createTopicInputSchema, updateTopicInputSchema,
} from "@workspace/db/schema";

import {
  AdminCreateQuestionHeader, AdminUpdateQuestionHeader, AdminDisableQuestionHeader,
  AdminCreateTopicHeader, AdminUpdateTopicHeader, AdminDisableTopicHeader,
} from "@workspace/api-zod";

const getAuthMock = vi.fn();
vi.mock("@clerk/express", () => ({ getAuth: (req: Request) => getAuthMock(req) }));
vi.mock("drizzle-orm", async original => {
  const actual = await original<typeof import("drizzle-orm")>();
  return { ...actual, eq: (column: unknown, value: unknown) =>
    typeof column === "string" ? { column, value } : actual.eq(column as never, value) };
});
type Row = Record<string, unknown>;
const users = new Map<string, Row>();
const chain = () => {
  let row: Row | undefined;
  const c = {
    from: () => c, set: () => c,
    where: ({ column, value }: { column: string; value: string }) => {
      row = column === "clerkUserId" ? users.get(value) : [...users.values()].find(u => u.id === value);
      return c;
    },
    limit: async () => row ? [row] : [], returning: async () => row ? [row] : [],
  };
  return c;
};
vi.mock("@workspace/db", () => ({
  usersTable: { clerkUserId: "clerkUserId", id: "id" },
  db: { select: chain, update: chain },
}));
const writes = {
  createAdminQuestion: vi.fn(), updateAdminQuestion: vi.fn(), disableAdminQuestion: vi.fn(),
  createTopic: vi.fn(), updateTopic: vi.fn(), disableTopic: vi.fn(),
};
vi.mock("../lib/questions-admin", () => ({ ...writes, listAdminQuestions: vi.fn() }));
vi.mock("../lib/topics-admin", () => ({ ...writes, listAllTopics: vi.fn(), toAdminTopic: (row: unknown) => row }));
const authorized: { path: string; actor: Request["verifiedAuth"] }[] = [];
vi.mock("../middlewares/admin-mutation", async original => {
  const actual = await original<typeof import("../middlewares/admin-mutation")>();
  return { ...actual, requireAdminMutationSession: (req: Request, res: never, next: () => void) =>
    actual.requireAdminMutationSession(req, res, () => {
      authorized.push({ path: req.path, actor: req.verifiedAuth }); next();
    }) };
});
const { default: questionRouter } = await import("./admin-questions");
const { default: topicRouter } = await import("./admin-topics");
const { requireAdminMutationSession } = await import("../middlewares/admin-mutation");
const a = { userId: "user_a", sessionId: "ses_a" };
const b = { userId: "user_b", sessionId: "ses_b" };
const sameUser = { ...a, sessionId: "ses_a2" };
let browser: typeof a | null;
const snapshots = new WeakMap<Request, typeof browser>();
const id = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const questionInput = { topicId, text: "Q", type: "MULTIPLE_CHOICE_SINGLE", difficulty: "EASY",
  options: [{ optionKey: "A", text: "A", isCorrect: true }, { optionKey: "B", text: "B", isCorrect: false }] };
const routes = [
  { method: "POST", path: "/admin/questions", body: questionInput, service: "createAdminQuestion", status: 201 },
  { method: "PATCH", path: `/admin/questions/${id}`, body: { text: "Updated" }, service: "updateAdminQuestion", status: 200 },
  { method: "POST", path: `/admin/questions/${id}/disable`, body: undefined, service: "disableAdminQuestion", status: 200 },
  { method: "POST", path: "/admin/topics", body: { slug: "routing", name: "Routing" }, service: "createTopic", status: 201 },
  { method: "PATCH", path: `/admin/topics/${id}`, body: { name: "Updated" }, service: "updateTopic", status: 200 },
  { method: "POST", path: `/admin/topics/${id}/disable`, body: undefined, service: "disableTopic", status: 200 },
] as const;
let base: string, server: ReturnType<ReturnType<typeof express>["listen"]>;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { snapshots.set(req, browser ? { ...browser } : null); req.log = { error: vi.fn() } as never; next(); });
  app.use("/api", questionRouter, topicRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => {
  users.clear(); browser = a; authorized.length = 0; getAuthMock.mockReset();
  for (const identity of [a, b]) users.set(identity.userId, {
    id: identity.userId === a.userId ? id : topicId, clerkUserId: identity.userId,
    role: "ADMIN", status: "ACTIVE", email: "admin@example.com", displayName: "Admin",
  });
  getAuthMock.mockImplementation((req: Request) => {
    const identity = snapshots.get(req);
    return { userId: identity?.userId ?? null, sessionId: identity?.sessionId ?? null,
      // Even a verified custom ADMIN claim must not override a DB USER role.
      sessionClaims: { email: "admin@example.com", role: "ADMIN" } };
  });
  for (const write of Object.values(writes)) write.mockReset().mockResolvedValue({ id, status: "ACTIVE" });
});
function send(route: typeof routes[number], expected: string | null = a.sessionId, headers: Record<string, string> = {}, body: unknown = route.body) {
  return fetch(base + route.path, { method: route.method,
    headers: { "content-type": "application/json", ...(expected === null ? {} : { "X-Admin-Session": expected }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
const noWrites = () => Object.values(writes).forEach(write => expect(write).not.toHaveBeenCalled());
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe("server authorization and mutation intent consistency (six endpoints)", () => {
  it.each(routes)("rejects unauthenticated $service despite spoofed identity/header", async route => {
    browser = null;
    const response = await send(route, a.sessionId, { "X-User-Id": a.userId, "X-Role": "ADMIN" }, { userId: a.userId, role: "ADMIN", sessionId: a.sessionId });
    expect(response.status).toBe(401); noWrites(); expect(authorized).toHaveLength(0);
  });
  it.each(routes)("rejects DB USER $service despite claimed ADMIN and spoofed body", async route => {
    users.get(a.userId)!.role = "USER";
    const response = await send(route, a.sessionId, { "X-User-Id": b.userId, "X-Role": "ADMIN" }, { userId: b.userId, role: "ADMIN", sessionId: b.sessionId });
    expect(response.status).toBe(403); noWrites(); expect(authorized).toHaveLength(0);
  });
  it.each(routes)("allows authenticated ADMIN $service with matching signal", async route => {
    const response = await send(route);
    expect(response.status).toBe(route.status); expect(writes[route.service]).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authorized[0].actor).toEqual({ userId: id, clerkUserId: a.userId, sessionId: a.sessionId });
    expect(Object.isFrozen(authorized[0].actor)).toBe(true); expect(getAuthMock).toHaveBeenCalledOnce();
  });
  it.each(routes)("preserves legacy ADMIN $service without a session header", async route => {
    const response = await send(route, null);
    expect(response.status).toBe(route.status); expect(writes[route.service]).toHaveBeenCalledOnce();
  });
  it.each(routes)("rejects A intent under verified B for $service", async route => {
    browser = b; const response = await send(route, a.sessionId);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "ADMIN_SESSION_CHANGED", message: "The active session changed. Refresh before retrying." } });
    noWrites(); expect(authorized).toHaveLength(0);
  });
  it.each(routes)("rejects the old session of the same user for $service", async route => {
    browser = sameUser; const response = await send(route, a.sessionId);
    expect(response.status).toBe(409); noWrites();
  });
  it.each(routes)("rejects disabled ADMIN before $service", async route => {
    users.get(a.userId)!.status = "DISABLED";
    const response = await send(route); expect(response.status).toBe(403); noWrites();
  });
  it.each(routes)("rejects malformed consistency signal before $service", async route => {
    const response = await send(route, "ses_a,ses_a"); expect(response.status).toBe(400); noWrites();
  });
  it.each(["", "wrong session", "x".repeat(257)])("rejects invalid header %j without sensitive reflection", async header => {
    const response = await send(routes[0], header); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_ADMIN_SESSION", message: "Invalid admin session precondition." } }); noWrites();
  });
  it("rejects a duplicate header over a real loopback HTTP request", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(base + routes[2].path, { method: "POST", headers: { "X-Admin-Session": [a.sessionId, a.sessionId] } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    expect(status).toBe(400); noWrites();
  });
  it("does not derive a missing verified session from a spoofed header", async () => {
    getAuthMock.mockReturnValue({ userId: a.userId, sessionId: null, sessionClaims: { email: "admin@example.com" } });
    const response = await send(routes[0]); expect(response.status).toBe(409); noWrites();
  });
  it("spoofed user headers cannot change the verified actor of a valid ADMIN write", async () => {
    const response = await send(routes[0], a.sessionId, { "X-User-Id": b.userId, "X-Clerk-User-Id": b.userId, "X-Role": "USER" });
    expect(response.status).toBe(201); expect(authorized[0].actor?.clerkUserId).toBe(a.userId);
  });
  it.each(["userId", "role", "sessionId"])("existing strict create/update schemas reject injected %s", field => {
    for (const [schema, input] of [
      [createQuestionInputSchema, questionInput], [updateQuestionInputSchema, { text: "Updated" }],
      [createTopicInputSchema, { slug: "routing", name: "Routing" }], [updateTopicInputSchema, { name: "Updated" }],
    ] as const) expect(schema.safeParse({ ...input, [field]: "spoofed" }).success).toBe(false);
  });
  it("rechecks DB ADMIN role on the next request without trusting prior access", async () => {
    expect((await send(routes[0])).status).toBe(201);
    users.get(a.userId)!.role = "USER"; const response = await send(routes[0]);
    expect(response.status).toBe(403); expect(writes.createAdminQuestion).toHaveBeenCalledOnce();
  });
  it("fails closed when the verified request context is absent", () => {
    const req = { method: "POST", headers: {}, dbUser: users.get(a.userId) } as unknown as Request;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn(); requireAdminMutationSession(req, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
  });
  it.each([routes[0], routes[3]])("an authorized $service may finish after a switch; concurrent requests retain their own actor/response", async route => {
    const entered = deferred<void>(), result = deferred<unknown>();
    writes[route.service].mockImplementationOnce(() => { entered.resolve(); return result.promise; });
    const requestA = send(route); await entered.promise;
    const actorA = authorized[0].actor;
    browser = b; const responseB = await send(route, b.sessionId);
    expect(responseB.status).toBe(201); expect(await responseB.json()).toEqual({ id, status: "ACTIVE" });
    expect(authorized[1].actor).toEqual({ userId: topicId, clerkUserId: b.userId, sessionId: b.sessionId });
    result.resolve({ id, text: "A-only completion" }); const responseA = await requestA;
    expect(responseA.status).toBe(201); expect(await responseA.json()).toEqual({ id, text: "A-only completion" });
    expect(actorA).toEqual({ userId: id, clerkUserId: a.userId, sessionId: a.sessionId });
    expect(getAuthMock).toHaveBeenCalledTimes(2);
  });
});
it('generated optional header contracts match server precondition syntax across all six operations', () => {
  for (const schema of [AdminCreateQuestionHeader, AdminUpdateQuestionHeader, AdminDisableQuestionHeader,
    AdminCreateTopicHeader, AdminUpdateTopicHeader, AdminDisableTopicHeader]) {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ 'X-Admin-Session': a.sessionId }).success).toBe(true);
    for (const value of ['', 'ses_a,ses_a', 'wrong session', 'x'.repeat(257)])
      expect(schema.safeParse({ 'X-Admin-Session': value }).success).toBe(false);
  }
});
