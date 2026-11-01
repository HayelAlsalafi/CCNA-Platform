import { db as defaultDb } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  assertPublishable,
  lessonInputSchema,
  lessonLibraryQuerySchema,
  lessonIssueDetails,
  type LessonInput,
} from "./lesson-validation";
type Database = typeof defaultDb;
type Reader = Pick<Database, "execute">;
export class LessonError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; code: string }[],
  ) {
    super(message);
  }
}
export async function lessonsReady(database: Reader = defaultDb) {
  const result = await database.execute(
    sql`SELECT to_regclass('public.lessons') IS NOT NULL AND to_regclass('public.lesson_revisions') IS NOT NULL AS ready`,
  );
  if (result.rows[0]?.ready !== true)
    throw new LessonError(
      503,
      "LESSONS_NOT_READY",
      "Lesson persistence is awaiting its separately approved migration. No lesson data has been loaded.",
    );
}
const selected = sql`l.id,l.chapter_id AS "chapterId",l.title,l.description,l.objectives,l.estimated_minutes AS "estimatedMinutes",l.blocks,l.display_order AS "displayOrder",l.version,l.published_revision_id AS "publishedRevisionId",l.created_at AS "createdAt",l.updated_at AS "updatedAt"`;
const summarySelected = sql`l.id,l.chapter_id AS "chapterId",l.title,l.description,l.estimated_minutes AS "estimatedMinutes",l.display_order AS "displayOrder",l.version,l.published_revision_id AS "publishedRevisionId",l.created_at AS "createdAt",l.updated_at AS "updatedAt"`;
const summaryInputSchema = z
  .object({
    chapterId: lessonInputSchema.shape.chapterId,
    title: lessonInputSchema.shape.title,
    description: lessonInputSchema.shape.description,
    estimatedMinutes: lessonInputSchema.shape.estimatedMinutes,
    displayOrder: lessonInputSchema.shape.displayOrder,
  })
  .strict();
