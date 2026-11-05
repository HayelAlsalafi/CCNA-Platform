import type { RequestHandler } from "express";
import { contentAccessRequested } from "../lib/content-access";

/** Activation barrier, not a partially enforced paid-content feature.
 * Existing alternate reads, timed-session leases and deletion dependencies still
 * require review. A flag alone must never claim they are protected.
 */
export const requireContentAccessReadiness: RequestHandler = (_req, res, next) => {
  if (!contentAccessRequested()) { next(); return; }
  res.set("Cache-Control", "private, no-store");
  res.status(503).json({ error: { code: "CONTENT_ACCESS_NOT_READY", message: "Content access activation is not prepared." } });
};
