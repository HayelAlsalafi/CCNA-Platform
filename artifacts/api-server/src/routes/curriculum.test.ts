import express from "express";
import type { AddressInfo } from "node:net";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "USER",
  authenticated: true,
  active: true,
  summary: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../middlewares/auth", () => ({
  requireAuthenticatedUser: (_req: unknown, res: any, next: () => void) =>
    !state.authenticated ? res.status(401).end() : !state.active ? res.status(403).end() : next(),
  requireAdmin: (_req: unknown, res: any, next: () => void) =>
    state.role === "ADMIN" ? next() : res.status(403).end(),
}));
vi.mock("../lib/curriculum", () => ({
  curriculumSummary: state.summary,
  curriculumMappingReport: state.report,
}));
import router from "./curriculum";
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
beforeAll(async () => {
  const app = express();
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  state.role = "USER";
  state.authenticated = true;
  state.active = true;
  state.summary.mockReset().mockResolvedValue({ domains: [] });
  state.report.mockReset().mockResolvedValue({ unmapped: [] });
});
it("requires authentication and active account before reading curriculum", async () => {
  state.authenticated = false;
  expect((await fetch(base + "/curriculum")).status).toBe(401);
  state.authenticated = true;
  state.active = false;
  expect((await fetch(base + "/curriculum")).status).toBe(403);
  expect(state.summary).not.toHaveBeenCalled();
});
it("serves summary with no-store and denies mapping report to learners", async () => {
  const response = await fetch(base + "/curriculum");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await fetch(base + "/admin/curriculum/mapping")).status).toBe(403);
  expect(state.report).not.toHaveBeenCalled();
});
it("allows only authorized Admin mapping review and has no write operation", async () => {
  state.role = "ADMIN";
  expect((await fetch(base + "/admin/curriculum/mapping")).status).toBe(200);
  expect((await fetch(base + "/curriculum", { method: "POST" })).status).toBe(404);
});
it("sanitizes service failures", async () => {
  state.summary.mockRejectedValue(Error("sensitive database detail"));
  const response = await fetch(base + "/curriculum");
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("sensitive");
});
