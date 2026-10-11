import type { NextFunction, Request, Response } from "express";

// Intent consistency only. Clerk authentication and DB ADMIN authorization
// must have run first; this header never authenticates or authorizes a caller.
export function requireAdminMutationSession(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) { next(); return; }
  res.setHeader("Cache-Control", "no-store");
  if (!req.verifiedAuth || req.verifiedAuth.userId !== req.dbUser?.id) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    return;
  }
  const expected = req.headers["x-admin-session"];
  // Preserve existing authenticated clients. The current admin UI always sends
  // this precondition; omission is not protection against a browser intent race.
  if (expected === undefined) { next(); return; }
  if (typeof expected !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(expected)) {
    res.status(400).json({ error: { code: "INVALID_ADMIN_SESSION", message: "Invalid admin session precondition." } });
    return;
  }
  if (expected !== req.verifiedAuth.sessionId) {
    res.status(409).json({ error: { code: "ADMIN_SESSION_CHANGED", message: "The active session changed. Refresh before retrying." } });
    return;
  }
  next();
}
