import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, type User, usersTable } from "@workspace/db";

export type VerifiedRequestAuth = Readonly<{
  userId: string;
  clerkUserId: string;
  sessionId: string | null;
}>;

declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
      verifiedAuth?: VerifiedRequestAuth;
    }
  }
}

type SessionClaims = Record<string, unknown>;

function getClaimString(claims: SessionClaims, key: string): string | null {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDisplayName(claims: SessionClaims, email: string): string {
  const firstName = getClaimString(claims, "firstName");
  const lastName = getClaimString(claims, "lastName");
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email.split("@")[0] || "CCNA learner";
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: "UNAUTHENTICATED" | "ACCOUNT_DISABLED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

function sendAuthError(res: Response, error: AuthError): void {
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}

export async function resolveLocalUser(request: Request): Promise<User> {
  return resolveVerifiedUser(getAuth(request));
}

async function resolveVerifiedUser(auth: ReturnType<typeof getAuth>): Promise<User> {
  const clerkUserId = auth.userId;
  if (!clerkUserId) {
    throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const claims = (auth.sessionClaims ?? {}) as SessionClaims;
  const email = getClaimString(claims, "email");
  if (!email) {
    throw new AuthError(
      401,
      "UNAUTHENTICATED",
      "The authenticated account does not have a usable email address.",
    );
  }

  const displayName = getDisplayName(claims, email);
  const now = new Date();
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    const [inserted] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        displayName,
        role: "USER",
        status: "ACTIVE",
        lastLoginAt: now,
      })
      .onConflictDoNothing({ target: usersTable.clerkUserId })
      .returning();

    user = inserted;
    if (!user) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, clerkUserId))
        .limit(1);
    }
  } else {
    [user] = await db
      .update(usersTable)
      .set({
        email,
        displayName,
        updatedAt: now,
        lastLoginAt: now,
      })
      .where(eq(usersTable.id, user.id))
      .returning();
  }

  if (!user) {
    throw new Error("Authenticated user could not be provisioned.");
  }

  return user;
}

export async function requireAuthenticatedUser(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Capture Clerk's verified identity once, before any asynchronous DB work.
    const auth = getAuth(request);
    const clerkUserId = auth.userId;
    const sessionId = auth.sessionId ?? null;
    const user = await resolveVerifiedUser(auth);
    if (user.status !== "ACTIVE") {
      sendAuthError(
        response,
        new AuthError(403, "ACCOUNT_DISABLED", "This account is disabled."),
      );
      return;
    }
    request.dbUser = user;
    request.verifiedAuth = Object.freeze({
      userId: user.id,
      clerkUserId: clerkUserId!,
      sessionId,
    });
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      sendAuthError(response, error);
      return;
    }
    request.log.error({ err: error }, "Failed to resolve authenticated user");
    response.status(500).json({
      error: {
        code: "AUTHENTICATION_ERROR",
        message: "Authentication could not be completed.",
      },
    });
  }
}

export function requireAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.dbUser) {
    sendAuthError(
      response,
      new AuthError(401, "UNAUTHENTICATED", "Authentication is required."),
    );
    return;
  }
  if (request.dbUser.role !== "ADMIN") {
    sendAuthError(
      response,
      new AuthError(403, "FORBIDDEN", "Administrator access is required."),
    );
    return;
  }
  next();
}

export function toSafeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}