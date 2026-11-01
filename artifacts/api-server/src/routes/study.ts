import express, { Router } from "express";
import { z } from "zod/v4";
import { requireAuthenticatedUser } from "../middlewares/auth";
import { LessonError } from "../lib/lessons";
import {
  lessonStudy,
  createAnnotation,
  changeAnnotation,
  saveProgress,
  studyWorkspace,
  studyProgress,
} from "../lib/study";
import * as contract from "../lib/study-validation";
const router = Router();
router.use(
  "/study",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  },
  requireAuthenticatedUser,
  (req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (!req.verifiedAuth || req.headers["x-study-session"] !== req.verifiedAuth.sessionId)
    ) {
      res
        .status(409)
        .json({
          error: {
            code: "STUDY_SESSION_CHANGED",
            message: "The study session changed. Reload before saving.",
          },
        });
      return;
    }
    next();
  },
  express.json({ limit: "100kb" }),
);
function handle(
  action: (req: import("express").Request) => Promise<unknown>,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
) {
  return async (req: import("express").Request, res: import("express").Response) => {
    try {
      const result = schema.safeParse(await action(req));
      if (!result.success)
        throw new LessonError(
          500,
          "STUDY_RESPONSE_INVALID",
          "Study response did not match its contract. Do not assume a save succeeded.",
        );
      res.json(result.data);
    } catch (error) {
      if (error instanceof LessonError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: { code: "STUDY_VALIDATION", message: "Review the study item fields." } });
        return;
      }
      const code =
        (error as { code?: string; cause?: { code?: string } })?.code ??
        (error as { cause?: { code?: string } })?.cause?.code;
      res
        .status(code === "23505" || code === "40001" || code === "40P01" ? 409 : 500)
        .json({
          error: {
            code: code === "23505" ? "STUDY_DUPLICATE" : "STUDY_OPERATION_FAILED",
            message:
              code === "23505"
                ? "This bookmark already exists."
                : "Study operation failed. Reload before retrying; no successful save is assumed.",
          },
        });
    }
  };
}
router.get(
  "/study/lessons/:id",
  handle(
    (req) => lessonStudy(req.dbUser!.id, contract.studyId.parse(req.params.id)),
    contract.studyLessonResult,
  ),
);
router.get(
  "/study/workspace",
  handle(
    (req) => studyWorkspace(req.dbUser!.id, contract.workspaceQuery.parse(req.query)),
    contract.workspaceResult,
  ),
);
router.get(
  "/study/progress",
  handle(
    (req) => studyProgress(req.dbUser!.id, contract.workspaceQuery.parse(req.query)),
    contract.progressOverview,
  ),
);
router.post(
  "/study/annotations",
  handle(
    (req) => createAnnotation(req.dbUser!.id, contract.annotationInput.parse(req.body)),
    contract.annotationResult,
  ),
);
router.patch(
  "/study/annotations/:id",
  handle(
    (req) =>
      changeAnnotation(
        req.dbUser!.id,
        contract.studyId.parse(req.params.id),
        contract.annotationPatch.parse(req.body),
      ),
    contract.annotationResult,
  ),
);
router.delete(
  "/study/annotations/:id",
  handle(
    (req) =>
      changeAnnotation(
        req.dbUser!.id,
        contract.studyId.parse(req.params.id),
        contract.annotationDelete.parse(req.body),
        true,
      ),
    contract.mutationResult,
  ),
);
router.put(
  "/study/progress",
  handle(
    (req) => saveProgress(req.dbUser!.id, contract.progressInput.parse(req.body)),
    contract.progressResult,
  ),
);
router.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    const type = (error as { type?: string })?.type;
    if (type === "entity.too.large" || type === "entity.parse.failed") {
      res
        .status(type === "entity.too.large" ? 413 : 400)
        .json({
          error: {
            code: "STUDY_BODY_INVALID",
            message: "Send a bounded valid JSON study request.",
          },
        });
      return;
    }
    next(error);
  },
);
export default router;
