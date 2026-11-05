import { sql } from "drizzle-orm";
import { db as defaultDb } from "@workspace/db";
import { z } from "zod/v4";
type Db=typeof defaultDb;
const unavailable=()=>Object.assign(new Error("Owned course scope unavailable"),{code:"P0002"});
const count=z.number().int().nonnegative().safe();
export const courseAnalyticsSummary=z.strictObject({
  attribution:z.enum(["EPOCH_BOUND","UNKNOWN"]),
  scoped:z.strictObject({lessonProgressRecords:count,completedProgressRecords:count,practiceAttempts:count,correctPracticeAttempts:count,
    examSessions:count,finalizedExamSessions:count,meanStoredExamPercentage:z.number().min(0).max(100).nullable()}).nullable(),
  unattributedOwnerHistory:z.strictObject({lessonProgressRecords:count,practiceAttempts:count,examSessions:count}),
}).refine(v=>(v.attribution==="UNKNOWN")===(v.scoped===null) && (!v.scoped ||
  (v.scoped.completedProgressRecords<=v.scoped.lessonProgressRecords && v.scoped.correctPracticeAttempts<=v.scoped.practiceAttempts && v.scoped.finalizedExamSessions<=v.scoped.examSessions)));

/** No current questions.topic_id join can establish historical attribution.
 * An immutable captured chapter ID plus a reviewed, still-matching scope epoch
 * and post-epoch event/revision times are all required. Everything else UNKNOWN.
 */
export async function courseLearningAnalytics(actor:string,course:string,version:string,database:Db=defaultDb) {
  if(![actor,course,version].every(id=>z.string().uuid().safeParse(id).success))throw unavailable();
  return database.transaction(async tx=>{
    await tx.execute(sql`SELECT set_config('app.study_user',${actor},true),set_config('statement_timeout','10000',true),set_config('lock_timeout','3000',true)`);
    const scope=(await tx.execute(sql`SELECT v.id FROM public.course_enrollments en
      JOIN public.course_versions v ON v.id=en.course_version_id
      JOIN public.users u ON u.id=en.user_id AND u.status='ACTIVE'
      WHERE en.user_id=${actor}::uuid AND v.id=${version}::uuid AND v.course_id=${course}::uuid`)).rows[0];
    if(!scope)throw unavailable();
    const row=(await tx.execute(sql`
      WITH epochs AS (
        SELECT e.course_version_id,e.valid_from FROM public.course_attribution_epochs e
        WHERE e.binding_hash=(SELECT encode(sha256(convert_to(string_agg(c.id::text||':'||c.blueprint_id::text,',' ORDER BY c.id),'UTF8')),'hex')
          FROM public.curriculum_chapters c WHERE c.course_version_id=e.course_version_id)
      ), lessons AS (
        SELECT p.state,CASE WHEN r.created_at>=e.valid_from AND p.updated_at>=e.valid_from THEN e.course_version_id END AS attributed
        FROM public.lesson_progress p LEFT JOIN public.lesson_revisions r ON r.id=p.revision_id AND r.lesson_id=p.lesson_id
        LEFT JOIN public.curriculum_chapters c ON c.id::text=r.snapshot->>'chapterId'
        LEFT JOIN epochs e ON e.course_version_id=c.course_version_id WHERE p.user_id=${actor}::uuid
      ), practice AS (
        SELECT p.is_correct,CASE WHEN r.created_at>=e.valid_from AND d.delivered_at>=e.valid_from
          AND p.submitted_at>=e.valid_from AND r.snapshot->'topic'->>'id'=p.topic_id::text THEN e.course_version_id END AS attributed
        FROM public.practice_attempts p
        LEFT JOIN public.question_revisions r ON r.id=p.revision_id AND r.question_id=p.question_id
        LEFT JOIN public.practice_deliveries d ON d.id=p.delivery_id AND d.user_id=p.user_id AND d.revision_id=p.revision_id AND d.question_id=p.question_id
        LEFT JOIN public.curriculum_chapters c ON c.id::text=r.snapshot->'topic'->>'id'
        LEFT JOIN epochs e ON e.course_version_id=c.course_version_id WHERE p.user_id=${actor}::uuid
      ), exam_items AS (
        SELECT s.id AS session_id,CASE WHEN s.started_at>=e.valid_from AND r.created_at>=e.valid_from
          AND i.mapping_snapshot->'chapter'->>'id'=r.snapshot->'topic'->>'id' THEN e.course_version_id END AS attributed
        FROM public.exam_sessions s JOIN public.exam_session_items i ON i.session_id=s.id AND i.user_id=s.user_id
        LEFT JOIN public.question_revisions r ON r.id=i.revision_id
        LEFT JOIN public.curriculum_chapters c ON c.id::text=r.snapshot->'topic'->>'id'
        LEFT JOIN epochs e ON e.course_version_id=c.course_version_id WHERE s.user_id=${actor}::uuid
      ), exams AS (
        SELECT s.id,s.status,s.result,
          CASE WHEN count(i.session_id)=s.question_count AND count(i.attributed)=s.question_count
            AND count(DISTINCT i.attributed)=1 THEN min(i.attributed::text)::uuid END AS attributed
        FROM public.exam_sessions s LEFT JOIN exam_items i ON i.session_id=s.id
        WHERE s.user_id=${actor}::uuid GROUP BY s.id
      )
      SELECT jsonb_build_object(
        'attribution',CASE WHEN EXISTS(SELECT 1 FROM epochs WHERE course_version_id=${version}::uuid) THEN 'EPOCH_BOUND' ELSE 'UNKNOWN' END,
        'scoped',CASE WHEN EXISTS(SELECT 1 FROM epochs WHERE course_version_id=${version}::uuid) THEN jsonb_build_object(
          'lessonProgressRecords',(SELECT count(*) FROM lessons WHERE attributed=${version}::uuid),
          'completedProgressRecords',(SELECT count(*) FROM lessons WHERE attributed=${version}::uuid AND state='COMPLETED'),
          'practiceAttempts',(SELECT count(*) FROM practice WHERE attributed=${version}::uuid),
          'correctPracticeAttempts',(SELECT count(*) FROM practice WHERE attributed=${version}::uuid AND is_correct),
          'examSessions',(SELECT count(*) FROM exams WHERE attributed=${version}::uuid),
          'finalizedExamSessions',(SELECT count(*) FROM exams WHERE attributed=${version}::uuid AND status IN ('SUBMITTED','EXPIRED')),
          'meanStoredExamPercentage',(SELECT avg(CASE WHEN jsonb_typeof(result->'percentage')='number' THEN
              CASE WHEN (result->>'percentage')::numeric BETWEEN 0 AND 100 THEN (result->>'percentage')::numeric END END)
            FROM exams WHERE attributed=${version}::uuid AND status IN ('SUBMITTED','EXPIRED'))
        ) ELSE NULL END,
        'unattributedOwnerHistory',jsonb_build_object(
          'lessonProgressRecords',(SELECT count(*) FROM lessons WHERE attributed IS NULL),
          'practiceAttempts',(SELECT count(*) FROM practice WHERE attributed IS NULL),
          'examSessions',(SELECT count(*) FROM exams WHERE attributed IS NULL))
      ) AS value`)).rows[0]?.value;
    const summary=courseAnalyticsSummary.safeParse(row);
    if(!summary.success)throw Object.assign(new Error("Analytics evidence unavailable"),{code:"55000"});
    return {courseId:course,versionId:version,...summary.data};
  },{accessMode:"read only",isolationLevel:"repeatable read"});
}
