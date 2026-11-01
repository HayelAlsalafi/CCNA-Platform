import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { parseApiBody } from "../middlewares/body-parsing";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  operation: vi.fn(),
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    clerkUserId: "fixture",
    role: "USER",
    status: "ACTIVE",
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
    for (const key of ["from", "where", "set", "values", "onConflictDoNothing"])
      value[key] = () => value;
    value.limit = value.returning = async () => [state.user];
    return value;
  };
  return {
    ...(await import("@workspace/db/schema")),
    db: { select: chain, update: chain, insert: chain },
  };
});
vi.mock("../lib/lessons", async (original) => ({
  ...(await original<typeof import("../lib/lessons")>()),
  adminLessonList: state.operation,
  adminLessonLibrary: state.operation,
  adminLessonGet: state.operation,
  createLesson: state.operation,
  updateLesson: state.operation,
  publishLesson: state.operation,
  lessonRevisions: state.operation,
  reorderLessons: state.operation,
  chapterLessonList: state.operation,
  publishedLesson: state.operation,
}));
// Mount the actual API route registry, not only the isolated lesson router.
import router from "./index";
import { LessonError } from "../lib/lessons";
let server: ReturnType<ReturnType<typeof express>["listen"]>, base: string;
const id = "11111111-1111-4111-8111-111111111111";
const input = {
  chapterId: id,
  title: "A lesson",
  description: "Description",
  objectives: ["Explain networking"],
  estimatedMinutes: 5,
  displayOrder: 0,
  blocks: [{ id, type: "paragraph", text: "TCP is connection-oriented." }],
};
beforeAll(async () => {
  const app = express();
  app.use(parseApiBody);
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.user.role = "USER";
  state.user.status = "ACTIVE";
  state.auth.mockReturnValue({
    userId: "fixture",
    sessionId: "session_a",
    sessionClaims: { email: state.user.email, role: "ADMIN" },
  });
  state.operation.mockResolvedValue({
    items: [],
    lesson: {
      ...input,
      id,
      version: 1,
      status: "DRAFT",
      publishedRevisionId: null,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T00:00:00.000Z",
    },
  });
});
const write = (body: unknown, session = "session_a") => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Admin-Session": session },
  body: JSON.stringify(body),
});
it("rejects signed-out chapter lesson reads before service access", async () => {
  state.auth.mockReturnValue({ userId: null, sessionId: null });
  const response = await fetch(`${base}/chapters/${id}/lessons`);
  expect(response.status).toBe(401);
  expect(state.operation).not.toHaveBeenCalled();
});
it("permits active learners to read published services only and forbids admin draft listing", async () => {
  expect((await fetch(`${base}/chapters/${id}/lessons`)).status).toBe(200);
  expect(state.operation).toHaveBeenCalledWith(id);
  state.operation.mockClear();
  expect((await fetch(`${base}/admin/lessons`)).status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
});
it("protects paginated studio metadata with the existing database ADMIN boundary", async () => {
  expect((await fetch(`${base}/admin/lessons/library`)).status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
  state.user.role = "ADMIN";
  state.operation.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    summary: { total: 0, published: 0, drafts: 0, chapters: 0 },
  });
  const response = await fetch(`${base}/admin/lessons/library?q=CLI&status=PUBLISHED`);
  expect(response.status).toBe(200);
  expect(state.operation).toHaveBeenCalledWith({
    q: "CLI",
    status: "PUBLISHED",
    page: 1,
    pageSize: 25,
  });
  expect((await fetch(`${base}/admin/lessons/library?pageSize=500`)).status).toBe(400);
});
it("uses database role instead of ADMIN token claims for authoring", async () => {
  expect((await fetch(`${base}/admin/lessons`, write(input))).status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
});
it("disabled learners cannot retrieve lessons", async () => {
  state.user.status = "DISABLED";
  expect((await fetch(`${base}/lessons/${id}`)).status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
});
it("authenticates admin creation with strict body and current session", async () => {
  state.user.role = "ADMIN";
  const response = await fetch(`${base}/admin/lessons`, write(input));
  expect(response.status).toBe(200);
  expect(state.operation).toHaveBeenCalledWith(input, id);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects stale session mutation intent without writing", async () => {
  state.user.role = "ADMIN";
  const response = await fetch(`${base}/admin/lessons`, write(input, "old_session"));
  expect(response.status).toBe(409);
  expect(state.operation).not.toHaveBeenCalled();
});
it("rejects unknown properties, invalid UUIDs and query injection without querying lessons", async () => {
  state.user.role = "ADMIN";
  expect(
    (await fetch(`${base}/admin/lessons`, write({ ...input, publishedRevisionId: id }))).status,
  ).toBe(400);
  expect((await fetch(`${base}/lessons/not-a-uuid`)).status).toBe(400);
  expect((await fetch(`${base}/admin/lessons?role=ADMIN`)).status).toBe(400);
  expect(state.operation).not.toHaveBeenCalled();
});
it("exposes absent-schema activation gate rather than fabricated empty lessons", async () => {
  state.operation.mockRejectedValue(
    new LessonError(503, "LESSONS_NOT_READY", "Migration awaits approval."),
  );
  const response = await fetch(`${base}/chapters/${id}/lessons`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: "LESSONS_NOT_READY", message: "Migration awaits approval." },
  });
});
it("retains exact missing lesson semantics without exposing drafts", async () => {
  state.operation.mockRejectedValue(new LessonError(404, "LESSON_NOT_FOUND", "Lesson not found."));
  const response = await fetch(`${base}/lessons/${id}`);
  expect(response.status).toBe(404);
});
it("conflict responses preserve meaningful reload feedback", async () => {
  state.user.role = "ADMIN";
  state.operation.mockRejectedValue(
    new LessonError(409, "LESSON_CONFLICT", "Reload latest version."),
  );
  const response = await fetch(`${base}/admin/lessons/${id}/publish`, write({ version: 1 }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.message).toBe("Reload latest version.");
});
it("sanitizes unexpected driver errors without raw SQL or credentials", async () => {
  state.operation.mockRejectedValue(new Error("password=never-print SELECT secret"));
  const response = await fetch(`${base}/lessons/${id}`);
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toMatch(/never-print|SELECT secret/);
});
it("routes publication and unpublication explicitly with optimistic version", async () => {
  state.user.role = "ADMIN";
  expect((await fetch(`${base}/admin/lessons/${id}/publish`, write({ version: 2 }))).status).toBe(
    200,
  );
  expect(state.operation).toHaveBeenLastCalledWith(id, 2, id, true);
  expect((await fetch(`${base}/admin/lessons/${id}/unpublish`, write({ version: 3 }))).status).toBe(
    200,
  );
  expect(state.operation).toHaveBeenLastCalledWith(id, 3, id, false);
});
it("rejects learner revision-history access", async () => {
  expect((await fetch(`${base}/admin/lessons/${id}/revisions`)).status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
});
it("parses an authorized lesson above the global 100KB limit only after ADMIN checks", async () => {
  state.user.role = "ADMIN";
  const body = {
    ...input,
    blocks: Array.from({ length: 6 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      type: "paragraph",
      text: "x".repeat(20000),
    })),
  };
  const response = await fetch(`${base}/admin/lessons`, write(body));
  expect(response.status).toBe(200);
  expect(state.operation).toHaveBeenCalledWith(body, id);
});
it("rejects unauthorized malformed lesson bodies before parsing or accessing content", async () => {
  const response = await fetch(`${base}/admin/lessons`, { ...write(input), body: "{malformed" });
  expect(response.status).toBe(403);
  expect(state.operation).not.toHaveBeenCalled();
});
it("rejects malformed successful service responses instead of exposing invalid lesson data", async () => {
  state.operation.mockResolvedValue({ lesson: { title: "Missing immutable snapshot" } });
  const response = await fetch(`${base}/lessons/${id}`);
  expect(response.status).toBe(500);
  const error = (await response.json()).error;
  expect(error.code).toBe("LESSON_RESPONSE_INVALID");
  expect(error.details).toContainEqual({ path: "lesson.id", code: expect.any(String) });
  expect(JSON.stringify(error)).not.toContain("Missing immutable snapshot");
});

it("passes non-empty real chapter and library service outputs through the actual response validators", async () => {
  const service = await vi.importActual<typeof import("../lib/lessons")>("../lib/lessons");
  const chapterId = "9d8bd104-2bc5-59c8-a417-367996c7d8b9";
  const lessonId = "22222222-2222-4222-8222-222222222222",
    revisionId = "33333333-3333-4333-8333-333333333333";
  const { blocks: _, objectives: __, ...summary } = input;
  const metadata = {
    id: lessonId,
    version: 6,
    displayOrder: 0,
    revisionId,
    revisionNumber: 6,
    createdAt: new Date("2026-10-28T00:00:00Z"),
    updatedAt: new Date("2026-10-28T00:00:00Z"),
    snapshot: { ...summary, chapterId },
  };
  const database = {
    execute: vi.fn(async (statement: SQL) => {
      const q = new PgDialect().sqlToQuery(statement).sql;
      expect(q.trim().startsWith("SELECT")).toBe(true);
      if (q.includes("to_regclass")) return { rows: [{ ready: true }] };
      if (q.includes("r.snapshot-")) return { rows: [metadata] };
      if (q.includes("count(DISTINCT"))
        return { rows: [{ total: 1, published: 1, drafts: 0, chapters: 1 }] };
      if (q.includes("count(*)")) return { rows: [{ total: 1 }] };
      return {
        rows: [
          {
            ...summary,
            id: lessonId,
            chapterId,
            version: 6,
            publishedRevisionId: revisionId,
            publishedRevisionNumber: 6,
            domainId: id,
            domainName: "Network Fundamentals",
            chapterTitle: "Introduction to TCP/IP Networking",
            volume: "V1",
            chapterNumber: 1,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
          },
        ],
      };
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(database)),
  };
  state.operation.mockImplementation((chapter: string) =>
    service.chapterLessonList(chapter, database as never),
  );
  const chapter = await fetch(`${base}/chapters/${chapterId}/lessons`);
  expect(chapter.status).toBe(200);
  expect((await chapter.json()).items[0]).toMatchObject({
    id: lessonId,
    chapterId,
    status: "PUBLISHED",
    revisionId,
    revisionNumber: 6,
  });
  expect(chapter.headers.get("x-lesson-api-contract")).toBe("discovery-library-v2");
  state.user.role = "ADMIN";
  state.operation.mockImplementation((query: unknown) =>
    service.adminLessonLibrary(query, database as never),
  );
  const library = await fetch(`${base}/admin/lessons/library?page=1&pageSize=25`);
  expect(library.status).toBe(200);
  const body = await library.json();
  expect(body.items[0]).toMatchObject({
    id: lessonId,
    status: "PUBLISHED",
    chapterId,
    domainName: "Network Fundamentals",
  });
  expect(body.total).toBe(1);
});
it("returns GET filter diagnostics instead of telling the reader to edit lesson content", async () => {
  state.user.role = "ADMIN";
  const response = await fetch(`${base}/admin/lessons/library?pageSize=500`);
  expect(response.status).toBe(400);
  const error = (await response.json()).error;
  expect(error.message).toContain("invalid filters");
  expect(error.details[0].path).toBe("pageSize");
  expect(state.operation).not.toHaveBeenCalled();
});
