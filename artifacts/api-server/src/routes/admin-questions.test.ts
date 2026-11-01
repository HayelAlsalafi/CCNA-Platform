/**
 * HTTP-level coverage for /api/admin/questions. The real auth middleware runs;
 * only Clerk's session reader, the DB user lookup, and question services are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const getAuthMock = vi.fn();
vi.mock("@clerk/express", () => ({ getAuth: (req: unknown) => getAuthMock(req) }));

let currentUser: Record<string, unknown> | null = null;
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const method of ["from", "where", "values", "set", "onConflictDoNothing"]) {
    c[method] = () => c;
  }
  c["limit"] = async () => (currentUser ? [currentUser] : []);
  c["returning"] = async () => (currentUser ? [currentUser] : []);
  return c;
};
vi.mock("@workspace/db", () => ({
  usersTable: { clerkUserId: "clerk_user_id", id: "id" },
  topicsTable: { id: "topic_id" },
  questionsTable: {
    id: "question_id",
    topicId: "topic_id",
    status: "status",
    difficulty: "difficulty",
    createdAt: "created_at",
  },
  questionOptionsTable: { questionId: "question_id", displayOrder: "display_order" },
  db: { select: chain, insert: chain, update: chain, delete: chain },
}));

const services = {
  listAdminQuestions: vi.fn(),
  createAdminQuestion: vi.fn(),
  updateAdminQuestion: vi.fn(),
  disableAdminQuestion: vi.fn(),
};
const deleteRecords = vi.fn();
const studio = vi.hoisted(() => ({
  listStudioQuestions: vi.fn(),
  studioLookup: vi.fn(),
  studioQuestionDetails: vi.fn(),
  saveStudioQuestion: vi.fn(),
  studioDuplicates: vi.fn(),
  bulkStudioQuestions: vi.fn(),
  studioDeletePreview: vi.fn(),
}));
vi.mock("../lib/question-studio", () => studio);
vi.mock("../lib/admin-delete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/admin-delete")>()),
  deleteAdminRecords: (...args: unknown[]) => deleteRecords(...args),
}));
vi.mock("../lib/admin-history-delete",async(importOriginal)=>({...await importOriginal<typeof import("../lib/admin-history-delete")>(),deleteQuestionsOrdinary:(...args:unknown[])=>deleteRecords(...args)}));
vi.mock("../lib/questions-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/questions-admin")>();
  return { ...actual, ...services };
});

const { default: router } = await import("./admin-questions");
const { AdminQuestionError } = await import("../lib/questions-admin");

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
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

function signIn(role: "USER" | "ADMIN" | null, status = "ACTIVE") {
  if (!role) {
    getAuthMock.mockReturnValue({ userId: null, sessionClaims: {} });
    currentUser = null;
    return;
  }
  getAuthMock.mockReturnValue({ userId: "user_x", sessionId:"sess_verified", sessionClaims: { email: "admin@example.com" } });
  const now = new Date();
  currentUser = {
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId: "user_x",
    email: "admin@example.com",
    displayName: "Admin",
    role,
    status,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
}

const id = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const question = {
  id,
  questionCode: "CCNA-Q-000123",
  topicId,
  text: "Which layer does a router operate at?",
  type: "MULTIPLE_CHOICE_SINGLE",
  difficulty: "EASY",
  explanation: "",
  imageKey: null,
  referenceNotes: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  options: [
    { optionKey: "A", displayOrder: 0, text: "Layer 2", isCorrect: false },
    { optionKey: "B", displayOrder: 1, text: "Layer 3", isCorrect: true },
  ],
};
const request = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (response: Response): Promise<any> => response.json();
beforeEach(() => Object.values(services).forEach((service) => service.mockReset()));

describe("admin question API authorization", () => {
  it("allows database-authorized ADMIN deletion and forwards exact selected IDs", async () => {
    signIn("ADMIN");
    deleteRecords.mockResolvedValue({
      items: [{ id, outcome: "BLOCKED", reason: "revisions: 1" }],
      deleted: 0,
      blocked: 1,
    });
    expect(await json(await request("GET", "/admin/questions/delete-policy"))).toEqual({
      mode: "permanent-only-v2",
    });
    expect((await request("DELETE", `/admin/questions/${id}`)).status).toBe(200);
    expect(deleteRecords).toHaveBeenCalledWith({ ids: [id] },{actorId:currentUser!.id,sessionId:"sess_verified"});
    expect((await request("POST", "/admin/questions/bulk-delete", { ids: [id] })).status).toBe(200);
  });
  const routes: [string, string, unknown?][] = [
    ["GET", "/admin/questions/studio"],
    ["GET", "/admin/questions/studio/lookup?kind=topics"],
    ["GET", "/admin/questions/studio/" + id],
    ["POST", "/admin/questions/studio", {}],
    ["PATCH", "/admin/questions/studio/" + id, {}],
    ["POST", "/admin/questions/studio/duplicates", {}],
    ["POST", "/admin/questions/studio/bulk", {}],
    ["POST", "/admin/questions/studio/deletion-preview", {}],
    ["POST", "/admin/questions/history-delete/preview", { ids: [id] }],
    ["POST", "/admin/questions/history-delete/confirm", { token: id }],
    ["GET", "/admin/questions/delete-policy"],
    ["DELETE", `/admin/questions/${id}`],
    ["POST", "/admin/questions/bulk-delete", { ids: [id] }],
    ["GET", "/admin/questions"],
    [
      "POST",
      "/admin/questions",
      {
        topicId,
        text: "Q",
        type: "MULTIPLE_CHOICE_SINGLE",
        difficulty: "EASY",
        options: question.options,
      },
    ],
    ["PATCH", `/admin/questions/${id}`, { text: "Updated" }],
    ["POST", `/admin/questions/${id}/disable`],
  ];

  it.each(routes)("%s %s → 401 without a session", async (method, path, body) => {
    signIn(null);
    const response = await request(method, path, body);
    expect(response.status).toBe(401);
    expect((await json(response)).error.code).toBe("UNAUTHENTICATED");
  });
  it.each(routes)("%s %s → 403 for a USER", async (method, path, body) => {
    signIn("USER");
    const response = await request(method, path, body);
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe("FORBIDDEN");
  });
  it("rejects a disabled ADMIN and never calls a question service", async () => {
    signIn("ADMIN", "DISABLED");
    const response = await request("GET", "/admin/questions");
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe("ACCOUNT_DISABLED");
    expect(Object.values(services).every((service) => !service.mock.calls.length)).toBe(true);
  });
});

describe("admin question API (ADMIN)", () => {
  beforeEach(() => signIn("ADMIN"));

  it("validates pagination and forwards topic/status/difficulty filters", async () => {
    services.listAdminQuestions.mockResolvedValue({
      items: [question],
      total: 1,
      limit: 10,
      offset: 20,
    });
    const response = await request(
      "GET",
      `/admin/questions?topicId=${topicId}&status=DISABLED&difficulty=HARD&limit=10&offset=20`,
    );
    expect(response.status).toBe(200);
    expect((await json(response)).items[0].questionCode).toBe(question.questionCode);
    expect(services.listAdminQuestions).toHaveBeenCalledWith({
      topicId,
      status: "DISABLED",
      difficulty: "HARD",
      limit: 10,
      offset: 20,
    });
  });
  it("returns 400 for invalid filters before calling the service", async () => {
    const response = await request("GET", "/admin/questions?limit=101&status=DELETED");
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe("VALIDATION_ERROR");
    expect(services.listAdminQuestions).not.toHaveBeenCalled();
  });
  it("creates a question and returns 201", async () => {
    services.createAdminQuestion.mockResolvedValue(question);
    const response = await request("POST", "/admin/questions", {
      topicId,
      text: question.text,
      type: question.type,
      difficulty: question.difficulty,
      options: question.options.map(({ optionKey, text, isCorrect }) => ({
        optionKey,
        text,
        isCorrect,
      })),
    });
    expect(response.status).toBe(201);
    expect((await json(response)).questionCode).toBe(question.questionCode);
  });
  it("updates questions and replaces options through one patch request", async () => {
    services.updateAdminQuestion.mockResolvedValue({ ...question, text: "Updated question" });
    const response = await request("PATCH", `/admin/questions/${id}`, {
      text: "Updated question",
      options: question.options.map(({ optionKey, text, isCorrect }) => ({
        optionKey,
        text,
        isCorrect,
      })),
    });
    expect(response.status).toBe(200);
    expect(services.updateAdminQuestion).toHaveBeenCalledWith(id, {
      text: "Updated question",
      options: question.options.map(({ optionKey, text, isCorrect }) => ({
        optionKey,
        text,
        isCorrect,
      })),
    });
  });
  it("disables without exposing a delete operation", async () => {
    services.disableAdminQuestion.mockResolvedValue({ ...question, status: "DISABLED" });
    const response = await request("POST", `/admin/questions/${id}/disable`);
    expect(response.status).toBe(200);
    expect((await json(response)).status).toBe("DISABLED");
    expect(services.disableAdminQuestion).toHaveBeenCalledWith(id);
  });
  it("maps validation and not-found errors and rejects malformed IDs", async () => {
    services.createAdminQuestion.mockRejectedValueOnce(
      new AdminQuestionError(400, "VALIDATION_ERROR", "Invalid question data."),
    );
    expect((await request("POST", "/admin/questions", {})).status).toBe(400);
    services.updateAdminQuestion.mockRejectedValueOnce(
      new AdminQuestionError(404, "NOT_FOUND", "Question not found."),
    );
    expect((await request("PATCH", `/admin/questions/${id}`, { text: "Updated" })).status).toBe(
      404,
    );
    const malformed = await request("POST", "/admin/questions/not-a-uuid/disable");
    expect(malformed.status).toBe(404);
    expect(services.disableAdminQuestion).not.toHaveBeenCalled();
  });
  it("does not expose internal error details", async () => {
    services.listAdminQuestions.mockRejectedValue(new Error("private connection details"));
    const response = await request("GET", "/admin/questions");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private connection details");
  });
});
