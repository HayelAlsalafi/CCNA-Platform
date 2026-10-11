import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin, requireAuthenticatedUser } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
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
      if (error instanceof AdminQuestionError) {
        res.status(error.status).json({
          error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
        });
        return;
      }
      req.log.error({ err: error }, "Admin question operation failed");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Question operation failed." } });
    }
  };
}

function idParam(req: Request): string {
  const id = String(req.params["id"] ?? "");
  if (!UUID.test(id)) throw new AdminQuestionError(404, "NOT_FOUND", "Question not found.");
  return id;
}

router.get(
  "/admin/questions",
  handle(async (req) => ({ body: await listAdminQuestions(parseAdminQuestionListQuery(req.query)) })),
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
