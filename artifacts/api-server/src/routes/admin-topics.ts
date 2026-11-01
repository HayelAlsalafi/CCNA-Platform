import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin, requireAuthenticatedUser } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
import { deleteAdminRecords, AdminDeleteError } from "../lib/admin-delete";
import {
  listManagedTopics,
  topicMetadata,
  suggestTopicSlug,
  createManagedTopic,
  updateManagedTopic,
  topicDetails,
  previewTopicDependencies,
  bulkTopicStatus,
} from "../lib/topics-management";
import {
  createTopic,
  disableTopic,
  listAllTopics,
  toAdminTopic,
  TopicError,
  updateTopic,
} from "../lib/topics-admin";

const router: IRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every admin topic route is ADMIN-only, enforced server-side.
router.use("/admin/topics", requireAuthenticatedUser, requireAdmin, requireAdminMutationSession);

function handle(fn: (req: Request) => Promise<{ status?: number; body: unknown }>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { status = 200, body } = await fn(req);
      res.status(status).json(body);
    } catch (e) {
      if (e instanceof AdminDeleteError) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: e.message } });
        return;
      }
      if (e instanceof TopicError) {
        res.status(e.status).json({
          error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
        });
        return;
      }
      req.log.error({ err: e }, "Admin topic operation failed");
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Topic operation failed." } });
    }
  };
}

function idParam(req: Request): string {
  const id = String(req.params["id"] ?? "");
  if (!UUID.test(id)) throw new TopicError(404, "NOT_FOUND", "Topic not found.");
  return id;
}

router.get(
  "/admin/topics/delete-policy",
  handle(async () => ({ body: { mode: "permanent-only-v1" } })),
);
router.get(
  "/admin/topics/manage",
  handle(async (req) => ({ body: await listManagedTopics(req.query) })),
);
router.get(
  "/admin/topics/manage/metadata",
  handle(async () => ({ body: await topicMetadata() })),
);
router.get(
  "/admin/topics/manage/slug-suggestion",
  handle(async (req) => ({ body: await suggestTopicSlug(req.query.name) })),
);
router.post(
  "/admin/topics/manage",
  handle(async (req) => ({ status: 201, body: toAdminTopic(await createManagedTopic(req.body)) })),
);
router.post(
  "/admin/topics/manage/deletion-preview",
  handle(async (req) => ({ body: await previewTopicDependencies(req.body) })),
);
router.post(
  "/admin/topics/manage/bulk-status",
  handle(async (req) => ({ body: await bulkTopicStatus(req.body) })),
);
router.get(
  "/admin/topics/manage/:id",
  handle(async (req) => ({ body: await topicDetails(idParam(req), req.query.questionPage) })),
);
router.patch(
  "/admin/topics/manage/:id",
  handle(async (req) => ({ body: toAdminTopic(await updateManagedTopic(idParam(req), req.body)) })),
);
router.delete(
  "/admin/topics/:id",
  handle(async (req) => ({ body: await deleteAdminRecords("topics", { ids: [idParam(req)] }) })),
);
router.post(
  "/admin/topics/bulk-delete",
  handle(async (req) => ({ body: await deleteAdminRecords("topics", req.body) })),
);

router.get(
  "/admin/topics",
  handle(async () => ({ body: (await listAllTopics()).map(toAdminTopic) })),
);
router.post(
  "/admin/topics",
  handle(async (req) => ({ status: 201, body: toAdminTopic(await createTopic(req.body)) })),
);
router.patch(
  "/admin/topics/:id",
  handle(async (req) => ({ body: toAdminTopic(await updateTopic(idParam(req), req.body)) })),
);
router.post(
  "/admin/topics/:id/disable",
  handle(async (req) => ({ body: toAdminTopic(await disableTopic(idParam(req))) })),
);

export default router;
