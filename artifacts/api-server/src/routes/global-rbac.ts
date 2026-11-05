import { Router, type Request, type Response } from "express";
import { requireAuthenticatedUser } from "../middlewares/auth";
import { requireAdminMutationSession } from "../middlewares/admin-mutation";
import { globalRbac } from "../lib/global-rbac";
import { RbacError } from "../lib/global-rbac-policy";

const router = Router();
router.use('/admin/rbac', requireAuthenticatedUser, requireAdminMutationSession, (_req, res, next) => {
  res.set('Cache-Control', 'no-store'); next();
});
function handle(fn: (actor: string, req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    if (!req.dbUser || !req.verifiedAuth?.sessionId || req.verifiedAuth.userId !== req.dbUser.id) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Verified identity and session are required.' } }); return;
    }
    if (req.method === 'POST' && req.headers['x-admin-session'] !== req.verifiedAuth.sessionId) {
      res.status(409).json({ error: { code: 'ADMIN_SESSION_CHANGED', message: 'Reload before changing roles.' } }); return;
    }
    try { res.json(await fn(req.dbUser.id, req)); }
    catch (error) {
      if (error instanceof RbacError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
      const state = (error as { code?: string })?.code;
      const status = state === '42501' ? 403 : ['40001','40P01','55P03','23505','23514'].includes(state ?? '') ? 409 : state === '22023' ? 400 : 503;
      res.status(status).json({ error: { code: status === 403 ? 'RBAC_FORBIDDEN' : status === 409 ? 'RBAC_CONFLICT' : status === 400 ? 'RBAC_VALIDATION' : 'RBAC_NOT_READY',
        message: status === 409 ? 'Role change blocked: stale version, protected last Owner, or concurrent change. Reload; no success is assumed.' :
          status === 403 ? 'Your explicit GLOBAL assignment does not authorize this operation.' : 'Role management is unavailable or the request is invalid.' } });
    }
  };
}
router.get('/admin/rbac/me', handle(actor => globalRbac.me(actor)));
router.get('/admin/rbac/users', handle((actor, req) => globalRbac.list(actor, 'users', req.query)));
router.get('/admin/rbac/audit', handle((actor, req) => globalRbac.list(actor, 'audit', req.query)));
router.post('/admin/rbac/assignments', handle((actor, req) => globalRbac.change(actor, req.body)));
export default router;
