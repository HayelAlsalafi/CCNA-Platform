import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth";
import { CatalogError, courseCatalog } from "../lib/course-catalog";

const router: IRouter = Router();
router.use("/catalog", (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); }, requireAuthenticatedUser);
const handle = (read: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { res.json(await read(req)); }
  catch (error) {
    if (error instanceof CatalogError) res.status(error.status).json({ error: { code: error.code, message: error.message } });
    else res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Course catalog could not be loaded." } });
  }
};
router.get("/catalog/tracks", handle(req => courseCatalog.tracks(req.query)));
router.get("/catalog/tracks/:trackId/courses", handle(req => courseCatalog.courses(req.params.trackId, req.query)));
router.get("/catalog/courses/:courseId/versions", handle(req => courseCatalog.versions(req.params.courseId, req.query)));
router.get("/catalog/courses/:courseId/versions/:versionId", handle(req => courseCatalog.context(req.params.courseId, req.params.versionId)));
export default router;
