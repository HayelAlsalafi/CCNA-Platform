import { sql } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb, topicsTable } from "@workspace/db";
import { updateTopicInputSchema } from "@workspace/db/schema";
import { createTopic, TopicError, assertCanonicalTopicEdit } from "./topics-admin";
import { curriculumDomains, topicChapterBindings } from "./curriculum-config";
import { deleteIdsSchema } from "./admin-delete";
type Db = typeof defaultDb;
const chapters = curriculumDomains.flatMap((d) =>
  d.sections.flatMap((s) => s.chapters.map((c) => ({ ...c, domainId: d.id }))),
);
const bindings = Object.entries(topicChapterBindings).flatMap(([slug, ids]) =>
  ids.map((chapterId) => ({
    slug,
    chapterId,
    domainId: chapters.find((c) => c.id === chapterId)!.domainId,
  })),
);
const fail = (message: string) => {
  throw new TopicError(400, "VALIDATION_ERROR", message);
};
const sorts = {
  name: "t.name",
  displayOrder: "t.display_order",
  status: "t.status",
  createdAt: "t.created_at",
  updatedAt: "t.updated_at",
};
export const topicPageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce
      .number()
      .refine((n) => [10, 25, 50].includes(n))
      .default(25),
    search: z.string().trim().max(180).default(""),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    domain: z
      .string()
      .refine((v) => curriculumDomains.some((d) => d.id === v))
      .optional(),
    chapter: z
      .string()
      .refine((v) => chapters.some((c) => c.id === v))
      .optional(),
    taxonomyDomain: z.string().uuid().optional(),
    sort: z
      .enum(["name", "displayOrder", "status", "createdAt", "updatedAt"])
      .default("displayOrder"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export function parseTopicPage(input: unknown) {
  const p = topicPageSchema.safeParse(input);
  if (!p.success) fail("Invalid topic search, filter, sorting or pagination parameters.");
  return p.data!;
}
const versionSql = sql`to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function filtering(p: ReturnType<typeof parseTopicPage>) {
  const pattern = "%" + p.search.replace(/[\\%_]/g, "\\$&") + "%";
  return sql`WITH bindings AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(bindings)}::jsonb) AS b(slug text,"chapterId" text,"domainId" text)), filtered AS (
    SELECT t.* FROM public.topics t WHERE true
    ${p.search ? sql`AND (t.name ILIKE ${pattern} ESCAPE ${"\\"} OR t.slug ILIKE ${pattern} ESCAPE ${"\\"} OR t.description ILIKE ${pattern} ESCAPE ${"\\"})` : sql``}
    ${p.status ? sql`AND t.status=${p.status}::public.topic_status` : sql``}
    ${p.domain ? sql`AND EXISTS(SELECT 1 FROM bindings b WHERE b.slug=t.slug AND b."domainId"=${p.domain})` : sql``}
    ${p.chapter ? sql`AND EXISTS(SELECT 1 FROM bindings b WHERE b.slug=t.slug AND b."chapterId"=${p.chapter})` : sql``}
    ${p.taxonomyDomain ? sql`AND EXISTS(SELECT 1 FROM public.curriculum_chapters c WHERE c.id=t.id AND c.domain_id=${p.taxonomyDomain}::uuid)` : sql``}
  )`;
}
function managed(row: any) {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    questionCount: Number(row.questionCount ?? 0),
    publishedQuestionCount: Number(row.publishedQuestionCount ?? 0),
    chapterIds: [...(topicChapterBindings[row.slug] ?? [])],
    objectiveCodes: row.objectiveCodes ?? [],
  };
}
export async function listManagedTopics(input: unknown, db: Db = defaultDb) {
  const p = parseTopicPage(input),
    prefix = filtering(p);
  return db.transaction(
    async (tx) => {
      const meta = (
        await tx.execute<{
          total: number;
          stats: { total: number; active: number; disabled: number };
        }>(
          sql`${prefix} SELECT (SELECT count(*)::int FROM filtered) AS total,(SELECT jsonb_build_object('total',count(*),'active',count(*) FILTER(WHERE status='ACTIVE'),'disabled',count(*) FILTER(WHERE status='DISABLED')) FROM public.topics) AS stats`,
        )
      ).rows[0]!;
      const totalPages = Math.max(1, Math.ceil(meta.total / p.pageSize)),
        page = Math.min(p.page, totalPages);
      const rows = (
        await tx.execute(sql`${prefix}, paged AS (SELECT * FROM filtered t ORDER BY ${sql.raw(sorts[p.sort])} ${sql.raw(p.direction.toUpperCase())},t.id LIMIT ${p.pageSize} OFFSET ${(page - 1) * p.pageSize}),
      counts AS (SELECT q.topic_id,count(*)::int AS total,count(*) FILTER(WHERE q.status='ACTIVE')::int AS published FROM public.questions q JOIN paged p ON p.id=q.topic_id GROUP BY q.topic_id),
      objectives AS (SELECT c.id AS topic_id,ARRAY[c.code] AS codes FROM public.curriculum_chapters c JOIN paged p ON p.id=c.id)
      SELECT t.id,t.name,t.slug,t.description,t.display_order AS "displayOrder",t.status,t.created_at AS "createdAt",t.updated_at AS "updatedAt",${versionSql} AS version,coalesce(c.total,0) AS "questionCount",coalesce(c.published,0) AS "publishedQuestionCount",o.codes AS "objectiveCodes"
      FROM paged t LEFT JOIN counts c ON c.topic_id=t.id LEFT JOIN objectives o ON o.topic_id=t.id ORDER BY ${sql.raw(sorts[p.sort])} ${sql.raw(p.direction.toUpperCase())},t.id`)
      ).rows;
      return {
        items: rows.map(managed),
        total: Number(meta.total),
        page,
        pageSize: p.pageSize,
        totalPages,
        stats: meta.stats,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function topicMetadata(db: Db = defaultDb) {
  return {
    curriculumDomains: curriculumDomains.map((d) => ({ id: d.id, title: d.title })),
    chapters: chapters.map((c) => ({ id: c.id, title: c.title, domainId: c.domainId })),
    taxonomyDomains: (
      await db.execute(
        sql`SELECT d.id,d.code,d.name,b.version FROM public.exam_domains d JOIN public.exam_blueprints b ON b.id=d.blueprint_id ORDER BY b.version,d.display_order,d.id LIMIT 200`,
      )
    ).rows,
  };
}
export function topicSlug(name: string) {
  const value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 108)
    .replace(/-$/, "");
  return value.length >= 2 ? value : value ? "topic-" + value : "topic";
}
export async function suggestTopicSlug(name: unknown, db: Db = defaultDb) {
  const parsed = z.string().trim().min(1).max(180).safeParse(name);
  if (!parsed.success) fail("A topic name is required for slug generation.");
  const base = topicSlug(parsed.data!);
  const row = (
    await db.execute<{ slug: string }>(
      sql`SELECT c.slug FROM (SELECT CASE WHEN n=0 THEN ${base} ELSE ${base}||'-'||n::text END AS slug,n FROM generate_series(0,10000) n) c LEFT JOIN public.topics t ON t.slug=c.slug WHERE t.id IS NULL ORDER BY c.n LIMIT 1`,
    )
  ).rows[0];
  if (!row)
    throw new TopicError(
      409,
      "CONFLICT",
      "No automatic slug available; choose a different name or a manual slug.",
    );
  return { slug: row.slug };
}
export async function createManagedTopic(
  input: unknown,
  db: Db = defaultDb,
): Promise<typeof topicsTable.$inferSelect> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Invalid topic data.");
  const {
    autoSlug = false,
    rejectDuplicateName = false,
    ...fields
  } = input as Record<string, unknown>;
  if (typeof rejectDuplicateName !== "boolean") fail("Invalid duplicate name setting.");
  if (rejectDuplicateName)
    return db.transaction(async (tx) => {
      const name = z.string().trim().min(1).max(180).safeParse(fields.name);
      if (!name.success) fail("A topic name is required.");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(lower(regexp_replace(btrim(${name.data!}),${"\\s+"},' ','g')),0))`,
      );
      const matches = await tx.execute(
        sql`SELECT id FROM public.topics WHERE lower(regexp_replace(btrim(name),${"\\s+"},' ','g'))=lower(regexp_replace(btrim(${name.data!}),${"\\s+"},' ','g')) LIMIT 1`,
      );
      if (matches.rows.length)
        throw new TopicError(
          409,
          "CONFLICT",
          "A topic with this name already exists. Select the existing topic instead.",
        );
      return createManagedTopic({ ...fields, autoSlug }, tx as unknown as Db);
    });
  if (typeof autoSlug !== "boolean") fail("Invalid automatic slug setting.");
  if (!autoSlug) return createTopic(fields, db);
  return db.transaction(async (tx) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { slug } = await suggestTopicSlug(fields.name, tx as unknown as Db);
      try {
        return await tx.transaction((child) =>
          createTopic({ ...fields, slug }, child as unknown as Db),
        );
      } catch (e) {
        if (!(e instanceof TopicError && e.code === "CONFLICT")) throw e;
      }
    }
    throw new TopicError(
      409,
      "CONFLICT",
      "Another administrator claimed this slug. Review and submit again.",
    );
  });
}
const versionSchema = z.string().datetime({ precision: 6 });
export async function updateManagedTopic(id: string, input: unknown, db: Db = defaultDb) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Invalid topic update.");
  const {
    expectedVersion,
    acknowledgeChapterChange = false,
    ...fields
  } = input as Record<string, unknown>;
  if (typeof acknowledgeChapterChange !== "boolean")
    fail("Invalid chapter mapping acknowledgement.");
  if (!versionSchema.safeParse(expectedVersion).success) fail("Exact topic edit version required.");
  const parsed = updateTopicInputSchema.safeParse(fields);
  if (!parsed.success) fail("Invalid topic fields.");
  assertCanonicalTopicEdit(id,parsed.data!);
  try {
    const mappingGuard =
      parsed.data!.slug && !acknowledgeChapterChange
        ? sql`AND (${topicsTable.slug}=${parsed.data!.slug} OR NOT (${topicsTable.slug}=ANY(${sql.param(Object.keys(topicChapterBindings))}::text[])))`
        : sql``;
    const rows = await db
      .update(topicsTable)
      .set({
        ...parsed.data!,
        updatedAt: sql`greatest(clock_timestamp(),${topicsTable.updatedAt}+interval '1 microsecond')`,
      })
      .where(
        sql`${topicsTable.id}=${id}::uuid AND ${topicsTable.updatedAt}=${expectedVersion}::timestamptz ${mappingGuard}`,
      )
      .returning();
    if (!rows.length)
      throw new TopicError(
        409,
        "CONFLICT",
        "Topic changed, was removed, or its reviewed chapter mapping requires acknowledgement. Reload before saving; your draft is retained.",
      );
    return rows[0]!;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if ((err.code ?? err.cause?.code) === "23505")
      throw new TopicError(409, "CONFLICT", "A topic with this slug already exists.");
    throw e;
  }
}
export async function topicDetails(id: string, questionPage: unknown, db: Db = defaultDb) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .safeParse(questionPage ?? 1);
  if (!page.success) fail("Invalid question page.");
  return db.transaction(
    async (tx) => {
      const row = (
        await tx.execute(
          sql`SELECT t.id,t.name,t.slug,t.description,t.status,t.display_order AS "displayOrder",t.created_at AS "createdAt",t.updated_at AS "updatedAt",${versionSql} AS version,(SELECT count(*)::int FROM public.questions q WHERE q.topic_id=t.id) AS "questionCount",(SELECT count(*)::int FROM public.questions q WHERE q.topic_id=t.id AND q.status='ACTIVE') AS "publishedQuestionCount" FROM public.topics t WHERE t.id=${id}::uuid`,
        )
      ).rows[0];
      if (!row) throw new TopicError(404, "NOT_FOUND", "Topic not found.");
      const topic = managed(row),
        questionPages = Math.max(1, Math.ceil(topic.questionCount / 10)),
        effective = Math.min(page.data!, questionPages);
      const questions = (
        await tx.execute(
          sql`SELECT id,question_code AS "questionCode",text,difficulty,status FROM public.questions WHERE topic_id=${id}::uuid ORDER BY question_code,id LIMIT 10 OFFSET ${(effective - 1) * 10}`,
        )
      ).rows;
      const objectives = (
        await tx.execute(
          sql`SELECT c.id,c.code,t.name AS description,d.name AS domain,b.version FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id JOIN public.exam_blueprints b ON b.id=c.blueprint_id WHERE c.id=${id}::uuid`,
        )
      ).rows;
      return {
        topic,
        questions,
        questionPage: effective,
        questionPages,
        objectives: objectives.slice(0, 100),
        objectivesTruncated: objectives.length > 100,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function previewTopicDependencies(input: unknown, db: Db = defaultDb) {
  const parsed = deleteIdsSchema.safeParse(input);
  if (!parsed.success) fail("Select 1–500 distinct topic UUIDs.");
  const ids = parsed.data!.ids.map((id) => id.toLowerCase());
  const rows = (
    await db.execute<any>(sql`WITH selected AS (SELECT id,name,slug FROM public.topics WHERE id=ANY(${sql.param(ids)}::uuid[])),
    questions AS (SELECT q.topic_id,count(*)::int AS total,count(*) FILTER(WHERE status='ACTIVE')::int AS published FROM public.questions q JOIN selected t ON t.id=q.topic_id GROUP BY q.topic_id),
    attempts AS (SELECT a.topic_id,count(*)::int AS total FROM public.practice_attempts a JOIN selected t ON t.id=a.topic_id GROUP BY a.topic_id),
    revisions AS (SELECT r.snapshot->'topic'->>'id' AS topic_id,count(*)::int AS total FROM public.question_revisions r JOIN selected t ON t.id::text=r.snapshot->'topic'->>'id' GROUP BY r.snapshot->'topic'->>'id')
    SELECT t.*,coalesce(q.total,0) AS "questionCount",coalesce(q.published,0) AS "publishedQuestionCount",coalesce(a.total,0) AS attempts,coalesce(r.total,0) AS "revisionSnapshots" FROM selected t LEFT JOIN questions q ON q.topic_id=t.id LEFT JOIN attempts a ON a.topic_id=t.id LEFT JOIN revisions r ON r.topic_id=t.id::text ORDER BY t.id`)
  ).rows;
  return {
    items: rows.map((r) => ({
      ...r,
      blocked: r.questionCount > 0 || r.attempts > 0 || r.revisionSnapshots > 0,
    })),
    missingIds: ids.filter((id) => !rows.some((r) => r.id === id)),
  };
}
const bulkSchema = z
  .object({
    status: z.enum(["ACTIVE", "DISABLED"]),
    items: z
      .array(z.object({ id: z.string().uuid(), version: versionSchema }).strict())
      .min(1)
      .max(500)
      .refine((items) => new Set(items.map((i) => i.id.toLowerCase())).size === items.length),
  })
  .strict();
export async function bulkTopicStatus(input: unknown, db: Db = defaultDb) {
  const p = bulkSchema.safeParse(input);
  if (!p.success) fail("Select distinct topic IDs with their current versions and a valid status.");
  const data = p.data!;
  const items = data.items
    .map((i) => ({ ...i, id: i.id.toLowerCase() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    await tx.execute(
      sql`SELECT id FROM public.topics WHERE id=ANY(${sql.param(items.map((i) => i.id))}::uuid[]) ORDER BY id FOR UPDATE`,
    );
    const changed = (
      await tx.execute<{ id: string }>(
        sql`UPDATE public.topics t SET status=${data.status}::public.topic_status,updated_at=greatest(clock_timestamp(),t.updated_at+interval '1 microsecond') FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) s(id uuid,version timestamptz) WHERE t.id=s.id AND t.updated_at=s.version RETURNING t.id`,
      )
    ).rows;
    return {
      items: items.map((i) => ({
        id: i.id,
        outcome: changed.some((c) => c.id === i.id) ? "UPDATED" : "BLOCKED",
        reason: changed.some((c) => c.id === i.id)
          ? "Topic visibility updated; questions and history unchanged."
          : "Topic changed or was removed; refresh and select it again.",
      })),
      updated: changed.length,
      blocked: items.length - changed.length,
    };
  });
}
