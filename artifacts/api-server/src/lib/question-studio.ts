import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { sql, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db as defaultDb, questionsTable, questionOptionsTable } from "@workspace/db";
import {
  createQuestionInputSchema,
  validateQuestionObjectiveAssignments,
} from "@workspace/db/schema";
import { createAdminQuestion, updateAdminQuestion, toAdminQuestion } from "./questions-admin";
import { replaceQuestionAssignments, questionAssignments } from "./taxonomy-admin";
import { AdminContentError } from "./admin-content-validation";
import { curriculumDomains, topicChapterBindings } from "./curriculum-config";
import { deleteIdsSchema } from "./admin-delete";
type Db = typeof defaultDb;
const chapters = curriculumDomains.flatMap((d) =>
  d.sections.flatMap((s) => s.chapters.map((c) => ({ ...c, domainId: d.id }))),
);
const bindings = Object.entries(topicChapterBindings).flatMap(([slug, ids]) =>
  ids.map((chapterId) => ({ slug, chapterId })),
);
const bad = (message: string): never => {
  throw new AdminContentError(400, "VALIDATION_ERROR", message);
};
const conflict = (message: string): never => {
  throw new AdminContentError(409, "CONFLICT", message);
};
const sorts = {
  createdAt: "q.created_at",
  updatedAt: "q.updated_at",
  code: "q.question_code",
  difficulty: "q.difficulty",
  status: "q.status",
};
export const studioQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => [10, 25, 50].includes(n))
    .default(25),
  search: z.string().trim().max(180).default(""),
  topicId: z.uuid().optional(),
  domainId: z.uuid().optional(),
  objectiveId: z.never().optional(),
  chapterId: z
    .string()
    .refine((v) => chapters.some((c) => c.id === v))
    .optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  mapping: z.enum(["full", "chapter"]).optional(),
  sort: z.enum(["createdAt", "updatedAt", "code", "difficulty", "status"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export function parseStudioQuery(input: unknown) {
  const p = studioQuerySchema.safeParse(input);
  if (!p.success) bad("Invalid question search, filters, sort or page.");
  return p.data!;
}
// Epoch numerics keep every timestamp's microseconds while making the token
// independent of the connection's TimeZone/DateStyle presentation settings.
const token = sql`encode(sha256(convert_to(jsonb_build_object('question',(SELECT to_jsonb(original)||jsonb_build_object('created_at',extract(epoch from original.created_at),'updated_at',extract(epoch from original.updated_at)) FROM public.questions original WHERE original.id=q.id),'options',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('created_at',extract(epoch from a.created_at),'updated_at',extract(epoch from a.updated_at)) ORDER BY a.display_order,a.id) FROM public.question_options a WHERE a.question_id=q.id),'[]'::jsonb),'assignments',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.blueprint_id,m.objective_id) FROM public.question_objectives m WHERE m.question_id=q.id),'[]'::jsonb))::text,'UTF8')),'hex')`;
function filter(p: ReturnType<typeof parseStudioQuery>) {
  const pattern = "%" + p.search.replace(/[\\%_]/g, "\\$&") + "%";
  return sql`WITH bindings AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(bindings)}::jsonb) b(slug text,"chapterId" text)), filtered AS (SELECT q.*,t.name AS "topicName",t.slug AS "topicSlug" FROM public.questions q JOIN public.topics t ON t.id=q.topic_id WHERE true
  ${p.search ? sql`AND (to_tsvector('simple',q.text) @@ websearch_to_tsquery('simple',${p.search}) OR q.text ILIKE ${pattern} ESCAPE ${"\\"} OR q.question_code ILIKE ${pattern} ESCAPE ${"\\"})` : sql``}
  ${p.topicId ? sql`AND q.topic_id=${p.topicId}::uuid` : sql``}${p.status ? sql`AND q.status=${p.status}::public.question_status` : sql``}${p.difficulty ? sql`AND q.difficulty=${p.difficulty}::public.question_difficulty` : sql``}

  ${p.domainId ? sql`AND EXISTS(SELECT 1 FROM public.curriculum_chapters c WHERE c.id=q.topic_id AND c.domain_id=${p.domainId}::uuid)` : sql``}
  ${p.chapterId ? sql`AND EXISTS(SELECT 1 FROM bindings b WHERE b.slug=t.slug AND b."chapterId"=${p.chapterId})` : sql``}

  ${p.mapping === "chapter" ? sql`AND NOT EXISTS(SELECT 1 FROM bindings b WHERE b.slug=t.slug)` : sql``}
  ${p.mapping === "full" ? sql`AND EXISTS(SELECT 1 FROM bindings b WHERE b.slug=t.slug) ` : sql``})`;
}
export async function listStudioQuestions(input: unknown, db: Db = defaultDb) {
  const p = parseStudioQuery(input),
    prefix = filter(p);
  return db.transaction(
    async (tx) => {
      const meta = (
        await tx.execute<any>(
          sql`${prefix} SELECT (SELECT count(*)::int FROM filtered) AS total,(SELECT jsonb_build_object('total',count(*),'active',count(*) FILTER(WHERE status='ACTIVE'),'disabled',count(*) FILTER(WHERE status='DISABLED'),'missingChapters',count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.curriculum_chapters c WHERE c.id=q.topic_id)),'easy',count(*) FILTER(WHERE difficulty='EASY'),'medium',count(*) FILTER(WHERE difficulty='MEDIUM'),'hard',count(*) FILTER(WHERE difficulty='HARD')) FROM public.questions q) AS stats`,
        )
      ).rows[0];
      const totalPages = Math.max(1, Math.ceil(meta.total / p.pageSize)),
        page = Math.min(p.page, totalPages);
      const items = (
        await tx.execute<any>(sql`${prefix}, paged AS (SELECT * FROM filtered q ORDER BY ${sql.raw(sorts[p.sort])} ${sql.raw(p.direction.toUpperCase())},q.id LIMIT ${p.pageSize} OFFSET ${(page - 1) * p.pageSize})
    SELECT q.id,q.question_code AS "questionCode",left(q.text,600) AS text,q.topic_id AS "topicId",q."topicName",q."topicSlug",q.difficulty,q.status,q.created_at AS "createdAt",q.updated_at AS "updatedAt",${token} AS "editToken",'[]'::jsonb AS objectives FROM paged q ORDER BY ${sql.raw(sorts[p.sort])} ${sql.raw(p.direction.toUpperCase())},q.id`)
      ).rows;
      return {
        items: items.map((q) => ({
          ...q,
          createdAt: new Date(q.createdAt).toISOString(),
          updatedAt: new Date(q.updatedAt).toISOString(),
          chapterIds: topicChapterBindings[q.topicSlug] ?? [],
        })),
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
export async function studioLookup(input: unknown, db: Db = defaultDb) {
  const p = z
    .strictObject({
      kind: z.enum(["topics", "objectives"]),
      search: z.string().trim().max(180).default(""),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      domainId: z.uuid().optional(),
      chapterId: z
        .string()
        .refine((v) => chapters.some((c) => c.id === v))
        .optional(),
    })
    .safeParse(input);
  if (!p.success) bad("Invalid relationship lookup.");
  const { kind, search, page, domainId, chapterId } = p.data!,
    pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  if(kind === "objectives") throw new AdminContentError(410,"RETIRED_CLASSIFICATION","Select a canonical chapter instead of an objective.");
  const slugs = chapterId
    ? Object.entries(topicChapterBindings)
        .filter(([, ids]) => ids.includes(chapterId))
        .map(([slug]) => slug)
    : [];
  const items = (
    await db.execute<any>(
      kind === "topics"
        ? sql`SELECT t.id,c.code||' - '||t.name AS label,t.slug,t.status FROM public.topics t JOIN public.curriculum_chapters c ON c.id=t.id WHERE (t.name ILIKE ${pattern} ESCAPE ${"\\"} OR c.code ILIKE ${pattern} ESCAPE ${"\\"} OR t.slug ILIKE ${pattern} ESCAPE ${"\\"}) ${chapterId ? sql`AND t.slug=ANY(${sql.param(slugs)}::text[])` : sql``} ${domainId ? sql`AND c.domain_id=${domainId}::uuid` : sql``} ORDER BY t.display_order,t.name,t.id LIMIT 26 OFFSET ${(page - 1) * 25}`
        : sql`SELECT o.id,o.code||' '||o.description||' · '||b.version AS label,o.blueprint_id AS "blueprintId",o.domain_id AS "domainId",o.code FROM public.exam_objectives o JOIN public.exam_blueprints b ON b.id=o.blueprint_id WHERE (o.code ILIKE ${pattern} ESCAPE ${"\\"} OR o.description ILIKE ${pattern} ESCAPE ${"\\"}) ${domainId ? sql`AND o.domain_id=${domainId}::uuid` : sql``} ORDER BY o.code,o.id LIMIT 26 OFFSET ${(page - 1) * 25}`,
    )
  ).rows;
  return {
    items: items.slice(0, 25).map((r) => ({
      ...r,
      ...(r.slug ? { chapterIds: topicChapterBindings[r.slug] ?? [] } : {}),
    })),
    hasMore: items.length > 25,
    page,
  };
}
async function editToken(id: string, db: Db) {
  return (
    await db.execute<{ editToken: string }>(
      sql`SELECT ${token} AS "editToken" FROM public.questions q WHERE q.id=${id}::uuid`,
    )
  ).rows[0]?.editToken;
}
async function lockQuestion(id: string, expected: string, db: Db) {
  const rows = (
    await db.execute(sql`SELECT id FROM public.questions WHERE id=${id}::uuid FOR UPDATE`)
  ).rows;
  if (!rows.length) throw new AdminContentError(404, "NOT_FOUND", "Question not found.");
  if ((await editToken(id, db)) !== expected)
    conflict("Question or mappings changed. Reload before saving; your draft is retained.");
}
export async function studioQuestionDetails(
  id: string,
  revisionPage: unknown = 1,
  db: Db = defaultDb,
) {
  const page = z.coerce.number().int().min(1).max(10000).safeParse(revisionPage);
  if (!page.success) bad("Invalid revision page.");
  return db.transaction(
    async (tx) => {
      const [q] = await tx.select().from(questionsTable).where(eq(questionsTable.id, id)).limit(1);
      if (!q) throw new AdminContentError(404, "NOT_FOUND", "Question not found.");
      const options = await tx
        .select()
        .from(questionOptionsTable)
        .where(eq(questionOptionsTable.questionId, id));
      const info = (
        await tx.execute<any>(
          sql`SELECT t.name,t.slug,(SELECT count(*)::int FROM public.question_revisions r WHERE r.question_id=${id}::uuid) AS "revisionCount" FROM public.topics t WHERE t.id=${q.topicId}::uuid`,
        )
      ).rows[0];
      const assignments: {objectiveId:string;blueprintId:string;isPrimary:boolean}[] = [],
        objectiveDetails: unknown[] = [],
        revisions = (
          await tx.execute(
            sql`SELECT id,content_hash AS "contentHash",created_at AS "createdAt" FROM public.question_revisions WHERE question_id=${id}::uuid ORDER BY created_at DESC,id LIMIT 20 OFFSET ${(page.data! - 1) * 20}`,
          )
        ).rows;
      return {
        question: toAdminQuestion(q, options),
        editToken: await editToken(id, tx as unknown as Db),
        assignments: assignments.map(({ objectiveId, blueprintId, isPrimary }) => ({
          objectiveId,
          blueprintId,
          isPrimary,
        })),
        objectiveDetails,
        topicName: info.name,
        topicSlug: info.slug,
        chapterIds: topicChapterBindings[info.slug] ?? [],
        revisionCount: info.revisionCount,
        revisions,
        revisionPage: page.data!,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
const assignmentSchema = z.strictObject({
  objectiveId: z.uuid(),
  blueprintId: z.uuid(),
  isPrimary: z.boolean(),
});
export const studioSaveSchema = z.strictObject({
  question: createQuestionInputSchema,
  assignments: z.array(assignmentSchema).max(200).default([]),
  expectedToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  acknowledgeDuplicate: z.boolean().default(false),
});
export function validateStudioSave(input: unknown) {
  const p = studioSaveSchema.safeParse(input);
  if (!p.success)
    throw new AdminContentError(
      400,
      "VALIDATION_ERROR",
      "Invalid question fields, options or mappings.",
      p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  const data = p.data!,
    texts = data.question.options.map((o) => o.text.trim().replace(/\s+/g, " ").toLowerCase());
  if (new Set(texts).size !== texts.length) bad("Answer option text must be distinct.");
  if (data.question.status === "ACTIVE" && !data.question.explanation.trim())
    bad("Publication requires a useful answer explanation.");
  if (!ccnaBookChapters.some(c=>c.topicId===data.question.topicId)) bad("Select an exact canonical chapter.");
  if(data.assignments.length) bad("Objective assignments have been retired. Select a canonical chapter instead.");
  return data;
}
export async function studioDuplicates(input: unknown, db: Db = defaultDb) {
  const p = z
    .strictObject({
      topicId: z.uuid(),
      text: z.string().trim().min(1).max(10000),
      excludeId: z.uuid().optional(),
    })
    .safeParse(input);
  if (!p.success) bad("Choose a topic and enter question text to check duplicates.");
  const { topicId, text, excludeId } = p.data!;
  return {
    items: (
      await db.execute(
        sql`SELECT id,question_code AS "questionCode",left(text,200) AS text FROM public.questions WHERE topic_id=${topicId}::uuid AND lower(regexp_replace(btrim(text),${"\\s+"},' ','g'))=lower(regexp_replace(btrim(${text}),${"\\s+"},' ','g')) ${excludeId ? sql`AND id<>${excludeId}::uuid` : sql``} ORDER BY id LIMIT 6`,
      )
    ).rows,
  };
}
async function saveInTransaction(
  input: ReturnType<typeof validateStudioSave>,
  id: string | undefined,
  tx: Db,
) {
  if (id) {
    if (!input.expectedToken) bad("Exact edit token required.");
    await lockQuestion(id, input.expectedToken!, tx);
  }
  if (input.question.type === "MULTIPLE_CHOICE_MULTIPLE") {
    const capability = (
      await tx.execute<{ supported: boolean }>(
        sql`SELECT to_regtype('public.question_type_v2') IS NOT NULL AS supported`,
      )
    ).rows[0];
    if (!capability?.supported)
      throw new AdminContentError(
        409,
        "MIGRATION_REQUIRED",
        "Multiple Answers requires the separately approved question-type migration.",
      );
  }
  const topic = (
    await tx.execute<{ status: string }>(
      sql`SELECT status FROM public.topics WHERE id=${input.question.topicId}::uuid FOR SHARE`,
    )
  ).rows[0];
  if (!topic) bad("Topic does not exist.");
  if (input.question.status === "ACTIVE" && topic.status !== "ACTIVE")
    bad("Enable the topic before publishing this question.");
  const duplicates = await studioDuplicates(
    {
      topicId: input.question.topicId,
      text: input.question.text,
      ...(id ? { excludeId: id } : {}),
    },
    tx,
  );
  if (duplicates.items.length && !input.acknowledgeDuplicate)
    conflict("Possible duplicate question. Review it and explicitly acknowledge before saving.");
  const question = id
    ? await updateAdminQuestion(id, input.question, tx, true)
    : await createAdminQuestion(input.question, tx);
  return { question, editToken: await editToken(question.id, tx) };
}
export async function saveStudioQuestion(input: unknown, id?: string, db: Db = defaultDb) {
  if (id && (!input || typeof input !== "object" || !("assignments" in input)))
    bad(
      "Existing question edits require an explicit empty legacy assignments array; classification uses the chapter.",
    );
  const data = validateStudioSave(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    return saveInTransaction(data, id, tx as unknown as Db);
  });
}
const bulkSchema = z.strictObject({
  items: z
    .array(z.strictObject({ id: z.uuid(), editToken: z.string().regex(/^[a-f0-9]{64}$/) }))
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((i) => i.id.toLowerCase())).size === items.length),
  change: z.union([
    z.strictObject({ status: z.enum(["ACTIVE", "DISABLED"]) }),
    z.strictObject({ difficulty: z.enum(["EASY", "MEDIUM", "HARD"]) }),
    z.strictObject({ topicId: z.uuid() }),
  ]),
});
export async function bulkStudioQuestions(input: unknown, db: Db = defaultDb) {
  const p = bulkSchema.safeParse(input);
  if (!p.success)
    bad("Select distinct question IDs with exact edit tokens and one supported change.");
  const data = p.data!,
    items = [...data.items].sort((a, b) => a.id.localeCompare(b.id));
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout='5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
    await tx.execute(
      sql`SELECT id FROM public.questions WHERE id=ANY(${sql.param(items.map((i) => i.id))}::uuid[]) ORDER BY id FOR UPDATE`,
    );
    const results = [];
    for (const item of items) {
      try {
        await tx.transaction(async (child) => {
          const detail = await studioQuestionDetails(item.id, 1, child as unknown as Db);
          if (detail.editToken !== item.editToken)
            conflict("Question changed; refresh and select it again.");
          const {
            id: unused,
            questionCode: code,
            createdAt: created,
            updatedAt: updated,
            ...fields
          } = detail.question;
          await saveInTransaction(
            validateStudioSave({
              question: {
                ...fields,
                ...data.change,
                options: fields.options.map(({ optionKey, text, isCorrect }) => ({
                  optionKey,
                  text,
                  isCorrect,
                })),
              },
              assignments: detail.assignments,
              expectedToken: item.editToken,
              acknowledgeDuplicate: !(
                "topicId" in data.change && data.change.topicId !== detail.question.topicId
              ),
            }),
            item.id,
            child as unknown as Db,
          );
        });
        results.push({
          id: item.id,
          outcome: "UPDATED",
          reason: "Question updated; learner history preserved.",
        });
      } catch (e) {
        if (!(e instanceof AdminContentError)) throw e;
        results.push({ id: item.id, outcome: "BLOCKED", reason: e.message });
      }
    }
    return {
      items: results,
      updated: results.filter((r) => r.outcome === "UPDATED").length,
      blocked: results.filter((r) => r.outcome === "BLOCKED").length,
    };
  });
}
export async function studioDeletePreview(input: unknown, db: Db = defaultDb) {
  const p = deleteIdsSchema.safeParse(input);
  if (!p.success) bad("Select 1–500 distinct question UUIDs.");
  return {
    items: (
      await db.execute(
        sql`WITH selected AS (SELECT id,question_code AS "questionCode" FROM public.questions WHERE id=ANY(${sql.param(p.data!.ids)}::uuid[])),r AS (SELECT question_id,count(*)::int AS n FROM public.question_revisions WHERE question_id=ANY(${sql.param(p.data!.ids)}::uuid[]) GROUP BY question_id),d AS (SELECT question_id,count(*)::int AS n FROM public.practice_deliveries WHERE question_id=ANY(${sql.param(p.data!.ids)}::uuid[]) GROUP BY question_id),a AS (SELECT question_id,count(*)::int AS n FROM public.practice_attempts WHERE question_id=ANY(${sql.param(p.data!.ids)}::uuid[]) GROUP BY question_id) SELECT s.*,coalesce(r.n,0) AS revisions,coalesce(d.n,0) AS deliveries,coalesce(a.n,0) AS attempts FROM selected s LEFT JOIN r ON r.question_id=s.id LEFT JOIN d ON d.question_id=s.id LEFT JOIN a ON a.question_id=s.id ORDER BY s.id`,
      )
    ).rows,
  };
}

/** A read-only preview; save revalidates under write locks. Never a publication token. */
export async function studioReadiness(input: unknown, db: Db = defaultDb) {
  const request = z
    .strictObject({ draft: z.unknown(), questionId: z.uuid().optional() })
    .safeParse(input);
  if (!request.success) bad("Invalid readiness request.");
  try {
    const data = validateStudioSave(request.data!.draft);
    if (!data.question.explanation.trim()) bad("Publication requires a useful answer explanation.");
    return await db.transaction(
      async (tx) => {
        const topic = (
          await tx.execute<{ status: string; slug: string }>(
            sql`SELECT status,slug FROM public.topics WHERE id=${data.question.topicId}::uuid`,
          )
        ).rows[0];
        if (!topic) bad("Topic does not exist.");
        if (topic.status !== "ACTIVE") bad("Enable the topic before publishing this question.");
        if (data.question.type === "MULTIPLE_CHOICE_MULTIPLE") {
          const supported = (
            await tx.execute<{ supported: boolean }>(
              sql`SELECT to_regtype('public.question_type_v2') IS NOT NULL AS supported`,
            )
          ).rows[0];
          if (!supported?.supported)
            throw new AdminContentError(
              409,
              "MIGRATION_REQUIRED",
              "Multiple Answers requires the separately approved question-type migration.",
            );
        }
        const duplicates = await studioDuplicates(
          {
            topicId: data.question.topicId,
            text: data.question.text,
            ...(request.data!.questionId ? { excludeId: request.data!.questionId } : {}),
          },
          tx as unknown as Db,
        );
        if (duplicates.items.length && !data.acknowledgeDuplicate)
          bad("Review and acknowledge possible duplicates before publication.");
        return {
          ready: true,
          blockers: [],
          warnings: [
            ...(!topicChapterBindings[topic.slug]?.length
              ? ["No curriculum chapter for this topic; no placement will be guessed."]
              : []),
          ],
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (e) {
    if (e instanceof AdminContentError)
      return {
        ready: false,
        blockers: [
          e.message,
          ...(Array.isArray(e.details) ? e.details.map((d: { message: string }) => d.message) : []),
        ],
        warnings: [],
      };
    if (e instanceof z.ZodError)
      return { ready: false, blockers: e.issues.map((i) => i.message), warnings: [] };
    throw e;
  }
}
