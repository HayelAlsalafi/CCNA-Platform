import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", () => ({ db: { execute: () => { throw Error("Offline: real DB forbidden"); } } }));
import { createCourseCatalog } from "./course-catalog";
import { curriculumChaptersTable, courseVersionsTable, legacyCcnaCatalog } from "@workspace/db/schema";
const dialect = new PgDialect(), course = legacyCcnaCatalog.courseId, version = legacyCcnaCatalog.versionId;
const proposal = (name: string) => readFileSync(new URL(`../../../../lib/db/drizzle/proposed/${name}`, import.meta.url), "utf8");

it("fails closed before querying when not activated", async () => {
  const read = vi.fn(), api = createCourseCatalog(read, () => false);
  for (const run of [() => api.tracks({}), () => api.courses(course, {}), () => api.versions(course, {}), () => api.context(course, version)])
    await expect(run()).rejects.toMatchObject({ status: 503, code: "CATALOG_NOT_READY" });
  expect(read).not.toHaveBeenCalled();
});
it("rejects invalid identities, arbitrary context injection and unbounded pagination without SQL", async () => {
  const read = vi.fn(), api = createCourseCatalog(read, () => true);
  for (const input of [{ page: 0 }, { page: 10001 }, { page: "NaN" }, { page: 1, courseId: course }, { page: [1,2] }])
    await expect(api.tracks(input)).rejects.toMatchObject({ status: 400 });
  await expect(api.context("200-301", version)).rejects.toMatchObject({ status: 400 });
  expect(read).not.toHaveBeenCalled();
});
it("keeps listings bounded and rechecks every ancestor lifecycle in the data statement", async () => {
  const read = vi.fn().mockResolvedValue({ rows: [{ id: course }] }), api = createCourseCatalog(read, () => true);
  const result = await api.versions(course, { page: "2" });
  expect(result.pageSize).toBe(20);
  const q = dialect.sqlToQuery(read.mock.calls[1][0]);
  expect(q.params).toEqual([course, 20, 20]);
  for (const gate of ["v.status='ACTIVE'", "b.status='ACTIVE'", "c.status='ACTIVE'", "t.status='ACTIVE'"]) expect(q.sql).toContain(gate);
});
it("rejects mismatched/unpublished contexts and never falls back to an unscoped catalog", async () => {
  const read = vi.fn().mockResolvedValue({ rows: [] }), api = createCourseCatalog(read, () => true);
  await expect(api.context(course, version)).rejects.toMatchObject({ status: 404 });
  expect(read).toHaveBeenCalledTimes(1);
  const q = dialect.sqlToQuery(read.mock.calls[0][0]);
  expect(q.params).toEqual([version, course]);
  for (const predicate of ["ch.course_version_id=v.id", "ch.blueprint_id=v.blueprint_id", "tp.status='ACTIVE'", "c.id=", "v.id="]) expect(q.sql).toContain(predicate);
  expect(q.sql).toContain("'title',d.name");
  expect(q.sql).not.toMatch(/answers|questions|lesson_revisions|role_assignments/);
});
it("returns original metadata/IDs without translating content or changing routes", async () => {
  const row = { versionId: version, chapters: [{ id: "existing-topic-id", title: "Original title" }] };
  const read = vi.fn().mockResolvedValue({ rows: [row] });
  expect(await createCourseCatalog(read, () => true).context(course, version)).toBe(row);
});
it("binds chapter and blueprint relationally while preserving existing canonical protections", () => {
  const config = getTableConfig(curriculumChaptersTable);
  expect(config.columns.find(c => c.name === "course_version_id")?.notNull).toBe(false);
  const fk = config.foreignKeys.find(f => f.getName() === "curriculum_chapters_course_version_fk")!;
  expect(fk.onDelete).toBe("restrict");
  expect(fk.reference().foreignColumns).toEqual([courseVersionsTable.id, courseVersionsTable.blueprintId]);
  expect(config.checks.map(c => c.name)).toEqual(["curriculum_chapters_canonical_ck", "curriculum_chapters_number_ck", "curriculum_chapters_code_ck"]);
});
it("prepares only narrow reads and immutable binding guards; COURSE RBAC stays disabled", () => {
  const sql = proposal("0019_course_catalog.sql");
  expect(sql).toContain("GRANT SELECT ON TABLE public.tracks, public.courses, public.course_versions TO ccna_phase6a_app");
  expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)|DROP |DISABLE TRIGGER|SECURITY DEFINER|CREATE POLICY/i);
  expect(sql).toContain("OLD.course_version_id IS NOT NULL");
  expect(sql).toContain("current_user <> 'ccna_phase6a_migrator'");
  expect(sql).toContain("SET search_path=pg_catalog");
  expect(sql).not.toMatch(/CHECK[^;]+205da5ff/s);
});
it("pins all 48 original chapter tuples and only backfills the new nullable binding", () => {
  const sql = proposal("0020_ccna_catalog_backfill.sql");
  const canonical = JSON.parse(readFileSync(new URL("../../../../lib/canonical-chapters.json", import.meta.url), "utf8"));
  const pinned = JSON.parse(sql.match(/expected jsonb := '(.*?)'::jsonb/s)![1]);
  expect(pinned).toEqual(canonical.chapters.map((c: any) => ({id:c.topicId,code:c.code,volume:c.volume,number:c.chapterNumber,domain:c.primaryDomain,slug:c.slug})));
  expect(new Set(pinned.map((c: any) => c.id)).size).toBe(48);
  for (const id of [legacyCcnaCatalog.trackId, course, version]) expect(sql).toContain(id);
  expect(sql).toContain("changed<>48");
  expect(sql.match(/UPDATE public\.[a-z_]+ SET/g)).toEqual(["UPDATE public.curriculum_chapters SET"]);
  expect(sql).not.toMatch(/DELETE FROM|ON CONFLICT|SET status|INSERT INTO public\.(?:topics|questions|lessons|users)/i);
  expect(sql.match(/,'DRAFT'\)/g)).toHaveLength(3);
});
