import express, { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { requireAuthenticatedUser, requireAdmin } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
import {deleteDraftLesson,lessonDeleteResult} from '../lib/lesson-delete';
import {
  LessonError,
  adminLessonList,
  adminLessonLibrary,
  adminLessonGet,
  createLesson,
  updateLesson,
  publishLesson,
  lessonRevisions,
  reorderLessons,
  chapterLessonList,
  publishedLesson,
} from "../lib/lessons";
import {
  lessonInputSchema,
  lessonUpdateSchema,
  lessonVersionSchema,
  lessonReorderSchema,
  lessonLibraryQuerySchema,
  lessonIssueDetails,
} from "../lib/lesson-validation";
import {
  GetChapterLessonsResponse,
  GetPublishedLessonResponse,
  GetAdminLessonsResponse,
  GetAdminLessonResponse,
  CreateLessonResponse,
  UpdateLessonResponse,
  PublishLessonResponse,
  UnpublishLessonResponse,
  ReorderLessonsResponse,
  GetLessonRevisionsResponse,
} from "@workspace/api-zod";
const router = Router();
router.use(
  ["/lessons", "/chapters/:chapterId/lessons", "/admin/lessons"],
  (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Lesson-Api-Contract", "discovery-library-v2");
    next();
  },
  requireAuthenticatedUser,
);
router.use(
  "/admin/lessons",
  requireAdmin,
  requireAdminMutationSession,
  express.json({ limit: "600kb" }),
);
const uuid = z.string().uuid();
function handle(
  action: (request: Request) => Promise<unknown>,
  validator: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: unknown;
      error?: { issues: readonly { path: readonly PropertyKey[]; code: string }[] };
    };
  },
) {
  return async (req: Request, res: Response) => {
    try {
      const result = validator.safeParse(await action(req));
      if (!result.success)
        throw new LessonError(
          500,
          "LESSON_RESPONSE_INVALID",
          "The API returned invalid lesson metadata. Check that the API is running the latest lesson code; an administrator can inspect the diagnostic fields. Do not assume a save succeeded if its response was invalid.",
          lessonIssueDetails(result.error?.issues ?? []),
        );
      res.json(result.data);
    } catch (error) {
      if (error instanceof LessonError) {
        res
          .status(error.status)
          .json({
            error: {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
          });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              req.method === "GET"
                ? "The lesson request has invalid filters or an invalid identifier. Check the diagnostic fields; an outdated API may not recognize this endpoint."
                : "Review the lesson fields.",
            details: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.path.at(-1)==="level" ? "Heading level must be H1 through H6. If H1 was selected, ensure the running API has loaded the current lesson contract." : issue.path.at(-1)==="text" && issue.code==="too_big" ? "This content exceeds its field limit. Headings support up to 200 characters; keep longer explanations in text blocks." : issue.message,
            })),
          },
        });
        return;
      }
      const pg = error as { code?: string; cause?: { code?: string } };
      if (
        ["23503", "23505", "23514", "23001", "40001", "40P01"].includes(
          pg.code ?? pg.cause?.code ?? "",
        )
      ) {
        res.status(409).json({
          error: {
            code: "LESSON_CONFLICT",
            message: "A related record or concurrent edit changed. Reload before trying again.",
          },
        });
        return;
      }
      req.log?.error(
        { code: "LESSON_OPERATION_FAILED" },
        "Lesson operation failed; raw content and credentials withheld.",
      );
      res.status(500).json({
        error: {
          code: "LESSON_OPERATION_FAILED",
          message:
            "Lesson operation failed. No successful write is assumed; reload before retrying.",
        },
      });
    }
  };
}
router.get(
  "/chapters/:chapterId/lessons",
  handle((req) => chapterLessonList(uuid.parse(req.params.chapterId)), GetChapterLessonsResponse),
);
router.get(
  "/lessons/:id",
  handle((req) => publishedLesson(uuid.parse(req.params.id)), GetPublishedLessonResponse),
);
router.get(
  "/admin/lessons",
  handle(
    (req) =>
      adminLessonList(z.object({ chapterId: uuid.optional() }).strict().parse(req.query).chapterId),
    GetAdminLessonsResponse,
  ),
);
router.get(
  "/admin/lessons/library",
  handle(
    (req) => adminLessonLibrary(lessonLibraryQuerySchema.parse(req.query)),
    z.object({
      items: z.array(
        z.object({
          id: uuid,
          chapterId: uuid,
          title: z.string(),
          description: z.string(),
          estimatedMinutes: z.number().int(),
          displayOrder: z.number().int(),
          version: z.number().int(),
          status: z.enum(["DRAFT", "PUBLISHED"]),
          publishedRevisionId: uuid.nullable(),
          createdAt: z.string(),
          updatedAt: z.string(),
          publishedRevisionNumber: z.number().int().nullable(),
          domainId: uuid,
          domainName: z.string(),
          chapterTitle: z.string(),
          volume: z.enum(["V1", "V2"]),
          chapterNumber: z.number().int(),
        }),
      ),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      summary: z.object({
        total: z.number().int(),
        published: z.number().int(),
        drafts: z.number().int(),
        chapters: z.number().int(),
      }),
    }),
  ),
);
router.get(
  "/admin/lessons/:id/revisions",
  handle((req) => lessonRevisions(uuid.parse(req.params.id)), GetLessonRevisionsResponse),
);
router.get(
  "/admin/lessons/:id",
  handle((req) => adminLessonGet(uuid.parse(req.params.id)), GetAdminLessonResponse),
);
router.delete('/admin/lessons/:id',handle(req=>deleteDraftLesson(uuid.parse(req.params.id),req.body,req.dbUser!.id),lessonDeleteResult));
router.post(
  "/admin/lessons/reorder",
  handle(
    (req) => reorderLessons(lessonReorderSchema.parse(req.body), req.dbUser!.id),
    ReorderLessonsResponse,
  ),
);
router.post(
  "/admin/lessons",
  handle(
    (req) => createLesson(lessonInputSchema.parse(req.body), req.dbUser!.id),
    CreateLessonResponse,
  ),
);
router.put(
  "/admin/lessons/:id",
  handle((req) => {
    const { version, ...input } = lessonUpdateSchema.parse(req.body);
    return updateLesson(uuid.parse(req.params.id), input, version, req.dbUser!.id);
  }, UpdateLessonResponse),
);
for (const action of ["publish", "unpublish"] as const)
  router.post(
    `/admin/lessons/:id/${action}`,
    handle(
      (req) =>
        publishLesson(
          uuid.parse(req.params.id),
          lessonVersionSchema.parse(req.body).version,
          req.dbUser!.id,
          action === "publish",
        ),
      action === "publish" ? PublishLessonResponse : UnpublishLessonResponse,
    ),
  );
export default router;
