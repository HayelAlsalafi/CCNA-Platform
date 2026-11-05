import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";

export class CatalogError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const uuid = z.string().uuid();
const pageInput = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1) });
type Read = (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
const limit = 20;

/** Only metadata. Never a replacement for learner/content authorization. */
export function createCourseCatalog(read: Read, enabled: () => boolean) {
  function ready() {
    if (!enabled()) throw new CatalogError(503, "CATALOG_NOT_READY", "Course catalog is not activated.");
  }
  function id(input: unknown) {
    const result = uuid.safeParse(input);
    if (!result.success) throw new CatalogError(400, "VALIDATION_ERROR", "Valid catalog identity required.");
    return result.data;
  }
  function page(input: unknown) {
    const result = pageInput.safeParse(input);
    if (!result.success) throw new CatalogError(400, "VALIDATION_ERROR", "Invalid catalog pagination.");
    return result.data.page;
  }
  async function requireRow(query: SQL) {
    const row = (await read(query)).rows[0];
    if (!row) throw new CatalogError(404, "NOT_FOUND", "Catalog context is unavailable.");
    return row;
  }
  return {
    async tracks(input: unknown) {
      ready(); const p = page(input);
      return { page: p, pageSize: limit, items: (await read(sql`
        SELECT id,slug,title,description FROM public.tracks WHERE status='ACTIVE'
        ORDER BY display_order,id LIMIT ${limit} OFFSET ${(p-1)*limit}`)).rows };
    },
    async courses(track: unknown, input: unknown) {
      ready(); const trackId = id(track), p = page(input);
      await requireRow(sql`SELECT id FROM public.tracks WHERE id=${trackId}::uuid AND status='ACTIVE'`);
      return { page: p, pageSize: limit, items: (await read(sql`
        SELECT c.id,c.slug,c.title,c.description FROM public.courses c JOIN public.tracks t ON t.id=c.track_id
        WHERE c.track_id=${trackId}::uuid AND c.status='ACTIVE' AND t.status='ACTIVE'
        ORDER BY c.display_order,c.id LIMIT ${limit} OFFSET ${(p-1)*limit}`)).rows };
    },
    async versions(course: unknown, input: unknown) {
      ready(); const courseId = id(course), p = page(input);
      await requireRow(sql`SELECT c.id FROM public.courses c JOIN public.tracks t ON t.id=c.track_id
        WHERE c.id=${courseId}::uuid AND c.status='ACTIVE' AND t.status='ACTIVE'`);
      return { page: p, pageSize: limit, items: (await read(sql`
        SELECT v.id,v.version_key AS "versionKey",v.title,v.description
        FROM public.course_versions v JOIN public.exam_blueprints b ON b.id=v.blueprint_id
        JOIN public.courses c ON c.id=v.course_id JOIN public.tracks t ON t.id=c.track_id
        WHERE v.course_id=${courseId}::uuid AND v.status='ACTIVE' AND b.status='ACTIVE' AND c.status='ACTIVE' AND t.status='ACTIVE'
        ORDER BY v.display_order,v.id LIMIT ${limit} OFFSET ${(p-1)*limit}`)).rows };
    },
    async context(course: unknown, version: unknown) {
      ready(); const courseId = id(course), versionId = id(version);
      // One statement gives a consistent context snapshot; no TOCTOU parent recheck gap.
      return requireRow(sql`
        SELECT v.id AS "versionId",c.id AS "courseId",t.id AS "trackId",v.title,
          v.blueprint_id AS "blueprintId",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'title',d.name) ORDER BY d.code)
            FROM public.exam_domains d WHERE d.blueprint_id=v.blueprint_id),'[]'::jsonb) AS domains,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ch.id,'code',ch.code,'title',tp.name,
            'domainId',ch.domain_id,'volume',ch.volume,'chapterNumber',ch.chapter_number)
            ORDER BY ch.volume,ch.chapter_number,ch.id)
            FROM public.curriculum_chapters ch JOIN public.topics tp ON tp.id=ch.id
            WHERE ch.course_version_id=v.id AND ch.blueprint_id=v.blueprint_id AND tp.status='ACTIVE'), '[]'::jsonb) AS chapters
        FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        JOIN public.tracks t ON t.id=c.track_id JOIN public.exam_blueprints b ON b.id=v.blueprint_id
        WHERE v.id=${versionId}::uuid AND c.id=${courseId}::uuid
          AND v.status='ACTIVE' AND c.status='ACTIVE' AND t.status='ACTIVE' AND b.status='ACTIVE'`);
    },
  };
}
export const courseCatalog = createCourseCatalog(query => db.execute(query), () => process.env.COURSE_CATALOG_ENABLED === "true");
