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
  topicsTable: {},
  questionsTable: {},
  questionOptionsTable: {},
  db: { select: chain, insert: chain, update: chain },
}));

const practiceService = {
  getPracticeHistory: vi.fn(),
  getPracticeQuestionForTopic: vi.fn(),
  submitPracticeAnswer: vi.fn(),
};
vi.mock("../lib/practice", () => {
  class PracticeApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { ...practiceService, PracticeApiError };
});

const { default: router } = await import("./practice");
const { PracticeApiError } = (await import("../lib/practice")) as unknown as {
  PracticeApiError: new (status: number, code: string, message: string) => Error;
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
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

function signIn(signedIn: boolean) {
  if (!signedIn) {
    getAuthMock.mockReturnValue({ userId: null, sessionClaims: {} });
    currentUser = null;
    return;
  }
  getAuthMock.mockReturnValue({
    userId: "learner_x",
    sessionClaims: { email: "learner@example.com" },
  });
  const now = new Date();
  currentUser = {
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId: "learner_x",
    email: "learner@example.com",
    displayName: "Learner",
    role: "USER",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
}

const topicId = "22222222-2222-4222-8222-222222222222";
const questionId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "66666666-6666-4666-8666-666666666666";
const revisionId = "77777777-7777-4777-8777-777777777777";
const expiresAt = "2026-10-12T10:00:00.000Z";
const request = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(typeof body === "object" && body && "optionKey" in body ? { deliveryId, ...body } : body),
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (response: Response): Promise<any> => response.json();
beforeEach(() => Object.values(practiceService).forEach((service) => service.mockReset()));

describe("practice API authentication", () => {
  it.each([
    ["GET", "/practice/history", undefined],
    ["GET", `/practice/topics/${topicId}/question`, undefined],
    ["POST", `/practice/questions/${questionId}/answer`, { optionKey: "A" }],
  ] as const)("requires an authenticated learner for %s %s", async (method, path, body) => {
    signIn(false);
    const response = await request(method, path, body);
    expect(response.status).toBe(401);
    expect((await json(response)).error.code).toBe("UNAUTHENTICATED");
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();
  });
});

describe("practice question API", () => {
  beforeEach(() => signIn(true));

  it("returns only the safe question DTO before submission", async () => {
    practiceService.getPracticeQuestionForTopic.mockResolvedValue({
      id: questionId, deliveryId, revisionId, expiresAt,
      questionCode: "CCNA-Q-000123",
      topic: { id: topicId, slug: "routing", name: "Routing", status: "ACTIVE" },
      text: "Which layer does a router operate at?",
      type: "MULTIPLE_CHOICE_SINGLE",
      difficulty: "EASY",
      explanation: "The correct answer is Layer 3.",
      referenceNotes: "Private author note.",
      options: [
        { optionKey: "A", text: "Layer 2", isCorrect: false },
        { optionKey: "B", text: "Layer 3", isCorrect: true },
      ],
    });

    const response = await request("GET", `/practice/topics/${topicId}/question`);
    expect(response.status).toBe(200);
    const payload = await response.text();
    expect(payload).not.toMatch(
      /isCorrect|explanation|correctOption|referenceNotes|Layer 3 is correct/i,
    );
    expect(JSON.parse(payload)).toEqual({
      id: questionId, deliveryId, revisionId, expiresAt,
      questionCode: "CCNA-Q-000123",
      topic: { id: topicId, slug: "routing", name: "Routing" },
      text: "Which layer does a router operate at?",
      type: "MULTIPLE_CHOICE_SINGLE",
      difficulty: "EASY",
      options: [
        { optionKey: "A", text: "Layer 2" },
        { optionKey: "B", text: "Layer 3" },
      ],
    });
    expect(practiceService.getPracticeQuestionForTopic).toHaveBeenCalledWith(topicId, undefined, currentUser!.id, null);
  });

  it("returns 404 when the topic has no practice-eligible question", async () => {
    practiceService.getPracticeQuestionForTopic.mockResolvedValue(null);
    const response = await request("GET", `/practice/topics/${topicId}/question`);
    expect(response.status).toBe(404);
    expect((await json(response)).error.code).toBe("NOT_FOUND");
  });

  it("grades an answer only after submission and returns the result DTO", async () => {
    practiceService.submitPracticeAnswer.mockResolvedValue({
      isCorrect: false,
      correctOption: { optionKey: "B", text: "Layer 3" },
      explanation: "Routers operate at Layer 3.",
    });

    const response = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "A",
    });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      isCorrect: false,
      correctOption: { optionKey: "B", text: "Layer 3" },
      explanation: "Routers operate at Layer 3.",
    });
    expect(practiceService.submitPracticeAnswer).toHaveBeenCalledWith(
      questionId,
      "A",
      currentUser!.id, undefined, deliveryId, null,
    );
  });

  it("returns 404 when a question or its topic is disabled", async () => {
    practiceService.getPracticeQuestionForTopic.mockResolvedValue(null);
    practiceService.submitPracticeAnswer.mockResolvedValue(null);

    const fetchResponse = await request("GET", `/practice/topics/${topicId}/question`);
    const submitResponse = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "A",
    });
    expect(fetchResponse.status).toBe(404);
    expect(submitResponse.status).toBe(404);
  });

  it("rejects malformed answer bodies and unknown option keys", async () => {
    const malformed = await request("POST", `/practice/questions/${questionId}/answer`, {
      answer: "A",
    });
    expect(malformed.status).toBe(400);
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();

    practiceService.submitPracticeAnswer.mockRejectedValue(
      new PracticeApiError(400, "INVALID_OPTION", "Selected option is not part of this question."),
    );
    const invalid = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "Z",
    });
    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error.code).toBe("INVALID_OPTION");
  });

  it("rejects client-supplied identity and grading fields before calling the service", async () => {
    const response = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "A",
      userId: "00000000-0000-0000-0000-000000000099",
      isCorrect: true,
      topicId,
    });
    expect(response.status).toBe(400);
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();
  });

  it("uses each authenticated learner's internal ID, not the Clerk ID", async () => {
    practiceService.submitPracticeAnswer.mockResolvedValue({
      isCorrect: true,
      correctOption: { optionKey: "B", text: "Layer 3" },
      explanation: "Routers operate at Layer 3.",
    });
    await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "B" });
    const firstId = currentUser!.id;
    currentUser = { ...currentUser, id: "00000000-0000-0000-0000-000000000002" };
    await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "B" });
    expect(practiceService.submitPracticeAnswer).toHaveBeenNthCalledWith(
      1,
      questionId,
      "B",
      firstId, undefined, deliveryId, null,
    );
    expect(practiceService.submitPracticeAnswer).toHaveBeenNthCalledWith(
      2,
      questionId,
      "B",
      currentUser.id, undefined, deliveryId, null,
    );
  });

  it("does not report grading success when persistence fails", async () => {
    practiceService.submitPracticeAnswer.mockRejectedValue(new Error("Database insert failed"));
    const response = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "B",
    });
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Practice answer could not be submitted." },
    });
  });

  it("rejects disabled learners without calling the practice service", async () => {
    currentUser = { ...currentUser, status: "DISABLED" };
    const response = await request("POST", `/practice/questions/${questionId}/answer`, {
      optionKey: "B",
    });
    expect(response.status).toBe(403);
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();
  });
});

