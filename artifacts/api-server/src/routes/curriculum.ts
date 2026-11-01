import { Router, type IRouter } from "express";
import { requireAuthenticatedUser, requireAdmin } from "../middlewares/auth";
import { curriculumSummary, curriculumMappingReport } from "../lib/curriculum";
const router: IRouter = Router();
router.use(
  ["/curriculum", "/admin/curriculum/mapping"],
  (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  },
  requireAuthenticatedUser,
);
const handle =
  (read: typeof curriculumSummary | typeof curriculumMappingReport) =>
  async (
    _req: Parameters<typeof requireAuthenticatedUser>[0],
    res: Parameters<typeof requireAuthenticatedUser>[1],
  ) => {
    try {
      res.json(await read());
    } catch {
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Curriculum could not be loaded." } });
    }
  };
router.get("/curriculum", handle(curriculumSummary));
router.get("/admin/curriculum/mapping", requireAdmin, handle(curriculumMappingReport));
export default router;
