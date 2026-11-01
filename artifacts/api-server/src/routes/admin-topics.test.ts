/**
 * Phase 3B-1: HTTP-level tests for /api/admin/topics.
 * The REAL requireAuthenticatedUser/requireAdmin run; only Clerk's session
 * reader, the DB user lookup, and the topic service are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const getAuthMock = vi.fn();
vi.mock("@clerk/express", () => ({ getAuth: (req: unknown) => getAuthMock(req) }));

let currentUser: Record<string, unknown> | null = null;
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "values", "set", "onConflictDoNothing"]) c[m] = () => c;
  c["limit"] = async () => (currentUser ? [currentUser] : []);
  c["returning"] = async () => (currentUser ? [currentUser] : []);
  return c;
};
vi.mock("@workspace/db", () => ({
  usersTable: { clerkUserId: "clerk_user_id", id: "id" },
  topicsTable: {},
  db: { select: chain, insert: chain, update: chain },
}));

const svc = {
  listAllTopics: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  disableTopic: vi.fn(),
};
const deleteRecords = vi.fn();
const management = vi.hoisted(() => ({
  listManagedTopics: vi.fn(),
  topicMetadata: vi.fn(),
  suggestTopicSlug: vi.fn(),
  createManagedTopic: vi.fn(),
  updateManagedTopic: vi.fn(),
  topicDetails: vi.fn(),
  previewTopicDependencies: vi.fn(),
  bulkTopicStatus: vi.fn(),
}));
vi.mock("../lib/topics-management", () => management);
vi.mock("../lib/admin-delete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/admin-delete")>()),
  deleteAdminRecords: (...args: unknown[]) => deleteRecords(...args),
}));
vi.mock("../lib/topics-admin", async () => {
  class TopicError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: unknown,
    ) {
      super(message);
    }
  }
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    ...svc,
    TopicError,
    toAdminTopic: (t: Record<string, unknown>) => ({
      ...t,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
  };
});

const { default: router } = await import("./admin-topics");
const { TopicError } = (await import("../lib/topics-admin")) as unknown as {
  TopicError: new (s: number, c: string, m: string) => Error;
};

let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: () => {}, info: () => {} };
    next();
  });
  app.use("/api", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

function signIn(role: "USER" | "ADMIN" | null, status = "ACTIVE") {
  if (!role) {
    getAuthMock.mockReturnValue({ userId: null, sessionClaims: {} });
    currentUser = null;
    return;
  }
  getAuthMock.mockReturnValue({ userId: "user_x", sessionClaims: { email: "a@example.com" } });
  const now = new Date();
  currentUser = {
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId: "user_x",
    email: "a@example.com",
    displayName: "a",
    role,
    status,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
}
const topic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "routing",
  name: "Routing",
  description: "",
  displayOrder: 1,
  status: "ACTIVE",
};
const req = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<any> => r.json();
beforeEach(() => Object.values(svc).forEach((f) => f.mockReset()));

describe("admin topic API authorization", () => {
  it("forwards bounded management reads and exact-version writes for ADMIN", async () => {
    signIn("ADMIN");
    management.listManagedTopics.mockResolvedValue({ items: [], total: 0 });
    management.updateManagedTopic.mockResolvedValue(topic);
    expect(
      (await req("GET", "/admin/topics/manage?page=2&pageSize=10&search=routing")).status,
    ).toBe(200);
    expect(management.listManagedTopics).toHaveBeenCalledWith(
      expect.objectContaining({ page: "2", pageSize: "10", search: "routing" }),
    );
    const body = { name: "Edited", expectedVersion: "2026-10-14T12:00:00.123456Z" };
    expect((await req("PATCH", "/admin/topics/manage/" + topic.id, body)).status).toBe(200);
    expect(management.updateManagedTopic).toHaveBeenCalledWith(topic.id, body);
  });
  it("rejects a stale Admin session before management mutations", async () => {
    signIn("ADMIN");
    management.bulkTopicStatus.mockClear();
    const response = await fetch(base + "/admin/topics/manage/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Session": "wrong-session" },
      body: JSON.stringify({ status: "DISABLED", items: [] }),
    });
    expect(response.status).toBe(409);
    expect(management.bulkTopicStatus).not.toHaveBeenCalled();
  });
  it("allows ADMIN single and bulk removal with exact item outcomes", async () => {
    signIn("ADMIN");
    deleteRecords.mockResolvedValue({
      items: [{ id: topic.id, outcome: "BLOCKED", reason: "Active questions" }],
      deleted: 0,
      blocked: 1,
    });
    expect(await j(await req("GET", "/admin/topics/delete-policy"))).toEqual({
      mode: "permanent-only-v1",
    });
    const single = await req("DELETE", `/admin/topics/${topic.id}`);
    expect(single.status).toBe(200);
    expect((await j(single)).blocked).toBe(1);
    expect((await req("POST", "/admin/topics/bulk-delete", { ids: [topic.id] })).status).toBe(200);
    expect(deleteRecords).toHaveBeenCalledWith("topics", { ids: [topic.id] });
  });
  const routes: [string, string, unknown?][] = [
    ["GET", "/admin/topics/manage"],
    ["GET", "/admin/topics/manage/metadata"],
    ["GET", "/admin/topics/manage/slug-suggestion?name=Routing"],
    ["GET", "/admin/topics/manage/" + topic.id],
    ["POST", "/admin/topics/manage", {}],
    ["PATCH", "/admin/topics/manage/" + topic.id, {}],
    ["POST", "/admin/topics/manage/deletion-preview", { ids: [topic.id] }],
    ["POST", "/admin/topics/manage/bulk-status", {}],
    ["GET", "/admin/topics/delete-policy"],
    ["DELETE", `/admin/topics/${topic.id}`],
    ["POST", "/admin/topics/bulk-delete", { ids: [topic.id] }],
    ["GET", "/admin/topics"],
    ["POST", "/admin/topics", { slug: "x", name: "X" }],
    ["PATCH", `/admin/topics/${topic.id}`, { name: "Y" }],
    ["POST", `/admin/topics/${topic.id}/disable`],
  ];
  it.each(routes)("%s %s → 401 without a session", async (m, p, b) => {
    signIn(null);
    const r = await req(m, p, b);
    expect(r.status).toBe(401);
    expect((await j(r)).error.code).toBe("UNAUTHENTICATED");
  });
  it.each(routes)("%s %s → 403 FORBIDDEN for USER", async (m, p, b) => {
    signIn("USER");
    const r = await req(m, p, b);
    expect(r.status).toBe(403);
    expect((await j(r)).error.code).toBe("FORBIDDEN");
  });
  it("403 ACCOUNT_DISABLED for a disabled ADMIN", async () => {
    signIn("ADMIN", "DISABLED");
    const r = await req("GET", "/admin/topics");
    expect(r.status).toBe(403);
    expect((await j(r)).error.code).toBe("ACCOUNT_DISABLED");
  });
  it("service is never reached for non-admins", () => {
    expect(svc.listAllTopics).not.toHaveBeenCalled();
    expect(svc.createTopic).not.toHaveBeenCalled();
  });
});

describe("admin topic API (ADMIN)", () => {
  beforeEach(() => signIn("ADMIN"));
  it("lists all topics including disabled", async () => {
    svc.listAllTopics.mockResolvedValue([topic, { ...topic, id: "2", status: "DISABLED" }]);
    const r = await req("GET", "/admin/topics");
    expect(r.status).toBe(200);
    expect((await j(r)).map((t: { status: string }) => t.status)).toEqual(["ACTIVE", "DISABLED"]);
  });
  it("creates → 201", async () => {
    svc.createTopic.mockResolvedValue(topic);
    const r = await req("POST", "/admin/topics", { slug: "routing", name: "Routing" });
    expect(r.status).toBe(201);
    expect(svc.createTopic).toHaveBeenCalledWith({ slug: "routing", name: "Routing" });
  });
  it("maps validation/conflict/not-found errors", async () => {
    svc.createTopic.mockRejectedValueOnce(new TopicError(400, "VALIDATION_ERROR", "bad"));
    expect((await req("POST", "/admin/topics", {})).status).toBe(400);
    svc.createTopic.mockRejectedValueOnce(new TopicError(409, "CONFLICT", "dup"));
    expect((await req("POST", "/admin/topics", { slug: "a", name: "A" })).status).toBe(409);
    svc.updateTopic.mockRejectedValueOnce(new TopicError(404, "NOT_FOUND", "nf"));
    expect((await req("PATCH", `/admin/topics/${topic.id}`, { name: "Z" })).status).toBe(404);
  });
  it("updates and disables", async () => {
    svc.updateTopic.mockResolvedValue({ ...topic, name: "New" });
    expect((await j(await req("PATCH", `/admin/topics/${topic.id}`, { name: "New" }))).name).toBe(
      "New",
    );
    svc.disableTopic.mockResolvedValue({ ...topic, status: "DISABLED" });
    const r = await req("POST", `/admin/topics/${topic.id}/disable`);
    expect((await j(r)).status).toBe("DISABLED");
  });
  it("non-uuid id → 404 without calling the service", async () => {
    const r = await req("POST", "/admin/topics/not-a-uuid/disable");
    expect(r.status).toBe(404);
    expect(svc.disableTopic).not.toHaveBeenCalled();
  });
  it("internal errors do not leak details", async () => {
    svc.listAllTopics.mockRejectedValue(new Error("connection string secret"));
    const r = await req("GET", "/admin/topics");
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("secret");
  });
});
