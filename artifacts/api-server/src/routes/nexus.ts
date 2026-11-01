import { Router } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth";
import {
  NexusError,
  nexusAnalytics,
  nexusAvailability,
  nexusStartSession,
  nexusSession,
  nexusSessionHistory,
  nexusSaveSelection,
  nexusFinish,
  nexusLearnAnswer,
  nexusSubmitDeliveries,
} from "../lib/nexus";
import { PracticeApiError } from "../lib/practice";
import { parseCommandCenterQuery } from "../lib/command-center";
import {
  LearningEvidenceError,
  yearlyActivity,
  learnerProgress,
  awardAchievements,
} from "../lib/learning-evidence";
const router = Router();
router.use("/nexus", requireAuthenticatedUser, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
function handle(fn: (req: any) => Promise<unknown>) {
  return async (req: any, res: any) => {
    if (!req.dbUser || !req.verifiedAuth?.sessionId) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Sign in to access your learning workspace." },
      });
      return;
    }
    const expected = req.headers["x-practice-session"];
    if (req.method !== "GET" && expected !== req.verifiedAuth.sessionId) {
      res.status(409).json({
        error: {
          code: "SESSION_CHANGED",
          message: "Your sign-in changed. Reload before continuing.",
        },
      });
      return;
    }
    if (
      req.params.id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
    ) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Session not found." } });
      return;
    }
    try {
      const result = await fn(req);
      const validatedSubmission =
        req.method === "POST" &&
        result &&
        ((req.path.endsWith("/finish") && (result as any).status === "COMPLETED") ||
          (req.path.endsWith("/submissions") && (result as any).status === "COMPLETED") ||
          (req.path.endsWith("/answer") && typeof (result as any).isCorrect === "boolean"));
      if (validatedSubmission) {
        try {
          await awardAchievements(
            { timezone: String(req.headers["x-learner-timezone"] || "UTC") },
            req.dbUser.id,
          );
        } catch {
          req.log.error(
            { code: "ACHIEVEMENT_PROCESSING_UNAVAILABLE" },
            "Learning result saved; achievement processing can be retried.",
          );
        }
      }
      res.json(result);
    } catch (e) {
      if (
        e instanceof NexusError ||
        e instanceof PracticeApiError ||
        e instanceof LearningEvidenceError
      ) {
        if (e.status >= 500) req.log.error({ code: e.code }, "Nexus operation rejected");
        res.status(e.status).json({ error: { code: e.code, message: e.message } });
        return;
      }
      req.log.error({ code: "NEXUS_OPERATION_FAILED" }, "Nexus operation failed");
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Operation failed. No result is assumed; refresh before retrying.",
        },
      });
    }
  };
}
router.get(
  "/nexus/activity",
  handle((req) => yearlyActivity(req.query, req.dbUser.id)),
);
router.get(
  "/nexus/progress",
  handle((req) => learnerProgress(req.query, req.dbUser.id)),
);
router.post(
  "/nexus/achievements/evaluate",
  handle((req) => awardAchievements(req.body, req.dbUser.id)),
);
router.get(
  "/nexus/analytics",
  handle((req) => {
    try { parseCommandCenterQuery(req.query); }
    catch { throw new NexusError(400, "VALIDATION_ERROR", "Provide only a supported range and IANA timezone."); }
    return nexusAnalytics(req.dbUser.id, req.verifiedAuth.sessionId, req.query.range, undefined, req.query.timezone);
  }),
);
router.get(
  "/nexus/availability",
  handle((req) => nexusAvailability(req.query, req.dbUser.id)),
);
router.get(
  "/nexus/sessions",
  handle((req) => nexusSessionHistory(req.dbUser.id, req.query)),
);
router.post(
  "/nexus/submissions",
  handle((req) => nexusSubmitDeliveries(req.body, req.dbUser.id, req.verifiedAuth.sessionId)),
);
router.post(
  "/nexus/sessions",
  handle((req) => nexusStartSession(req.body, req.dbUser.id, req.verifiedAuth.sessionId)),
);
router.get(
  "/nexus/sessions/:id",
  handle((req) => nexusSession(req.params.id, req.dbUser.id, req.verifiedAuth.sessionId)),
);
router.patch(
  "/nexus/sessions/:id/selection",
  handle((req) =>
    nexusSaveSelection(req.params.id, req.body, req.dbUser.id, req.verifiedAuth.sessionId),
  ),
);
router.post(
  "/nexus/sessions/:id/answer",
  handle((req) =>
    nexusLearnAnswer(
      req.params.id,
      req.body?.questionId,
      req.dbUser.id,
      req.verifiedAuth.sessionId,
    ),
  ),
);
router.post(
  "/nexus/sessions/:id/finish",
  handle((req) => nexusFinish(req.params.id, req.dbUser.id, req.verifiedAuth.sessionId)),
);
router.post(
  "/nexus/sessions/:id/abandon",
  handle((req) => nexusFinish(req.params.id, req.dbUser.id, req.verifiedAuth.sessionId, true)),
);
export default router;
