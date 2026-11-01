import { sql, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  topicsTable,
  curriculumChaptersTable,
  examDomainsTable,
  examBlueprintsTable,
} from "@workspace/db";
import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { AdminContentError, parse } from "./admin-content-validation";
type Db = typeof db;
export async function canonicalInstalled(database: Db = db) {
  return (
    (
      await database.execute<{ ready: boolean }>(
        sql`SELECT to_regclass('public.curriculum_chapters') IS NOT NULL AS ready`,
      )
    ).rows[0]?.ready === true
  );
}
export async function chapterCatalog(database: Db = db) {
  if (!(await canonicalInstalled(database))) return { canonicalReady: false, chapters: [] };
  const chapters = (
    await database.execute(
      sql`SELECT c.id,c.code,c.volume,c.chapter_number AS "chapterNumber",c.domain_id AS "domainId",c.domain_code AS "domainCode",c.blueprint_id AS "blueprintId",t.name AS title,t.slug,t.description,t.status,t.display_order AS "displayOrder",to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version,(SELECT count(*)::int FROM public.questions q WHERE q.topic_id=c.id) AS "questionCount" FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id ORDER BY c.domain_code,c.volume,c.chapter_number`,
    )
  ).rows;
  return { canonicalReady: true, chapters };
}
export async function saveChapter(input: unknown, id?: string, database: Db = db) {
  const data = parse(
    z.strictObject({
      code: z.string(),
      description: z.string().trim().max(2000),
      status: z.enum(["ACTIVE", "DISABLED"]),
      displayOrder: z.number().int().min(0).max(100000),
      expectedVersion: z.string().datetime({ precision: 6 }).optional(),
    }),
    input,
  );
  const chapter = ccnaBookChapters.find((c) => c.code === data.code);
  if (!chapter || (id && chapter.topicId !== id))
    throw new AdminContentError(
      400,
      "VALIDATION_ERROR",
      "Select an exact canonical chapter code. Titles, volume, number and primary domain are fixed.",
    );
  if (!(await canonicalInstalled(database)))
    throw new AdminContentError(
      409,
      "MIGRATION_REQUIRED",
      "Canonical chapter reset has not been applied.",
    );
  return database.transaction(async (tx) => {
    if (id) {
      if (!data.expectedVersion)
        throw new AdminContentError(400, "VALIDATION_ERROR", "Exact edit version required.");
      const result = await tx
        .update(topicsTable)
        .set({
          description: data.description,
          status: data.status,
          displayOrder: data.displayOrder,
          updatedAt: sql`greatest(clock_timestamp(),${topicsTable.updatedAt}+interval '1 microsecond')`,
        })
        .where(
          sql`${topicsTable.id}=${id}::uuid AND ${topicsTable.updatedAt}=${data.expectedVersion}::timestamptz AND EXISTS(SELECT 1 FROM public.curriculum_chapters c WHERE c.id=${id}::uuid AND c.code=${data.code})`,
        )
        .returning();
      if (!result.length)
        throw new AdminContentError(
          409,
          "CONFLICT",
          "Chapter changed or was removed. Reload before saving; your draft is retained.",
        );
      return result[0];
    }
    const [domain] = await tx
      .select({ id: examDomainsTable.id, blueprintId: examDomainsTable.blueprintId })
      .from(examDomainsTable)
      .innerJoin(examBlueprintsTable, eq(examBlueprintsTable.id, examDomainsTable.blueprintId))
      .where(
        sql`${examBlueprintsTable.examCode}='200-301' AND ${examBlueprintsTable.version}='1.1' AND ${examDomainsTable.code}=${chapter.primaryDomain}`,
      )
      .limit(1);
    if (!domain) throw new AdminContentError(409, "NOT_READY", "The canonical domain is missing.");
    const [topic] = await tx
      .insert(topicsTable)
      .values({
        id: chapter.topicId,
        slug: chapter.slug,
        name: chapter.title,
        description: data.description,
        status: data.status,
        displayOrder: data.displayOrder,
      })
      .returning();
    await tx
      .insert(curriculumChaptersTable)
      .values({
        id: chapter.topicId,
        code: chapter.code,
        volume: chapter.volume,
        chapterNumber: chapter.chapterNumber,
        domainCode: chapter.primaryDomain,
        domainId: domain.id,
        blueprintId: domain.blueprintId,
      });
    return topic;
  });
}
