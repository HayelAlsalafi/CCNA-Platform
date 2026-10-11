import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { GetLearningProgressResponse } from "@workspace/api-zod";
import { parseApiBody } from "../middlewares/body-parsing";

const state = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getProgress: vi.fn(),
  user: null as Record<string, unknown> | null,
  authDbError: false,
}));
vi.mock("@clerk/express", () => ({ getAuth: state.getAuth }));
vi.mock("@workspace/db", () => {
  const chain = () => {
    if (state.authDbError) throw new Error("private database failure");
    const result: Record<string, unknown> = {};
    for (const method of ["from", "where", "set", "values", "onConflictDoNothing"]) {
      result[method] = () => result;
    }
    result["limit"] = result["returning"] = async () => (state.user ? [state.user] : []);
    return result;
  };
  return {
    db: { select: chain, update: chain, insert: chain },
    usersTable: { clerkUserId: "clerk_user_id", id: "id" },
    topicsTable: {},
  };
});
vi.mock("../lib/learning-progress", () => ({ getLearningProgress: state.getProgress }));
const { default: router } = await import("./learning");

const examples = [
  ...readFileSync(
    new URL("../../../../docs/api/learning-progress.md", import.meta.url),
    "utf8",
  ).matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g),
].map((match) => JSON.parse(match[1]));
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let base: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
const logError = vi.fn();

function signIn(id: string | null = userA, status = "ACTIVE", role = "USER") {
  state.getAuth.mockReturnValue({
    userId: id ? "clerk-identity" : null,
    sessionClaims: { email: "learner@example.test", role: "ADMIN" },
  });
  state.user = id
    ? {
        id,
        clerkUserId: "clerk-identity",
        email: "learner@example.test",
        displayName: "Learner",
        role,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      }
    : null;
}
beforeAll(async () => {
  const app = express();
  app.use(parseApiBody);
  app.use((req, _res, next) => {
    req.log = { error: logError, info: vi.fn() } as unknown as typeof req.log;
    next();
  });
  app.post("/body-parsing-regression", (req, res) => {
    res.json(req.body);
  });
  app.use("/api", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/learning/progress`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);
beforeEach(() => {
  vi.clearAllMocks();
  state.authDbError = false;
  signIn();
  state.getProgress.mockResolvedValue(examples[0]);
});

describe("GET /learning/progress", () => {
  it("requires authentication before reading metrics or validating inputs", async () => {
    signIn(null);
    const response = await fetch(base + "?userId=" + userB);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(state.getProgress).not.toHaveBeenCalled();
  });
  it("uses the database account status and returns 403 for disabled accounts", async () => {
    signIn(userA, "DISABLED");
    const response = await fetch(base);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ error: { code: "ACCOUNT_DISABLED" } });
    expect(state.getProgress).not.toHaveBeenCalled();
  });
  it.each(["USER", "ADMIN"])(
    "returns only the internal authenticated %s user's metrics",
    async (role) => {
      signIn(userA, "ACTIVE", role);
      const response = await fetch(base);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(state.getProgress).toHaveBeenCalledExactlyOnceWith(userA);
      expect(GetLearningProgressResponse.parse(body)).toEqual(examples[0]);
      expect(body).toEqual(examples[0]);
    },
  );
  it("keeps two authenticated user requests isolated", async () => {
    state.getProgress.mockImplementation(async (id: string) =>
      id === userA ? examples[0] : examples[1],
    );
    signIn(userA);
    const a = GetLearningProgressResponse.parse(await (await fetch(base)).json());
    signIn(userB);
    const b = GetLearningProgressResponse.parse(await (await fetch(base)).json());
    expect(a.summary.totalAttempts).toBe(3);
    expect(b.summary.totalAttempts).toBe(0);
    expect(state.getProgress.mock.calls).toEqual([[userA], [userB]]);
  });
  it.each(["?userId=" + userB, "?limit=1", "?userId[]=x", "?__proto__[userId]=x", "?unknown="])(
    "rejects all query parameters: %s",
    async (query) => {
      const response = await fetch(base + query);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(state.getProgress).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["application/json", JSON.stringify({ userId: userB })],
    ["application/json", "{}"],
    ["application/json", "null"],
    ["application/json", "{invalid"],
    ["text/plain", "userId=" + userB],
  ])("rejects GET bodies of type %s", async (contentType, body) => {
    const response = await new Promise<{ status: number; cache: unknown; text: string }>(
      (resolve, reject) => {
        const request = httpRequest(
          base,
          {
            method: "GET",
            headers: { "content-type": contentType, "content-length": Buffer.byteLength(body) },
          },
          (res) => {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              text += chunk;
            });
            res.on("end", () =>
              resolve({
                status: res.statusCode!,
                cache: res.headers["cache-control"],
                text,
              }),
            );
          },
        );
        request.on("error", reject);
        request.end(body);
      },
    );
    expect(response.status).toBe(400);
    expect(response.cache).toBe("private, no-store");
    expect(state.getProgress).not.toHaveBeenCalled();
  });
  it("returns a sanitized 500 when the service fails", async () => {
    state.getProgress.mockRejectedValue(new Error("private SQL and connection details"));
    const response = await fetch(base);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Learning progress could not be loaded." },
    });
    expect(logError).toHaveBeenCalledExactlyOnceWith("Could not load learning progress");
  });
  it("returns the existing sanitized authentication error when user resolution fails", async () => {
    state.authDbError = true;
    const response = await fetch(base);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ error: { code: "AUTHENTICATION_ERROR" } });
    expect(state.getProgress).not.toHaveBeenCalled();
  });
  it("fails closed if service output violates the approved contract", async () => {
    state.getProgress.mockResolvedValue({
      ...examples[0],
      summary: { ...examples[0].summary, coveragePercent: 101 },
    });
    expect((await fetch(base)).status).toBe(500);
  });
});

describe("existing request body parsing", () => {
  it.each([
    ["application/json", JSON.stringify({ optionKey: "A" })],
    ["application/x-www-form-urlencoded", "optionKey=A"],
  ])("preserves %s parsing", async (type, body) => {
    const response = await fetch(new URL("/body-parsing-regression", base), {
      method: "POST",
      headers: { "content-type": type },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ optionKey: "A" });
  });
});

describe("approved contract examples", () => {
  it.each(examples.map((example, index) => [index, example] as const))(
    "accepts documented example %s without changing response fields",
    (_index, example) => {
      expect(GetLearningProgressResponse.parse(example)).toEqual(example);
    },
  );
});
