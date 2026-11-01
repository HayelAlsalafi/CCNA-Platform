import { saveChapter } from "../lib/canonical-chapters";
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod/v4';
import { requireAuthenticatedUser, requireAdmin } from '../middlewares/auth';
import { requireAdminMutationSession } from '../middlewares/admin-mutation';
import { AdminContentError, importHeaders, parse, uuid } from '../lib/admin-content-validation';
import {
  taxonomyCatalog,
  saveTaxonomy,
  questionAssignments,
  replaceQuestionAssignments,
} from '../lib/taxonomy-admin';
import { previewQuestionImport, confirmQuestionImport } from '../lib/question-import';
import { xlsxTemplate } from '../lib/question-import-files';
const router = Router();
for (const path of ['/admin/taxonomy', '/admin/question-import'])
  router.use(
    path,
    requireAuthenticatedUser,
    requireAdmin,
    requireAdminMutationSession,
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
// The global body parser skips just these upload/confirmation endpoints; parse
// their bounded bodies only after authentication, role and session checks.
router.use('/admin/question-import', express.json({ limit: '3mb' }));
function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof AdminContentError) {
        res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message, details: error.details } });
        return;
      }
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the taxonomy bindings.',
              details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            },
          });
        return;
      }
      const pg = error as { cause?: { code?: string }; code?: string };
      const code = pg.cause?.code ?? pg.code;
      if (['23503', '23505', '23001', '23514'].includes(code ?? '')) {
        res
          .status(409)
          .json({
            error: {
              code: 'CONSTRAINT_CONFLICT',
              message:
                'A duplicate or referenced taxonomy binding prevents this change. Refresh and review the records.',
            },
          });
        return;
      }
      req.log.error({ err: error }, 'Admin content operation failed');
      res
        .status(500)
        .json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Operation failed. Transactional writes were rolled back.',
          },
        });
    }
  };
}
router.get(
  '/admin/taxonomy',
  handle(() => taxonomyCatalog()),
);
router.post('/admin/taxonomy/chapters',handle(req=>saveChapter(req.body)));
router.put('/admin/taxonomy/chapters/:id',handle(req=>saveChapter(req.body,parse(uuid,req.params.id))));
for (const kind of ['blueprints', 'domains', 'objectives'] as const) {
  router.post(
    `/admin/taxonomy/${kind}`,
    handle((req) => saveTaxonomy(kind, req.body)),
  );
  router.put(
    `/admin/taxonomy/${kind}/:id`,
    handle((req) => saveTaxonomy(kind, req.body, parse(uuid, req.params.id))),
  );
}
router.get(
  '/admin/taxonomy/questions/:id/objectives',
  handle((req) => questionAssignments(parse(uuid, req.params.id))),
);
router.put(
  '/admin/taxonomy/questions/:id/objectives',
  handle((req) => replaceQuestionAssignments(parse(uuid, req.params.id), req.body)),
);
router.get('/admin/question-import/template.csv', (_req, res) => {
  res
    .type('text/csv')
    .attachment('ccna-questions.csv')
    .send('\uFEFF' + importHeaders.join(',') + '\r\n');
});
router.get('/admin/question-import/template.xlsx', (_req, res) => {
  res
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment('ccna-questions.xlsx')
    .send(xlsxTemplate());
});
function identity(req: Request) {
  return `${req.dbUser!.id}:${req.verifiedAuth!.sessionId ?? ''}`;
}
router.post(
  '/admin/question-import/preview',
  handle((req) => previewQuestionImport(req.body, identity(req))),
);
router.post(
  '/admin/question-import/confirm',
  handle((req) => confirmQuestionImport(req.body, identity(req))),
);
router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 413) {
    res
      .status(status)
      .json({
        error: {
          code: 'INVALID_UPLOAD',
          message:
            status === 413
              ? 'Upload exceeds the request size limit.'
              : 'Upload valid JSON using the file preview form.',
        },
      });
    return;
  }
  next(error);
});
export default router;
