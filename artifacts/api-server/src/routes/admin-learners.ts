import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { requireAuthenticatedUser, requireAdmin } from "../middlewares/auth";

export const learnerPage = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const learnerSummarySql = (limit: number, offset: number) => sql`
  SELECT u.id,u.display_name AS "displayName",u.role,u.status,u.last_login_at AS "lastLoginAt",
    (SELECT count(*)::int FROM public.practice_attempts a WHERE a.user_id=u.id) AS "practiceAttempts",
    (SELECT max(a.submitted_at) FROM public.practice_attempts a WHERE a.user_id=u.id) AS "lastPracticeAt",
    (SELECT count(*)::int FROM public.exam_sessions e WHERE e.user_id=u.id) AS "examSessions",
    (SELECT count(*)::int FROM public.exam_sessions e WHERE e.user_id=u.id AND e.status<>'ACTIVE') AS "finishedExams",
    (SELECT max(e.started_at) FROM public.exam_sessions e WHERE e.user_id=u.id) AS "lastExamAt"
  FROM public.users u ORDER BY u.created_at DESC,u.id LIMIT ${limit} OFFSET ${offset}`;
const router=Router();
router.get("/admin/learners",requireAuthenticatedUser,requireAdmin,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const input=learnerPage.safeParse(req.query);
  if(!input.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid learner pagination."}});return;}
  try {
    const data=await db.transaction(async tx=>{
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
      await tx.execute(sql`SET LOCAL statement_timeout='5s'`);
      const privileges=(await tx.execute<{allowed:boolean}>(sql`SELECT
        has_table_privilege(current_user,'public.users','SELECT') AND
        has_table_privilege(current_user,'public.practice_attempts','SELECT') AND
        CASE WHEN to_regclass('public.exam_sessions') IS NULL THEN false ELSE
          has_table_privilege(current_user,'public.exam_sessions','SELECT') END AS allowed`)).rows[0];
      if(!privileges?.allowed)return null;
      const total=(await tx.execute<{total:number}>(sql`SELECT count(*)::int AS total FROM public.users`)).rows[0]?.total ?? 0;
      const items=(await tx.execute(learnerSummarySql(input.data.pageSize,(input.data.page-1)*input.data.pageSize))).rows;
      return {items,total,...input.data,lessonActivity:null,lessonActivityReason:"Owner-scoped lesson history requires a separately reviewed monitoring permission."};
    });
    if(!data){res.status(503).json({error:{code:"MONITORING_UNAVAILABLE",message:"Required read permissions or exam tables are unavailable."}});return;}
    res.json(data);
  }catch{res.status(503).json({error:{code:"MONITORING_UNAVAILABLE",message:"Learner summaries could not be loaded."}});}
});
export default router;
