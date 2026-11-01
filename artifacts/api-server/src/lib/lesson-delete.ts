import {db as defaultDb} from '@workspace/db';
import {sql} from 'drizzle-orm';
import {z} from 'zod/v4';
import {LessonError} from './lessons';
export const lessonDeleteInput=z.object({version:z.number().int().positive().max(2147483647),confirmationTitle:z.string().min(1).max(180)}).strict();
export const lessonDeleteResult=z.object({id:z.string().uuid(),deleted:z.literal(true)}).strict();
const blocked:Record<string,string>={
  lesson_delete_published:'Published lesson: unpublishing is not part of deletion.',
  lesson_delete_progress:'Learner progress: existing reading and completion history must be preserved.',
  lesson_delete_annotations:'Learner annotations: notes, highlights or bookmarks must be preserved.',
  lesson_delete_revisions:'Published revisions: previously published lessons cannot be deleted.',
  lesson_delete_content_reference:'Content references: another draft or published revision references this lesson.',
  lesson_delete_unknown_dependency:'Unreviewed dependency: database references require a separate safety review.',
};
export async function deleteDraftLesson(id:string,input:unknown,actor:string,database=defaultDb){
  id=z.string().uuid().parse(id).toLowerCase();z.string().uuid().parse(actor);const value=lessonDeleteInput.parse(input);
  try {
    return await database.transaction(async tx=>{
      await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
      await tx.execute(sql`SET LOCAL statement_timeout='15s'`);
      const ready=(await tx.execute(sql`SELECT to_regprocedure('public.delete_never_published_lesson(uuid,uuid,integer,text)') IS NOT NULL AS ready`)).rows[0]?.ready;
      if(ready!==true)throw new LessonError(503,'LESSON_DELETE_NOT_READY','Safe lesson deletion awaits separately approved migration 0016. Nothing was deleted.');
      const result=(await tx.execute(sql`SELECT public.delete_never_published_lesson(${id}::uuid,${actor}::uuid,${value.version}::integer,${value.confirmationTitle}::text) AS result`)).rows[0]?.result;
      // Validate before committing: an unexpected result rolls back the deletion.
      const parsed=lessonDeleteResult.safeParse(result);
      if(!parsed.success||parsed.data.id!==id)throw new LessonError(500,'LESSON_DELETE_RESULT_INVALID','Deletion could not be verified. No successful deletion is assumed.');
      return parsed.data;
    });
  } catch(error) {
    if(error instanceof LessonError)throw error;
    const outer=error as {cause?:unknown;code?:string;constraint?:string},e=(outer.cause??outer) as {code?:string;constraint?:string};
    if(e.constraint&&blocked[e.constraint])throw new LessonError(409,'LESSON_DELETE_BLOCKED',blocked[e.constraint],[{path:e.constraint,code:'protected_dependency'}]);
    if(e.code==='42501')throw new LessonError(403,'FORBIDDEN','An active administrator is required.');
    if(e.code==='P0002')throw new LessonError(404,'LESSON_NOT_FOUND','Lesson no longer exists. Reload the library.');
    if(e.code==='22023')throw new LessonError(400,'LESSON_DELETE_CONFIRMATION','Type the current lesson title to confirm deletion.');
    if(['40001','40P01','55P03','23503'].includes(e.code??''))throw new LessonError(409,'LESSON_DELETE_CONFLICT','A concurrent change or protected dependency blocked deletion. Reload the library; do not retry automatically.');
    throw error;
  }
}
