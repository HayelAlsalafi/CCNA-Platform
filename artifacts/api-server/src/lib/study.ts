import { db as defaultDb } from "@workspace/db";
import { sql } from "drizzle-orm";
import { LessonError } from "./lessons";
import {
  annotationInput,
  annotationPatch,
  progressInput,
  workspaceQuery,
} from "./study-validation";
import { validAnchor } from "../../../../lib/lesson-study";
import { contentAccessRequested, createContentAccess } from "./content-access";
import { privateStudyWorkspace, privateStudyProgress, privateLessonStudy, projectPrivateStudy } from "./private-study-access";
type Db = typeof defaultDb;
type Tx = Pick<Db, "execute">;
export async function studyReady(db: Tx) {
  const row = (
    await db.execute(
      sql`SELECT to_regclass('public.lesson_annotations') IS NOT NULL AND to_regclass('public.lesson_progress') IS NOT NULL AS ready`,
    )
  ).rows[0];
  if (row?.ready !== true)
    throw new LessonError(
      503,
      "STUDY_NOT_READY",
      "Private study storage is not activated. Notes, highlights, bookmarks and completion have not been saved.",
    );
}
async function owned<T>(actor: string, db: Db, action: (tx: Tx) => Promise<T>, readOnly = false) {
  await studyReady(db);
  return db.transaction(
    async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.study_user',${actor},true),set_config('statement_timeout','10000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','30000',true)`,
      );
      return action(tx);
    },
    {
      ...(readOnly
        ? { accessMode: "read only" as const, isolationLevel: "repeatable read" as const }
        : {}),
    },
  );
}
const published = sql`FROM public.lessons l JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id JOIN public.curriculum_chapters c ON c.id=l.chapter_id JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=c.blueprint_id`;
const visible = sql`t.status='ACTIVE' AND b.status='ACTIVE' AND r.snapshot->>'chapterId'=c.id::text`;
async function current(tx: Tx, id: string, revision?: string, lock = false) {
  const row = (
    await tx.execute(
      sql`SELECT l.id,r.id AS "revisionId",r.snapshot ${published} WHERE l.id=${id}::uuid AND ${visible} ${lock ? sql`FOR SHARE OF l` : sql``}`,
    )
  ).rows[0];
  if (!row) throw new LessonError(404, "LESSON_NOT_FOUND", "Published lesson not available.");
  if (revision && row.revisionId !== revision)
    throw new LessonError(
      409,
      "STUDY_REVISION_CHANGED",
      "The published revision changed. Reload before saving; annotations will never be moved to different text automatically.",
    );
  return row as {
    id: string;
    revisionId: string;
    snapshot: { blocks: { id: string; type: string; text?: string; runs?: { text: string }[] }[] };
  };
}
const fields = sql`a.id,a.lesson_id AS "lessonId",a.revision_id AS "revisionId",a.kind,a.anchor,a.body,a.color,a.category,a.version,a.created_at AS "createdAt",a.updated_at AS "updatedAt"`;
function annotationDto(row: Record<string, unknown>) {
  return {
    ...row,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}
const noProgress = { state: "NOT_STARTED", blockId: null, version: 0 };
export async function lessonStudy(actor: string, id: string, db: Db = defaultDb) {
  return owned(
    actor,
    db,
    async (tx) => {
      if (contentAccessRequested()) {
        const ownStudy = await privateLessonStudy(actor, id, tx);
        if (!ownStudy) throw new LessonError(404,"STUDY_ITEM_NOT_FOUND","No saved personal study data.");
        return ownStudy;
      }
      const lesson = await current(tx, id);
      const annotations = await tx.execute(
        sql`SELECT ${fields} FROM public.lesson_annotations a WHERE a.user_id=${actor}::uuid AND a.lesson_id=${id}::uuid ORDER BY a.created_at,a.id LIMIT 501`,
      );
      if (annotations.rows.length > 500)
        throw new LessonError(
          400,
          "STUDY_LIST_TOO_LARGE",
          "Use the paginated study workspace for this lesson.",
        );
      const progress =
        (
          await tx.execute(
            sql`SELECT state,block_id AS "blockId",version FROM public.lesson_progress WHERE user_id=${actor}::uuid AND lesson_id=${id}::uuid AND revision_id=${lesson.revisionId}::uuid`,
          )
        ).rows[0] ?? noProgress;
      return {
        revisionId: lesson.revisionId,
        annotations: annotations.rows.map(annotationDto),
        progress,
      };
    },
    true,
  );
}
export async function createAnnotation(actor: string, input: unknown, db: Db = defaultDb) {
  const value = annotationInput.parse(input);
  return owned(actor, db, async (tx) => {
    if(contentAccessRequested() && !(await createContentAccess(q=>tx.execute(q),()=>true)(
      {id:actor,status:"ACTIVE"},{kind:"LESSON",id:value.lessonId},"lesson.read",value.revisionId)))
      throw new LessonError(403,"CONTENT_ACCESS_DENIED","Lesson access is required for new study anchors.");
    const lesson = await current(tx, value.lessonId, value.revisionId, true);
    if (value.anchor && !validAnchor(value.anchor, lesson.snapshot.blocks))
      throw new LessonError(
        409,
        "STUDY_ANCHOR_CHANGED",
        "The selected text does not match this revision. Select it again.",
      );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor + ":" + value.lessonId},0))`,
    );
    if (value.kind === "HIGHLIGHT") {
      const overlap = (
        await tx.execute(
          sql`SELECT id FROM public.lesson_annotations WHERE user_id=${actor}::uuid AND lesson_id=${value.lessonId}::uuid AND revision_id=${value.revisionId}::uuid AND kind='HIGHLIGHT' AND anchor->>'blockId'=${value.anchor!.blockId} AND (anchor->>'start')::int<${value.anchor!.end} AND (anchor->>'end')::int>${value.anchor!.start} LIMIT 1`,
        )
      ).rows;
      if (overlap.length)
        throw new LessonError(
          409,
          "HIGHLIGHT_OVERLAP",
          "Edit or remove the overlapping highlight first.",
        );
    }
    const row = (
      await tx.execute(
        sql`INSERT INTO public.lesson_annotations AS a(user_id,lesson_id,revision_id,kind,anchor,body,color,category) VALUES(${actor}::uuid,${value.lessonId}::uuid,${value.revisionId}::uuid,${value.kind},${value.anchor ? JSON.stringify(value.anchor) : null}::jsonb,${value.body},${value.color},${value.category}) RETURNING ${fields}`,
      )
    ).rows[0];
    return { annotation: annotationDto(row) };
  });
}
export async function changeAnnotation(
  actor: string,
  id: string,
  input: unknown,
  remove = false,
  db: Db = defaultDb,
) {
  const patch = annotationPatch.parse(input);
  return owned(actor, db, async (tx) => {
    const row = (
      await tx.execute(
        sql`SELECT ${fields} FROM public.lesson_annotations a WHERE a.id=${id}::uuid AND a.user_id=${actor}::uuid FOR UPDATE`,
      )
    ).rows[0];
    if (!row) throw new LessonError(404, "STUDY_ITEM_NOT_FOUND", "Study item not found.");
    if (row.version !== patch.version)
      throw new LessonError(
        409,
        "STUDY_ITEM_CHANGED",
        "This study item changed. Reload before retrying.",
      );
    if (remove) {
      await tx.execute(
        sql`DELETE FROM public.lesson_annotations WHERE id=${id}::uuid AND user_id=${actor}::uuid`,
      );
      return { deleted: true as const };
    }
    const value = annotationInput.parse({
      lessonId: row.lessonId,
      revisionId: row.revisionId,
      kind: row.kind,
      anchor: row.anchor,
      body: patch.body ?? row.body,
      color: patch.color === undefined ? row.color : patch.color,
      category: patch.category ?? row.category,
    });
    const next = (
      await tx.execute(
        sql`UPDATE public.lesson_annotations AS a SET body=${value.body},color=${value.color},category=${value.category},version=version+1,updated_at=clock_timestamp() WHERE a.id=${id}::uuid AND a.user_id=${actor}::uuid RETURNING ${fields}`,
      )
    ).rows[0];
    return { annotation: contentAccessRequested() ? (await projectPrivateStudy(actor,[next],tx))[0] : annotationDto(next) };
  });
}
export async function saveProgress(actor: string, input: unknown, db: Db = defaultDb) {
  const value = progressInput.parse(input);
  return owned(actor, db, async (tx) => {
    if(contentAccessRequested() && !(await createContentAccess(q=>tx.execute(q),()=>true)(
      {id:actor,status:"ACTIVE"},{kind:"LESSON",id:value.lessonId},"lesson.read",value.revisionId)))
      throw new LessonError(403,"CONTENT_ACCESS_DENIED","Lesson access is required to update a reading position.");
    const lesson = await current(tx, value.lessonId, value.revisionId, true);
    if (value.blockId && !lesson.snapshot.blocks.some((b) => b.id === value.blockId))
      throw new LessonError(
        409,
        "STUDY_ANCHOR_CHANGED",
        "Reading position does not belong to this revision.",
      );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor + ":" + value.lessonId},0))`,
    );
    const before = (
      await tx.execute(
        sql`SELECT state,version,block_id AS "blockId" FROM public.lesson_progress WHERE user_id=${actor}::uuid AND lesson_id=${value.lessonId}::uuid AND revision_id=${value.revisionId}::uuid FOR UPDATE`,
      )
    ).rows[0];
    if ((before?.version ?? 0) !== value.version)
      throw new LessonError(
        409,
        "STUDY_ITEM_CHANGED",
        "Progress changed in another tab. Reload before retrying.",
      );
    if (!before && value.action === "position")
      throw new LessonError(400, "STUDY_NOT_STARTED", "Start the lesson before saving a position.");
    if (before && value.action === "start")
      throw new LessonError(
        409,
        "STUDY_ALREADY_STARTED",
        "This lesson is already started. Reload progress.",
      );
    if (value.action === "reopen" && before?.state !== "COMPLETED")
      throw new LessonError(409, "STUDY_NOT_COMPLETED", "Only a completed lesson can be reopened.");
    const state =
      value.action === "complete"
        ? "COMPLETED"
        : value.action === "position"
          ? (before?.state ?? "IN_PROGRESS")
          : "IN_PROGRESS";
    const progress = (
      await tx.execute(
        sql`INSERT INTO public.lesson_progress(user_id,lesson_id,revision_id,state,block_id) VALUES(${actor}::uuid,${value.lessonId}::uuid,${value.revisionId}::uuid,${state},${value.blockId ?? before?.blockId ?? null}::uuid) ON CONFLICT(user_id,lesson_id,revision_id) DO UPDATE SET state=excluded.state,block_id=excluded.block_id,version=lesson_progress.version+1,updated_at=clock_timestamp() RETURNING state,block_id AS "blockId",version`,
      )
    ).rows[0];
    return { progress };
  });
}
export async function studyWorkspace(actor: string, input: unknown, db: Db = defaultDb) {
  const value = workspaceQuery.parse(input);
  return owned(
    actor,
    db,
    async (tx) => {
      if(contentAccessRequested()) return privateStudyWorkspace(actor,value,tx);
      const conditions = [sql`a.user_id=${actor}::uuid`, visible];
      if (value.kind) conditions.push(sql`a.kind=${value.kind}`);
      if (value.color) conditions.push(sql`a.color=${value.color}`);
      if (value.chapterId) conditions.push(sql`c.id=${value.chapterId}::uuid`);
      if (value.lessonId) conditions.push(sql`l.id=${value.lessonId}::uuid`);
      if (value.domainCode) conditions.push(sql`c.domain_code=${value.domainCode}`);
      if (value.q)
        conditions.push(
          sql`strpos(lower(concat_ws(' ',a.body,a.category,ar.snapshot->>'title',t.name,d.name,a.anchor->>'quote')),lower(${value.q}))>0`,
        );
      const from = sql`${published} JOIN public.lesson_annotations a ON a.lesson_id=l.id JOIN public.lesson_revisions ar ON ar.id=a.revision_id AND ar.lesson_id=l.id WHERE ${sql.join(conditions, sql` AND `)}`;
      const total = Number(
        (await tx.execute(sql`SELECT count(*)::int AS total ${from}`)).rows[0].total,
      );
      const items = (
        await tx.execute(
          sql`SELECT ${fields},ar.snapshot->>'title' AS "lessonTitle",c.id AS "chapterId",t.name AS "chapterTitle",d.name AS "domainName",c.domain_code AS "domainCode",r.id AS "currentRevisionId" ${from} ORDER BY ${value.sort.startsWith('created')?sql`a.created_at`:sql`a.updated_at`} ${value.sort.endsWith('asc')?sql`ASC`:sql`DESC`},a.id LIMIT ${value.pageSize} OFFSET ${(value.page - 1) * value.pageSize}`,
        )
      ).rows.map(annotationDto);
      return { items, total, page: value.page, pageSize: value.pageSize };
    },
    true,
  );
}
export async function studyProgress(actor: string, input: unknown, db: Db = defaultDb) {
  const value = workspaceQuery.parse(input);
  return owned(
    actor,
    db,
    async (tx) => {
      if(contentAccessRequested()) return privateStudyProgress(actor,value,tx);
      const conditions = [visible];
      if (value.chapterId) conditions.push(sql`c.id=${value.chapterId}::uuid`);
      if (value.lessonId) conditions.push(sql`l.id=${value.lessonId}::uuid`);
      if (value.domainCode) conditions.push(sql`c.domain_code=${value.domainCode}`);
      const from = sql`${published} LEFT JOIN public.lesson_progress p ON p.lesson_id=l.id AND p.revision_id=r.id AND p.user_id=${actor}::uuid WHERE ${sql.join(conditions, sql` AND `)}`;
      const chapters = (
        await tx.execute(
          sql`SELECT c.id AS "chapterId",t.name AS "chapterTitle",d.name AS "domainName",c.domain_code AS "domainCode",count(*)::int AS total,count(*) FILTER(WHERE p.state='COMPLETED')::int AS completed,count(*) FILTER(WHERE p.state='IN_PROGRESS')::int AS "inProgress" ${from} GROUP BY c.id,t.name,d.name,c.domain_code ORDER BY c.domain_code,c.id`,
        )
      ).rows;
      const search = value.q
        ? sql` AND strpos(lower(concat_ws(' ',r.snapshot->>'title',t.name,d.name)),lower(${value.q}))>0`
        : sql``;
      const lessons = (
        await tx.execute(
          sql`SELECT l.id,r.snapshot->>'title' AS title,c.id AS "chapterId",r.id AS "revisionId",coalesce(p.state,'NOT_STARTED') AS state,p.block_id AS "blockId" ${from} ${search} ORDER BY d.display_order,c.volume,c.chapter_number,l.display_order,l.id LIMIT ${value.pageSize} OFFSET ${(value.page - 1) * value.pageSize}`,
        )
      ).rows;
      const total = value.q
        ? Number(
            (await tx.execute(sql`SELECT count(*)::int AS total ${from} ${search}`)).rows[0].total,
          )
        : chapters.reduce((sum, row) => sum + Number(row.total), 0);
      return { chapters, lessons, total, page: value.page, pageSize: value.pageSize };
    },
    true,
  );
}