describe("practice history API", () => {
  beforeEach(() => signIn(true));

  it("returns only the history DTO and uses the authenticated internal user ID", async () => {
    const attempt = {
      id: "55555555-5555-4555-8555-555555555555",
      questionId,
      topicId,
      selectedOptionKey: "B",
      isCorrect: true,
      submittedAt: "2026-10-08T10:00:00.000Z",
    };

    practiceService.getPracticeHistory.mockResolvedValue({
      items: [attempt],
      nextCursor: "next_page_cursor",
    });

    const response = await request("GET", "/practice/history?limit=1");

    expect(response.status, await response.clone().text()).toBe(200);
    expect(await json(response)).toEqual({
      items: [attempt],
      nextCursor: "next_page_cursor",
    });
    expect(practiceService.getPracticeHistory).toHaveBeenCalledWith(currentUser!.id, 1, undefined, undefined, false);
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?limit=abc",
    "?limit=1.5",
    "?limit=-1",
    "?limit=2&limit=3",
    "?cursor=invalid!",
    "?cursor=",
  ])("rejects invalid pagination parameters: %s", async (query) => {
    const response = await request("GET", "/practice/history" + query);
    expect(response.status).toBe(400);
    expect(practiceService.getPracticeHistory).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed encoded cursor", async () => {
    practiceService.getPracticeHistory.mockRejectedValue(
      new Error("Invalid practice history cursor"),
    );

    const response = await request("GET", "/practice/history?cursor=abc");
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe("VALIDATION_ERROR");
  });

  it("does not expose database errors", async () => {
    practiceService.getPracticeHistory.mockRejectedValue(
      new Error("Sensitive database connection details"),
    );

    const response = await request("GET", "/practice/history");
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Practice history could not be fetched.",
      },
    });
  });

  it("rejects disabled users before querying history", async () => {
    currentUser = { ...currentUser, status: "DISABLED" };

    const response = await request("GET", "/practice/history");
    expect(response.status).toBe(403);
    expect(practiceService.getPracticeHistory).not.toHaveBeenCalled();
  });
});

