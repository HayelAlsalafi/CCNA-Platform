import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  analytics: vi.fn(),
  log: vi.fn(),
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    clerkUserId: "fixture",
    role: "USER",
    status: "ACTIVE",
    email: "fixture@example.invalid",
    displayName: "Fixture",
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}));
vi.mock("@clerk/express", () => ({ getAuth: state.auth }));
vi.mock("@workspace/db", async () => {
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const name of ["from", "where", "set", "values", "onConflictDoNothing"])
      value[name] = () => value;
    value.limit = value.returning = async () => [state.user];
    return value;
  };
  return {
    ...(await import("@workspace/db/schema")),
    db: { select: chain, update: chain, insert: chain },
  };
});
vi.mock("../lib/nexus", async (original) => ({
  ...(await original<typeof import("../lib/nexus")>()),
  nexusAnalytics: state.analytics,
}));
const { default: router } = await import("./nexus");
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { error: state.log } as unknown as typeof req.log;
    next();
  });
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/nexus/analytics`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.user.id = "11111111-1111-4111-8111-111111111111";
  state.user.role = "USER";
  state.user.status = "ACTIVE";
  state.auth.mockReturnValue({
    userId: "fixture",
    sessionId: "session-a",
    sessionClaims: { email: state.user.email, role: "ADMIN" },
  });
  state.analytics.mockResolvedValue({ totals: { attempts: 3 } });
});
it("rejects signed-out analytics without executing aggregation", async () => {
  state.auth.mockReturnValue({ userId: null, sessionId: null });
  expect((await fetch(base)).status).toBe(401);
  expect(state.analytics).not.toHaveBeenCalled();
});
it("rejects a disabled database account despite an admin claim", async () => {
  state.user.status = "DISABLED";
  expect((await fetch(base)).status).toBe(403);
  expect(state.analytics).not.toHaveBeenCalled();
});
it.each([
  "userId=22222222-2222-4222-8222-222222222222",
  "range=365",
  "range=7&range=30",
  "timezone=invalid-zone",
])("rejects unsafe analytics parameters %s", async (query) => {
  expect((await fetch(base + "?" + query)).status).toBe(400);
  expect(state.analytics).not.toHaveBeenCalled();
});
it("uses the verified actor, exposes no user parameter and prevents private caching", async () => {
  const response = await fetch(base + "?range=90&timezone=Asia%2FRiyadh");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(state.analytics).toHaveBeenCalledWith(
    state.user.id,
    "session-a",
    "90",
    undefined,
    "Asia/Riyadh",
  );
});
it("keeps another signed-in admin's analytics isolated to that database account", async () => {
  await fetch(base);
  state.user.id = "22222222-2222-4222-8222-222222222222";
  state.user.role = "ADMIN";
  state.auth.mockReturnValue({
    userId: "fixture",
    sessionId: "session-b",
    sessionClaims: { email: state.user.email },
  });
  await fetch(base);
  expect(state.analytics.mock.calls.map((call) => call[0])).toEqual([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
});
it("sanitizes database diagnostics in both response and log", async () => {
  state.analytics.mockRejectedValue(new Error("postgresql://password@example.invalid/secret"));
  const response = await fetch(base);
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toMatch(/password|postgresql/);
  expect(JSON.stringify(state.log.mock.calls)).not.toMatch(/password|postgresql/);
});
it("identifies response validation failure without exposing row values", async () => {
  const { NexusError } = await import("../lib/nexus");
  state.analytics.mockRejectedValue(new NexusError(500, "ANALYTICS_RESPONSE_INVALID", "Learning data could not be validated."));
  const response = await fetch(base);
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("ANALYTICS_RESPONSE_INVALID");
  expect(state.log).toHaveBeenCalledWith({ code: "ANALYTICS_RESPONSE_INVALID" }, "Nexus operation rejected");
});
