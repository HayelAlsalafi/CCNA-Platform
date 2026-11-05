import { sql, type SQL } from "drizzle-orm";
import { createContentAccess } from "./content-access";
import { workspaceQuery } from "./study-validation";

type Tx = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> };
type Item = Record<string, unknown>;
const date = (value: unknown) => new Date(String(value)).toISOString();

/** Explicit presentation projection: never spread a snapshot or unknown column.
 * body/category are user-entered text, not the server-captured anchor quotation.
 * No stored annotation, bookmark, highlight or progress record is rewritten.
 */
export function privateStudyProjection(item: Item, mayReadContent: boolean) {
  return {
    id: item.id, lessonId: item.lessonId, revisionId: item.revisionId,
    kind: item.kind, body: item.body, category: item.category, color: item.color,
    version: item.version, createdAt: date(item.createdAt), updatedAt: date(item.updatedAt),
    anchor: mayReadContent ? item.anchor : null,
    lessonTitle: mayReadContent ? item.lessonTitle : "",
    chapterId: item.chapterId,
    chapterTitle: mayReadContent ? item.chapterTitle : "",
    domainName: mayReadContent ? item.domainName : "",
    domainCode: mayReadContent ? item.domainCode : "",
    currentRevisionId: mayReadContent ? item.currentRevisionId : item.revisionId,
  };
}
export async function projectPrivateStudy(actor: string, items: Item[], tx: Tx) {
  const canRead = createContentAccess(query => tx.execute(query), () => true);
  // Bounded per-page decisions; never a role shortcut or cross-request cache.
  return Promise.all(items.map(async item => privateStudyProjection(item,
    await canRead({ id: actor, status: "ACTIVE" }, {kind:"LESSON",id:String(item.lessonId)}, "lesson.read", String(item.revisionId)))));
}

const annotationFields = sql`a.id,a.lesson_id AS "lessonId",a.revision_id AS "revisionId",a.kind,a.anchor,a.body,a.color,a.category,a.version,a.created_at AS "createdAt",a.updated_at AS "updatedAt"`;
const ownerJoin = sql`FROM public.lesson_annotations a
  JOIN public.lessons l ON l.id=a.lesson_id
  JOIN public.curriculum_chapters c ON c.id=l.chapter_id
  JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id
  JOIN public.lesson_revisions ar ON ar.id=a.revision_id AND ar.lesson_id=l.id`;

/** Called only inside study.ts's existing actor-scoped, read-only RLS transaction. */
export async function privateStudyWorkspace(actor: string, input: unknown, tx: Tx) {
  const value = workspaceQuery.parse(input);
  const conditions = [sql`a.user_id=${actor}::uuid`];
  if(value.kind) conditions.push(sql`a.kind=${value.kind}`);
  if(value.color) conditions.push(sql`a.color=${value.color}`);
  if(value.chapterId) conditions.push(sql`c.id=${value.chapterId}::uuid`);
  if(value.lessonId) conditions.push(sql`a.lesson_id=${value.lessonId}::uuid`);
  if(value.domainCode) conditions.push(sql`c.domain_code=${value.domainCode}`);
  // Never search hidden excerpts/titles: even a count could disclose a phrase.
  if(value.q) conditions.push(sql`strpos(lower(concat_ws(' ',a.body,a.category)),lower(${value.q}))>0`);
  const from = sql`${ownerJoin} WHERE ${sql.join(conditions,sql` AND `)}`;
  const total = Number((await tx.execute(sql`SELECT count(*)::int AS total ${from}`)).rows[0].total);
  const rows = (await tx.execute(sql`SELECT ${annotationFields},ar.snapshot->>'title' AS "lessonTitle",
    c.id AS "chapterId",t.name AS "chapterTitle",d.name AS "domainName",c.domain_code AS "domainCode",
    coalesce(l.published_revision_id,a.revision_id) AS "currentRevisionId"
    ${from} ORDER BY ${value.sort.startsWith('created') ? sql`a.created_at` : sql`a.updated_at`}
    ${value.sort.endsWith('asc') ? sql`ASC` : sql`DESC`},a.id LIMIT ${value.pageSize} OFFSET ${(value.page-1)*value.pageSize}`)).rows;
  return { items:await projectPrivateStudy(actor,rows,tx),total,page:value.page,pageSize:value.pageSize };
}