// Regression coverage for the additive display-details contract.
describe("practice history display details", () => {
  beforeEach(() => signIn(true));
  const attempt = {
    id: "55555555-5555-4555-8555-555555555555", questionId, topicId,
    selectedOptionKey: "B", isCorrect: true, submittedAt: "2026-10-08T10:00:00.000Z",
  };

  it("returns opt-in display fields and strips answer/explanation/private identity", async () => {
    practiceService.getPracticeHistory.mockResolvedValue({
      items: [{ ...attempt, questionCode: "CCNA-Q-000001", topicName: "Original topic",
        explanation: "PRIVATE", correctOption: { optionKey: "B" }, userId: "PRIVATE" }],
      nextCursor: "same_cursor",
    });
    const response = await request("GET", "/practice/history?includeDetails=true&limit=1");
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      items: [{ ...attempt, questionCode: "CCNA-Q-000001", topicName: "Original topic" }], nextCursor: "same_cursor",
    });
    expect(practiceService.getPracticeHistory).toHaveBeenCalledWith(currentUser!.id, 1, undefined, undefined, true);
  });

  it.each(["", "?includeDetails=false"])("preserves old wire response for %s", async (query) => {
    practiceService.getPracticeHistory.mockResolvedValue({
      items: [{ ...attempt, questionCode: "CCNA-Q-000001", topicName: "Original topic" }], nextCursor: null,
    });
    const response = await request("GET", "/practice/history" + query);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ items: [attempt], nextCursor: null });
  });

  it("preserves null display fields without dropping an attempt", async () => {
    practiceService.getPracticeHistory.mockResolvedValue({
      items: [{ ...attempt, questionCode: null, topicName: null }], nextCursor: null,
    });
    const response = await request("GET", "/practice/history?includeDetails=true");
    expect(response.status).toBe(200);
    expect((await json(response)).items).toEqual([{ ...attempt, questionCode: null, topicName: null }]);
  });

  it.each(["1", "TRUE", "", "true&includeDetails=false", "true&includeDetails=true"])(
    "rejects malformed or repeated includeDetails=%s", async (value) => {
      const response = await request("GET", "/practice/history?includeDetails=" + value);
      expect(response.status).toBe(400);
      expect(practiceService.getPracticeHistory).not.toHaveBeenCalled();
    },
  );

  it("takes identity from authentication even when a userId is sent by the client", async () => {
    practiceService.getPracticeHistory.mockResolvedValue({ items: [], nextCursor: null });
    const ownId = currentUser!.id;
    await request("GET", "/practice/history?includeDetails=true&userId=other-user");
    currentUser = { ...currentUser, id: "00000000-0000-0000-0000-000000000002" };
    await request("GET", "/practice/history?includeDetails=true&userId=" + ownId);
    expect(practiceService.getPracticeHistory.mock.calls.map((args) => args[0])).toEqual([ownId, currentUser.id]);
  });

  it.each([401, 403, 500])("keeps HTTP %s behavior with includeDetails=true", async (status) => {
    if (status === 401) signIn(false);
    if (status === 403) currentUser = { ...currentUser, status: "DISABLED" };
    if (status === 500) practiceService.getPracticeHistory.mockRejectedValue(new Error("PRIVATE"));
    const response = await request("GET", "/practice/history?includeDetails=true");
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("PRIVATE");
    if (status !== 500) expect(practiceService.getPracticeHistory).not.toHaveBeenCalled();
  });
});


describe("immutable delivery request contract", () => {
  beforeEach(() => signIn(true));
  it("fails closed for an old client without a delivery", async () => {
    const response = await fetch(base + `/practice/questions/${questionId}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optionKey: "A" }) });
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe("DELIVERY_REQUIRED");
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();
  });
  it("rejects malformed delivery UUIDs before grading", async () => {
    const response = await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "A", deliveryId: "bad" });
    expect(response.status).toBe(400);
    expect(practiceService.submitPracticeAnswer).not.toHaveBeenCalled();
  });
  it("binds delivery and submit to the server verified session, not client metadata", async () => {
    getAuthMock.mockReturnValue({ userId: "learner_x", sessionId: "sess_verified", sessionClaims: { email: "learner@example.com" } });
    practiceService.getPracticeQuestionForTopic.mockResolvedValue(null);
    await request("GET", `/practice/topics/${topicId}/question`);
    expect(practiceService.getPracticeQuestionForTopic).toHaveBeenCalledWith(topicId, undefined, currentUser!.id, "sess_verified");
    practiceService.submitPracticeAnswer.mockResolvedValue(null);
    await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "A" });
    expect(practiceService.submitPracticeAnswer).toHaveBeenCalledWith(questionId, "A", currentUser!.id, undefined, deliveryId, "sess_verified");
    const spoof = await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "A", sessionId: "sess_other" });
    expect(spoof.status).toBe(400);
    expect(practiceService.submitPracticeAnswer).toHaveBeenCalledTimes(1);
  });
  it.each(["DELIVERY_EXPIRED", "SUBMISSION_CONFLICT"])("returns a clear 409 for %s", async code => {
    practiceService.submitPracticeAnswer.mockRejectedValue(new PracticeApiError(409, code, "Load a fresh question."));
    const response = await request("POST", `/practice/questions/${questionId}/answer`, { optionKey: "A" });
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe(code);
  });
});
