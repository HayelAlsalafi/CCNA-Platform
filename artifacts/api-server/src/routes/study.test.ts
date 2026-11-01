import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { parseApiBody } from "../middlewares/body-parsing";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  operation: vi.fn(),
  media: vi.fn(),
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    role: "USER",
    status: "ACTIVE",
    clerkUserId: "fixture",
    email: "fixture@example.invalid",
    displayName: "Fixture",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
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
vi.mock("../lib/study", async (original) => ({
  ...(await original<typeof import("../lib/study")>()),
  lessonStudy: state.operation,
  createAnnotation: state.operation,
  changeAnnotation: state.operation,
  saveProgress: state.operation,
  studyWorkspace: state.operation,
  studyProgress: state.operation,
}));
vi.mock("../lib/lesson-media", async (original) => ({
  ...(await original<typeof import("../lib/lesson-media")>()),
  uploadLessonMedia: state.media,
  readLessonMedia: state.media,
}));
import router from "./index";
import { LessonError } from "../lib/lessons";
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
const id = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  const app = express();
  app.use(parseApiBody);
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  state.user.role = "USER";
  state.user.status = "ACTIVE";
  state.auth.mockReturnValue({
    userId: "fixture",
    sessionId: "study-session",
    sessionClaims: { role: "ADMIN", email: state.user.email },
  });
  state.operation.mockResolvedValue({
    revisionId: id,
    annotations: [],
    progress: { state: "NOT_STARTED", version: 0, blockId: null },
  });
});
const write = (body: unknown, session = "study-session") => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Study-Session": session },
  body: JSON.stringify(body),
});
it("registers authenticated study reads and rejects missing/disabled users", async () => {
  expect((await fetch(`${base}/study/lessons/${id}`)).status).toBe(200);
  expect(state.operation).toHaveBeenCalledWith(id, id);
  state.user.status = "DISABLED";
  expect((await fetch(`${base}/study/lessons/${id}`)).status).toBe(403);
  state.auth.mockReturnValue({ userId: null });
  expect((await fetch(`${base}/study/workspace`)).status).toBe(401);
});
it("requires current session intent and rejects client ownership spoofing", async () => {
  const body = { lessonId: id, revisionId: id, kind: "NOTE", body: "My note" };
  expect((await fetch(`${base}/study/annotations`, write(body, "other-session"))).status).toBe(409);
  expect(state.operation).not.toHaveBeenCalled();
  expect((await fetch(`${base}/study/annotations`, write({ ...body, userId: id }))).status).toBe(
    400,
  );
  expect(state.operation).not.toHaveBeenCalled();
});
it("returns honest not-activated errors without fabricated saved items", async () => {
  state.operation.mockRejectedValue(
    new LessonError(503, "STUDY_NOT_READY", "Study storage not activated."),
  );
  const response = await fetch(`${base}/study/lessons/${id}`);
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("STUDY_NOT_READY");
});
it("protects image uploads with database ADMIN authorization before reading bytes", async () => {
  expect(
    (
      await fetch(`${base}/admin/lesson-media`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: "image",
      })
    ).status,
  ).toBe(403);
  expect(state.media).not.toHaveBeenCalled();
  state.user.role = "ADMIN";
  state.media.mockResolvedValue({
    id,
    url: "/api/lesson-media/" + id,
    mime: "image/png",
    bytes: 5,
  });
  expect(
    (
      await fetch(`${base}/admin/lesson-media`, {
        method: "POST",
        headers: { "Content-Type": "image/png", "X-Admin-Session": "study-session" },
        body: "image",
      })
    ).status,
  ).toBe(200);
  expect(state.media).toHaveBeenCalledWith(id, expect.any(Buffer), "image/png");
});
