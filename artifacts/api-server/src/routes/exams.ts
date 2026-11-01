import { Router } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth";
import {
  ExamError,
  examAvailability,
  examStart,
  examSession,
  examSave,
  examSubmit,
  examHistory,
} from "../lib/exams";
const router = Router();
router.use("/exams", requireAuthenticatedUser, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
function handle(fn: (req: any) => Promise<unknown>) {
  return async (req: any, res: any) => {
    if (!req.dbUser || !req.verifiedAuth?.sessionId) {
      res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access exams." } });
      return;
    }
    if (req.method !== "GET" && req.headers["x-practice-session"] !== req.verifiedAuth.sessionId) {
      res.status(409).json({
        error: {
          code: "SESSION_CHANGED",
          message: "Your sign-in changed. Reload before continuing.",
        },
      });
      return;
    }
    if (
      [req.params.id, req.params.delivery].some(
        (id) => id && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
      )
    ) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Exam not found." } });
      return;
    }
    try {
      res.json(await fn(req));
    } catch (e) {
      if (e instanceof ExamError) {
        res.status(e.status).json({ error: { code: e.code, message: e.message } });
        return;
      }
      const code = (e as any)?.code ?? (e as any)?.cause?.code;
      req.log?.error(
        {
          code:
            typeof code === "string" && /^[A-Z0-9_]{3,40}$/.test(code)
              ? code
              : "EXAM_OPERATION_FAILED",
        },
        "Exam operation failed",
      );
      res
        .status(
          code === "42501"
            ? 503
            : code === "23514" || code === "55P03" || code === "40P01"
              ? 409
              : 500,
        )
        .json({
          error: {
            code: code === "42501" ? "FEATURE_NOT_READY" : "EXAM_OPERATION_FAILED",
            message:
              "Exam operation did not complete. Refresh before retrying; no success is assumed.",
          },
        });
    }
  };
}
router.get(
  "/exams/availability",
  handle((req) =>
    examAvailability({
      domainIds: queryIds(req.query.domainIds),
      chapterIds: queryIds(req.query.chapterIds),
    }),
  ),
);
function queryIds(value: unknown) {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string")
    throw new ExamError(
      400,
      "VALIDATION_ERROR",
      "Use comma-separated domain or chapter identifiers.",
    );
  return value.split(",");
}
router.get(
  "/exams",
  handle((req) => examHistory(req.query, req.dbUser.id)),
);
router.post(
  "/exams",
  handle((req) => examStart(req.body, req.dbUser.id, req.verifiedAuth.sessionId)),
);
router.get(
  "/exams/:id",
  handle((req) => examSession(req.params.id, req.dbUser.id)),
);
router.patch(
  "/exams/:id/items/:delivery",
  handle((req) => examSave(req.params.id, req.params.delivery, req.body, req.dbUser.id)),
);
router.post(
  "/exams/:id/submit",
  handle((req) => examSubmit(req.params.id, req.dbUser.id)),
);
router.get(
  "/exams/:id/result",
  handle(async (req) => {
    const s = await examSession(req.params.id, req.dbUser.id);
    if (s.status === "ACTIVE")
      throw new ExamError(409, "EXAM_CLOSED", "Submit the exam before reviewing answers.");
    return s;
  }),
);
export default router;
