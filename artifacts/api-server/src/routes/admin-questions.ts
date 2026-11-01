import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin, requireAuthenticatedUser } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
import { AdminDeleteError } from "../lib/admin-delete";
import { previewHistoryDeletion, confirmHistoryDeletion, deleteQuestionsOrdinary } from "../lib/admin-history-delete";
import { AdminContentError } from "../lib/admin-content-validation";
import {
  listStudioQuestions,
  studioLookup,
  studioReadiness,
  studioQuestionDetails,
  saveStudioQuestion,
  studioDuplicates,
  bulkStudioQuestions,
  studioDeletePreview,
} from "../lib/question-studio";
import {
  AdminQuestionError,
  createAdminQuestion,
  disableAdminQuestion,
  listAdminQuestions,
  parseAdminQuestionListQuery,
  updateAdminQuestion,
} from "../lib/questions-admin";

const router: IRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use("/admin/questions", requireAuthenticatedUser, requireAdmin, requireAdminMutationSession);

function handle(fn: (req: Request) => Promise<{ status?: number; body: unknown }>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { status = 200, body } = await fn(req);
      res.status(status).json(body);
    } catch (error) {
      if (error instanceof AdminContentError) {
        res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message, details: error.details } });
        return;
      }
      if (error instanceof AdminDeleteError) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: error.message } });
        return;
      }
      if (error instanceof AdminQuestionError) {
        res.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        });
        return;
      }
      req.log.error({ err: error }, "Admin question operation failed");
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Question operation failed." } });
    }
  };
}

function idParam(req: Request): string {
  const id = String(req.params["id"] ?? "");
  if (!UUID.test(id)) throw new AdminQuestionError(404, "NOT_FOUND", "Question not found.");
  return id;
}
function historyIdentity(req: Request) {
  const sessionId = req.verifiedAuth?.sessionId;
  if (!sessionId || !req.dbUser?.id)
    throw new AdminDeleteError("A verified active Admin session is required for history deletion.");
  return { actorId: req.dbUser.id, sessionId };
}

router.get(
  "/admin/questions/delete-policy",
  handle(async () => ({ body: { mode: "permanent-only-v2" } })),
);
router.get(
  "/admin/questions/studio",
  handle(async (req) => ({ body: await listStudioQuestions(req.query) })),
);
router.get(
  "/admin/questions/studio/lookup",
  handle(async (req) => ({ body: await studioLookup(req.query) })),
);
router.post("/admin/questions/studio/readiness", handle(async req=>({body:await studioReadiness(req.body)})));
router.post(
  "/admin/questions/studio/duplicates",
  handle(async (req) => ({ body: await studioDuplicates(req.body) })),
);
router.post(
  "/admin/questions/studio/deletion-preview",
  handle(async (req) => ({ body: await studioDeletePreview(req.body) })),
);
router.post(
  "/admin/questions/studio/bulk",
  handle(async (req) => ({ body: await bulkStudioQuestions(req.body) })),
);
router.get(
  "/admin/questions/studio/:id",
  handle(async (req) => ({
    body: await studioQuestionDetails(idParam(req), req.query.revisionPage),
  })),
);
router.post(
  "/admin/questions/studio",
  handle(async (req) => ({ status: 201, body: await saveStudioQuestion(req.body) })),
);
router.patch(
  "/admin/questions/studio/:id",
  handle(async (req) => ({ body: await saveStudioQuestion(req.body, idParam(req)) })),
);
router.post(
  "/admin/questions/history-delete/preview",
  handle(async (req) => ({ body: await previewHistoryDeletion(req.body, historyIdentity(req)) })),
);
router.post(
  "/admin/questions/history-delete/confirm",
  handle(async (req) => ({ body: await confirmHistoryDeletion(req.body, historyIdentity(req)) })),
);
router.delete(
  "/admin/questions/:id",
  handle(async (req) => ({ body: await deleteQuestionsOrdinary({ ids: [idParam(req)] }, historyIdentity(req)) })),
);
router.post(
  "/admin/questions/bulk-delete",
  handle(async (req) => ({ body: await deleteQuestionsOrdinary(req.body, historyIdentity(req)) })),
);

router.get(
  "/admin/questions",
  handle(async (req) => ({
    body: await listAdminQuestions(parseAdminQuestionListQuery(req.query)),
  })),
);
router.post(
  "/admin/questions",
  handle(async (req) => ({ status: 201, body: await createAdminQuestion(req.body) })),
);
router.patch(
  "/admin/questions/:id",
  handle(async (req) => ({ body: await updateAdminQuestion(idParam(req), req.body) })),
);
router.post(
  "/admin/questions/:id/disable",
  handle(async (req) => ({ body: await disableAdminQuestion(idParam(req)) })),
);

export default router;
