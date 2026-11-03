import express, { Router } from "express";
import { z } from "zod/v4";
import { requireAuthenticatedUser, requireAdmin } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
import { uploadLessonMedia, readLessonMedia, mediaLimit } from "../lib/lesson-media";
import { LessonError } from "../lib/lessons";
import { mediaResult } from "../lib/study-validation";
import { createLibraryMedia, listLibraryMedia, deriveLibraryMedia } from "../lib/lesson-media-library";
import {mediaReadFailure} from '../lib/lesson-media-errors';
const router = Router();
const mediaFailure=(error:unknown)=> error instanceof LessonError ? error : error instanceof z.ZodError ? new LessonError(400,"MEDIA_VALIDATION","Review the image file, crop and media fields.") : new LessonError(500,"MEDIA_OPERATION_FAILED","Media operation failed. No successful upload or insertion is assumed.");
router.use(
  ["/lesson-media", "/admin/lesson-media"],
  (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  },
  requireAuthenticatedUser,
);
router.post(
  "/admin/lesson-media",
  requireAdmin,
  requireAdminMutationSession,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: mediaLimit }),
  (req, res) => {
    void (async () => {
      try {
        if (!Buffer.isBuffer(req.body))
          throw new LessonError(400, "MEDIA_TYPE", "Send PNG, JPEG or WebP image bytes.");
        res.json(
          mediaResult.parse(
            req.query.library === "1" ? await createLibraryMedia(req.dbUser!.id,req.body,req.get("content-type")??"",JSON.parse(decodeURIComponent((req.get("X-Lesson-Media-Edit")??"%7B%7D").slice(0,16000)))) : await uploadLessonMedia(req.dbUser!.id, req.body, req.get("content-type") ?? ""),
          ),
        );
      } catch (error) {
        const e = mediaFailure(error);
        res.status(e.status).json({ error: { code: e.code, message: e.message } });
      }
    })();
  },
);
router.get("/admin/lesson-media/library",requireAdmin,(req,res)=>{
  void listLibraryMedia(req.query).then(result=>res.json(result)).catch(error=>{const e=mediaFailure(error);res.status(e.status).json({error:{code:e.code,message:e.message}});});
});
router.post("/admin/lesson-media/:id/derive",requireAdmin,requireAdminMutationSession,express.json({limit:"16kb"}),(req,res)=>{
  void deriveLibraryMedia(req.dbUser!.id,String(req.params.id),req.body).then(result=>res.json(result)).catch(error=>{const e=mediaFailure(error);res.status(e.status).json({error:{code:e.code,message:e.message}});});
});
router.get("/lesson-media/:id", (req, res) => {
  void (async () => {
    try {
      const { bytes, mime, sha256 } = await readLessonMedia(
        z.string().uuid().parse(req.params.id),
        req.dbUser!.role === "ADMIN",
        undefined,
        req.query.variant === "thumbnail" ? "thumbnail" : "display",
      );
      // Authorization is evaluated before every conditional cache response.
      res.setHeader("Cache-Control","private, no-cache");
      res.vary("Authorization");
      res.vary("Cookie");
      res.setHeader("ETag",`"${sha256}"`);
      if(req.get("If-None-Match")===`"${sha256}"`) {res.status(304).end();return;}
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.send(bytes);
    } catch (error) {
      const e = mediaReadFailure(error);
      res.status(e.status).json({ error: { code: e.code, message: e.message } });
    }
  })();
});
router.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res
        .status(413)
        .json({ error: { code: "MEDIA_SIZE", message: "Choose an image up to 5 MiB." } });
      return;
    }
    next(error);
  },
);
export default router;