/** Only actual personal progress, including older/unpublished revisions; no
 * fabricated NOT_STARTED rows or counts of an inaccessible course's lessons.
 */
export async function privateStudyProgress(actor: string, input: unknown, tx: Tx) {
  const value=workspaceQuery.parse(input), conditions=[sql`p.user_id=${actor}::uuid`];
  if(value.lessonId) conditions.push(sql`p.lesson_id=${value.lessonId}::uuid`);
  if(value.chapterId) conditions.push(sql`l.chapter_id=${value.chapterId}::uuid`);
  if(value.domainCode) conditions.push(sql`c.domain_code=${value.domainCode}`);
  // Progress has no original free-text field. Do not search protected titles.
  if(value.q) conditions.push(sql`false`);
  const own=sql`WITH own AS (SELECT DISTINCT ON(p.lesson_id) p.lesson_id,p.revision_id,p.state,p.block_id,l.chapter_id
    FROM public.lesson_progress p JOIN public.lessons l ON l.id=p.lesson_id
    JOIN public.curriculum_chapters c ON c.id=l.chapter_id
    WHERE ${sql.join(conditions,sql` AND `)} ORDER BY p.lesson_id,p.updated_at DESC,p.revision_id)`;
  const total=Number((await tx.execute(sql`${own} SELECT count(*)::int AS total FROM own`)).rows[0].total);
  const chapters=(await tx.execute(sql`${own} SELECT chapter_id AS "chapterId",'' AS "chapterTitle",'' AS "domainName",'' AS "domainCode",
    count(*)::int AS total,count(*) FILTER(WHERE state='COMPLETED')::int AS completed,
    count(*) FILTER(WHERE state='IN_PROGRESS')::int AS "inProgress" FROM own GROUP BY chapter_id ORDER BY chapter_id LIMIT 1001`)).rows;
  if(chapters.length>1000) throw Error("Private progress chapter limit exceeded");
  const lessons=(await tx.execute(sql`${own} SELECT lesson_id AS id,'' AS title,chapter_id AS "chapterId",
    revision_id AS "revisionId",state,block_id AS "blockId" FROM own ORDER BY lesson_id
    LIMIT ${value.pageSize} OFFSET ${(value.page-1)*value.pageSize}`)).rows;
  return {chapters,lessons,total,page:value.page,pageSize:value.pageSize};
}

export async function privateLessonStudy(actor: string, lessonId: string, tx: Tx) {
  const rows=(await tx.execute(sql`SELECT ${annotationFields},l.chapter_id AS "chapterId",
    coalesce(l.published_revision_id,a.revision_id) AS "currentRevisionId"
    FROM public.lesson_annotations a JOIN public.lessons l ON l.id=a.lesson_id
    WHERE a.user_id=${actor}::uuid AND a.lesson_id=${lessonId}::uuid ORDER BY a.created_at,a.id LIMIT 501`)).rows;
  if(rows.length>500) throw Error("Private study annotation limit exceeded");
  const p=(await tx.execute(sql`SELECT revision_id AS "revisionId",state,block_id AS "blockId",version
    FROM public.lesson_progress WHERE user_id=${actor}::uuid AND lesson_id=${lessonId}::uuid
    ORDER BY updated_at DESC,revision_id LIMIT 1`)).rows[0];
  let revisionId=p?.revisionId ?? rows[0]?.revisionId;
  if(!revisionId) {
    const canRead=createContentAccess(q=>tx.execute(q),()=>true);
    if(await canRead({id:actor,status:"ACTIVE"},{kind:"LESSON",id:lessonId},"lesson.read"))
      revisionId=(await tx.execute(sql`SELECT published_revision_id AS "revisionId" FROM public.lessons WHERE id=${lessonId}::uuid`)).rows[0]?.revisionId;
  }
  if(!revisionId) return null;
  return {revisionId,annotations:await projectPrivateStudy(actor,rows,tx),progress:p ?? {state:"NOT_STARTED",blockId:null,version:0}};
}
