import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  activity: vi.fn(),
  progress: vi.fn(),
  award: vi.fn(),
  user: null as any,
}));
vi.mock("@clerk/express", () => ({ getAuth: state.auth }));
vi.mock("@workspace/db", async () => {
  const chain = () => {
    const result: any = {};
    for (const method of ["from", "where", "set", "values", "onConflictDoNothing"])
      result[method] = () => result;
    result.limit = result.returning = async () => (state.user ? [state.user] : []);
    return result;
  };
  return {
    ...(await import("@workspace/db/schema")),
    db: { select: chain, update: chain, insert: chain },
  };
});
vi.mock("../lib/learning-evidence", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  yearlyActivity: state.activity,
  learnerProgress: state.progress,
  awardAchievements: state.award,
}));
const { default: router } = await import("./nexus");
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
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
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api/nexus";
});
afterAll(
  () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.user = {
    id: "11111111-1111-4111-8111-111111111111",
    clerkUserId: "clerk-fixture",
    email: "learner@example.invalid",
    displayName: "Fixture learner",
    role: "USER",
    status: "ACTIVE",
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  state.auth.mockReturnValue({
    userId: "clerk-fixture",
    sessionId: "sess_verified",
    sessionClaims: { role: "ADMIN", email: "learner@example.invalid" },
  });
  state.activity.mockResolvedValue({ year: 2024, timezone: "UTC", days: [] });
  state.progress.mockResolvedValue({ badges: [] });
  state.award.mockResolvedValue({ available: true, awarded: [] });
});
it("requires authenticated active accounts before exposing activity", async () => {
  state.auth.mockReturnValue({ userId: null, sessionId: null });
  state.user = null;
  const r = await fetch(base + "/activity?year=2024&timezone=UTC");
  expect(r.status).toBe(401);
  expect(state.activity).not.toHaveBeenCalled();
});
it("uses the database account status rather than token role claims", async () => {
  state.user.status = "DISABLED";
  const r = await fetch(base + "/progress?timezone=UTC");
  expect(r.status).toBe(403);
  expect(state.progress).not.toHaveBeenCalled();
});
it("passes only the verified database actor to learner progress and never awards on GET", async () => {
  const r = await fetch(base + "/progress?timezone=UTC");
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(state.progress).toHaveBeenCalledWith({ timezone: "UTC" }, state.user.id);
  expect(state.award).not.toHaveBeenCalled();
});
it("keeps client activity query parameters separate from the trusted actor", async () => {
  const r = await fetch(base + "/activity?year=2024&timezone=UTC");
  expect(r.status).toBe(200);
  expect(state.activity).toHaveBeenCalledWith({ year: "2024", timezone: "UTC" }, state.user.id);
});
it("rejects changed sign-in headers before processing award writes", async () => {
  const r = await fetch(base + "/achievements/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Practice-Session": "different-session" },
    body: JSON.stringify({ timezone: "UTC" }),
  });
  expect(r.status).toBe(409);
  expect(state.award).not.toHaveBeenCalled();
});
it("evaluates achievements only for the authenticated actor with matching session", async () => {
  const r = await fetch(base + "/achievements/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Practice-Session": "sess_verified" },
    body: JSON.stringify({ timezone: "UTC" }),
  });
  expect(r.status).toBe(200);
  expect(state.award).toHaveBeenCalledWith({ timezone: "UTC" }, state.user.id);
});