function publishedSnapshot<T>(value: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new LessonError(
      500,
      "LESSON_PUBLISHED_DATA_INVALID",
      "Published lesson metadata is invalid. Ask an administrator to inspect the API diagnostic fields; do not edit or republish content to work around this error.",
      lessonIssueDetails(result.error.issues),
    );
  return result.data;
}
type LessonRow = Record<string, unknown> & {
  id: string;
  chapterId: string;
  version: number;
  publishedRevisionId: string | null;
};
function dto(row: Record<string, unknown>) {
  return {
    ...row,
    status: row.publishedRevisionId ? "PUBLISHED" : "DRAFT",
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}
async function runOne(database: Reader, query: SQL): Promise<LessonRow> {
  const result = await database.execute(query);
  if (!result.rows[0]) throw new LessonError(404, "LESSON_NOT_FOUND", "Lesson not found.");
  return result.rows[0] as LessonRow;
}
async function chapterExists(database: Reader, chapterId: string, active = false) {
  const result = await database.execute(
    sql`SELECT c.id FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE c.id=${chapterId}::uuid ${active ? sql`AND t.status='ACTIVE' AND b.status='ACTIVE'` : sql``} FOR KEY SHARE OF c`,
  );
  if (!result.rows.length)
    throw new LessonError(400, "INVALID_CHAPTER", "Choose an existing curriculum chapter.");
}
function requireVersion(row: LessonRow, version: number) {
  if (row.version !== version)
    throw new LessonError(
      409,
      "LESSON_CONFLICT",
      "This lesson changed in another editor. Reload the latest lesson before saving.",
    );
}
export async function adminLessonList(
  chapterId: string | undefined,
  database: Database = defaultDb,
) {
  await lessonsReady(database);
  const result = await database.execute(
    sql`SELECT ${summarySelected} FROM public.lessons l ${chapterId ? sql`WHERE l.chapter_id=${chapterId}::uuid` : sql``} ORDER BY l.chapter_id,l.display_order,l.id LIMIT 201`,
  );
  if (result.rows.length > 200)
    throw new LessonError(
      400,
      "LESSON_LIST_TOO_LARGE",
      "Filter to a chapter containing at most 200 lessons.",
    );
  return { items: result.rows.map(dto) };
}
export async function adminLessonGet(id: string, database: Database = defaultDb) {
  await lessonsReady(database);
  return {
    lesson: dto(
      await runOne(database, sql`SELECT ${selected} FROM public.lessons l WHERE l.id=${id}::uuid`),
    ),
  };
}
/** Paginated authoring metadata only: never load all content/revisions for a list. */
export async function adminLessonLibrary(raw: unknown, database: Database = defaultDb) {
  const query = lessonLibraryQuerySchema.parse(raw);
  await lessonsReady(database);
  return database.transaction(
    async (tx) => {
      const clauses: SQL[] = [];
      if (query.q)
        clauses.push(
          sql`strpos(lower(concat_ws(' ',l.title,l.description,l.id::text,t.name,d.name)),lower(${query.q}))>0`,
        );
      if (query.chapterId) clauses.push(sql`l.chapter_id=${query.chapterId}::uuid`);
      if (query.domainId) clauses.push(sql`c.domain_id=${query.domainId}::uuid`);
      if (query.domainCode) clauses.push(sql`c.domain_code=${query.domainCode}`);
      if (query.volume) clauses.push(sql`c.volume=${query.volume}`);
      if (query.status)
        clauses.push(
          query.status === "PUBLISHED"
            ? sql`l.published_revision_id IS NOT NULL`
            : sql`l.published_revision_id IS NULL`,
        );
      if (query.updatedAfter) clauses.push(sql`l.updated_at>=${query.updatedAfter}::timestamptz`);
      const where = clauses.length ? sql`WHERE ${sql.join(clauses, sql` AND `)}` : sql``;
      const joins = sql`FROM public.lessons l JOIN public.curriculum_chapters c ON c.id=l.chapter_id JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id`;
      const summary = (
        await tx.execute(
          sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE published_revision_id IS NOT NULL)::int AS published,count(*) FILTER(WHERE published_revision_id IS NULL)::int AS drafts,count(DISTINCT chapter_id)::int AS chapters FROM public.lessons`,
        )
      ).rows[0];
      const total = Number(
        (await tx.execute(sql`SELECT count(*)::int AS total ${joins} ${where}`)).rows[0].total,
      );
      const rows = await tx.execute(
        sql`SELECT ${summarySelected},r.revision_number AS "publishedRevisionNumber",d.id AS "domainId",d.name AS "domainName",t.name AS "chapterTitle",c.volume,c.chapter_number AS "chapterNumber" ${joins} LEFT JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id ${where} ORDER BY d.display_order,d.id,t.display_order,c.id,l.display_order,l.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      );
      return {
        items: rows.rows.map(dto),
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function createLesson(
  input: LessonInput,
  actor: string,
  database: Database = defaultDb,
) {
  const value = lessonInputSchema.parse(input);
  await lessonsReady(database);
  return database.transaction(async (tx) => {
    await chapterExists(tx, value.chapterId);
    const row = await runOne(
      tx,
      sql`INSERT INTO public.lessons AS l(chapter_id,title,description,objectives,estimated_minutes,blocks,display_order,created_by,updated_by)
      VALUES(${value.chapterId}::uuid,${value.title},${value.description},${JSON.stringify(value.objectives)}::jsonb,${value.estimatedMinutes},${JSON.stringify(value.blocks)}::jsonb,${value.displayOrder},${actor}::uuid,${actor}::uuid) RETURNING ${selected}`,
    );
    return { lesson: dto(row) };
  });
}
export async function updateLesson(
  id: string,
  input: LessonInput,
  version: number,
  actor: string,
  database: Database = defaultDb,
) {
  const value = lessonInputSchema.parse(input);
  await lessonsReady(database);
  return database.transaction(async (tx) => {
    const current = await runOne(
      tx,
      sql`SELECT ${selected} FROM public.lessons l WHERE l.id=${id}::uuid FOR UPDATE`,
    );
    requireVersion(current, version);
    if (current.publishedRevisionId && current.chapterId !== value.chapterId)
      throw new LessonError(
        409,
        "UNPUBLISH_BEFORE_MOVE",
        "Unpublish this lesson before moving it to another chapter.",
      );
    await chapterExists(tx, value.chapterId);
    const row = await runOne(
      tx,
      sql`UPDATE public.lessons AS l SET chapter_id=${value.chapterId}::uuid,title=${value.title},description=${value.description},objectives=${JSON.stringify(value.objectives)}::jsonb,estimated_minutes=${value.estimatedMinutes},blocks=${JSON.stringify(value.blocks)}::jsonb,display_order=${value.displayOrder},version=version+1,updated_by=${actor}::uuid,updated_at=clock_timestamp() WHERE l.id=${id}::uuid RETURNING ${selected}`,
    );
    return { lesson: dto(row) };
  });
}
export async function publishLesson(
  id: string,
  version: number,
  actor: string,
  publish: boolean,
  database: Database = defaultDb,
) {
  await lessonsReady(database);
  return database.transaction(async (tx) => {
    const current = await runOne(
      tx,
      sql`SELECT ${selected} FROM public.lessons l WHERE l.id=${id}::uuid FOR UPDATE`,
    );
    requireVersion(current, version);
    let revisionId: string | null = null;
    if (publish) {
      const snapshot = lessonInputSchema.parse(
        Object.fromEntries(Object.keys(lessonInputSchema.shape).map((key) => [key, current[key]])),
      );
      try {
        assertPublishable(snapshot);
      } catch (error) {
        throw new LessonError(400, "LESSON_INCOMPLETE", (error as Error).message);
      }
      await chapterExists(tx, snapshot.chapterId, true);
      const result = await tx.execute(
        sql`INSERT INTO public.lesson_revisions(lesson_id,revision_number,snapshot,created_by) SELECT ${id}::uuid,COALESCE(max(revision_number),0)+1,${JSON.stringify(snapshot)}::jsonb,${actor}::uuid FROM public.lesson_revisions WHERE lesson_id=${id}::uuid RETURNING id`,
      );
      revisionId = String(result.rows[0].id);
    }
    const row = await runOne(
      tx,
      sql`UPDATE public.lessons AS l SET published_revision_id=${revisionId}::uuid,version=version+1,updated_by=${actor}::uuid,updated_at=clock_timestamp() WHERE l.id=${id}::uuid RETURNING ${selected}`,
    );
    return { lesson: dto(row) };
  });
}
export async function lessonRevisions(id: string, database: Database = defaultDb) {
  await lessonsReady(database);
  await runOne(database, sql`SELECT id FROM public.lessons WHERE id=${id}::uuid`);
  const result = await database.execute(
    sql`SELECT id,lesson_id AS "lessonId",revision_number AS "revisionNumber",snapshot,created_at AS "createdAt" FROM public.lesson_revisions WHERE lesson_id=${id}::uuid ORDER BY revision_number DESC LIMIT 100`,
  );
  return {
    items: result.rows.map((row) => ({
      ...row,
      createdAt: new Date(String(row.createdAt)).toISOString(),
    })),
  };
}
export async function reorderLessons(
  input: { chapterId: string; lessons: { id: string; version: number; displayOrder: number }[] },
  actor: string,
  database: Database = defaultDb,
) {
  await lessonsReady(database);
  return database.transaction(async (tx) => {
    await chapterExists(tx, input.chapterId);
    // A consistent lock order prevents deadlocks between overlapping reorder requests.
    for (const item of [...input.lessons].sort((a, b) => a.id.localeCompare(b.id))) {
      const row = await runOne(
        tx,
        sql`SELECT ${selected} FROM public.lessons l WHERE l.id=${item.id}::uuid FOR UPDATE`,
      );
      requireVersion(row, item.version);
      if (row.chapterId !== input.chapterId)
        throw new LessonError(
          400,
          "INVALID_CHAPTER",
          "Every reordered lesson must belong to this chapter.",
        );
    }
    for (const item of input.lessons)
      await tx.execute(
        sql`UPDATE public.lessons SET display_order=${item.displayOrder},version=version+1,updated_by=${actor}::uuid,updated_at=clock_timestamp() WHERE id=${item.id}::uuid`,
      );
    const result = await tx.execute(
      sql`SELECT ${summarySelected} FROM public.lessons l WHERE l.chapter_id=${input.chapterId}::uuid ORDER BY l.display_order,l.id LIMIT 201`,
    );
    if (result.rows.length > 200)
      throw new LessonError(
        400,
        "LESSON_LIST_TOO_LARGE",
        "This chapter exceeds the authoring list limit.",
      );
    return { items: result.rows.map(dto) };
  });
}
const publishedJoin = sql`FROM public.lessons l JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id JOIN public.curriculum_chapters c ON c.id=l.chapter_id JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=c.blueprint_id`;
const visible = sql`t.status='ACTIVE' AND b.status='ACTIVE' AND r.snapshot->>'chapterId'=c.id::text`;
function publishedDto(row: Record<string, unknown>) {
  const snapshot = publishedSnapshot(row.snapshot, lessonInputSchema);
  return {
    ...snapshot,
    id: row.id,
    version: row.version,
    status: "PUBLISHED",
    displayOrder: row.displayOrder,
    publishedRevisionId: row.revisionId,
    revisionId: row.revisionId,
    revisionNumber: row.revisionNumber,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
    chapter: row.chapter,
  };
}
export async function chapterLessonList(chapterId: string, database: Database = defaultDb) {
  await lessonsReady(database);
  const result = await database.execute(
    sql`SELECT l.id,l.version,l.display_order AS "displayOrder",r.id AS "revisionId",r.revision_number AS "revisionNumber",r.snapshot-'blocks'-'objectives' AS snapshot,r.created_at AS "createdAt",r.created_at AS "updatedAt" ${publishedJoin} WHERE c.id=${chapterId}::uuid AND ${visible} ORDER BY l.display_order,l.id LIMIT 201`,
  );
  if (result.rows.length > 200)
    throw new LessonError(
      400,
      "LESSON_LIST_TOO_LARGE",
      "This chapter exceeds the lesson list limit.",
    );
  // Never serialize working-copy fields or drafts, even when a published lesson is being edited.
  return {
    items: result.rows.map((row) => ({
      ...publishedSnapshot(row.snapshot, summaryInputSchema),
      id: row.id,
      version: row.version,
      status: "PUBLISHED",
      displayOrder: row.displayOrder,
      publishedRevisionId: row.revisionId,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: new Date(String(row.createdAt)).toISOString(),
      updatedAt: new Date(String(row.updatedAt)).toISOString(),
    })),
  };
}
export async function publishedLesson(id: string, database: Database = defaultDb) {
  await lessonsReady(database);
  return database.transaction(
    async (tx) => {
      const row = await runOne(
        tx,
        sql`SELECT l.id,l.version,l.display_order AS "displayOrder",r.id AS "revisionId",r.revision_number AS "revisionNumber",r.snapshot,r.created_at AS "createdAt",r.created_at AS "updatedAt",jsonb_build_object('id',c.id,'title',t.name,'bookReference',c.volume || ' / Chapter ' || c.chapter_number,'domainId',d.id,'domainName',d.name) AS chapter ${publishedJoin} WHERE l.id=${id}::uuid AND ${visible}`,
      );
      const chapterId = (row.snapshot as LessonInput).chapterId;
      const previous = await tx.execute(
        sql`SELECT l.id,r.snapshot->>'title' AS title ${publishedJoin} WHERE c.id=${chapterId}::uuid AND ${visible} AND (l.display_order,l.id)<(${row.displayOrder},${id}::uuid) ORDER BY l.display_order DESC,l.id DESC LIMIT 1`,
      );
      const next = await tx.execute(
        sql`SELECT l.id,r.snapshot->>'title' AS title ${publishedJoin} WHERE c.id=${chapterId}::uuid AND ${visible} AND (l.display_order,l.id)>(${row.displayOrder},${id}::uuid) ORDER BY l.display_order,l.id LIMIT 1`,
      );
      const nav = (item: Record<string, unknown> | undefined) =>
        item ? { id: item.id, title: item.title } : null;
      return {
        lesson: publishedDto(row),
        previous: nav(previous.rows[0]),
        next: nav(next.rows[0]),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
