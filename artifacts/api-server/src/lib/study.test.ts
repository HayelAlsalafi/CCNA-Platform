import { it, expect, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  lessonStudy,
  createAnnotation,
  changeAnnotation,
  saveProgress,
  studyProgress,
} from "./study";
import { annotationInput, progressInput } from "./study-validation";
import { validAnchor, completionPercent } from "../../../../lib/lesson-study";
import {
  lessonAnnotationsTable,
  lessonProgressTable,
  lessonMediaTable,
} from "@workspace/db/schema";
import {
  GetStudyLessonResponse,
  CreateStudyAnnotationResponse,
} from "../../../../lib/api-zod/src/study/api";
import { GetPublishedLessonResponse } from "@workspace/api-zod";
import { lessonInputSchema } from "./lesson-validation";
const actor = "11111111-1111-4111-8111-111111111111",
  lesson = "22222222-2222-4222-8222-222222222222",
  revision = "33333333-3333-4333-8333-333333333333",
  block = "44444444-4444-4444-8444-444444444444";
const blocks = [{ id: block, type: "paragraph", text: "TCP provides reliable transport." }],
  anchor = { blockId: block, start: 0, end: 3, quote: "TCP" };
const record = {
  id: block,
  lessonId: lesson,
  revisionId: revision,
  kind: "NOTE",
  anchor: null,
  body: "Private note",
  color: null,
  category: "review",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function fake(respond: (q: string, p: unknown[]) => Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: vi.fn(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const q = new PgDialect().sqlToQuery(statement);
      calls.push(q);
      return { rows: respond(q.sql, q.params) };
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { calls, db: db as never, raw: db };
}
const current = { id: lesson, revisionId: revision, snapshot: { blocks } };
it("fails closed before reading or writing personal data when tables are absent", async () => {
  const f = fake(() => [{ ready: false }]);
  await expect(lessonStudy(actor, lesson, f.db)).rejects.toMatchObject({
    status: 503,
    code: "STUDY_NOT_READY",
  });
  expect(f.calls).toHaveLength(1);
  expect(f.raw.transaction).not.toHaveBeenCalled();
});
it("anchors exact text within a stable block and never matches another revision implicitly", () => {
  expect(validAnchor(anchor, blocks)).toBe(true);
  expect(validAnchor({ ...anchor, quote: "UDP" }, blocks)).toBe(false);
  expect(validAnchor({ ...anchor, blockId: lesson }, blocks)).toBe(false);
  expect(validAnchor({ ...anchor, start: -1 }, blocks)).toBe(false);
  expect(validAnchor({ blockId: block, start: 0, end: 0, quote: "" }, blocks)).toBe(true);
});
it("rejects owner spoofing and malformed highlights before a query", () => {
  expect(
    annotationInput.safeParse({
      lessonId: lesson,
      revisionId: revision,
      kind: "NOTE",
      body: "note",
      userId: actor,
    }).success,
  ).toBe(false);
  expect(
    annotationInput.safeParse({
      lessonId: lesson,
      revisionId: revision,
      kind: "HIGHLIGHT",
      anchor,
      color: null,
    }).success,
  ).toBe(false);
  expect(
    progressInput.safeParse({
      lessonId: lesson,
      revisionId: revision,
      action: "auto-complete",
      version: 0,
    }).success,
  ).toBe(false);
});
it("rejects a changed revision and mismatched selected text before annotation INSERT", async () => {
  const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : [current]));
  await expect(
    createAnnotation(
      actor,
      { lessonId: lesson, revisionId: lesson, kind: "HIGHLIGHT", anchor, color: "yellow" },
      f.db,
    ),
  ).rejects.toMatchObject({ code: "STUDY_REVISION_CHANGED" });
  await expect(
    createAnnotation(
      actor,
      {
        lessonId: lesson,
        revisionId: revision,
        kind: "HIGHLIGHT",
        anchor: { ...anchor, quote: "UDP" },
        color: "yellow",
      },
      f.db,
    ),
  ).rejects.toMatchObject({ code: "STUDY_ANCHOR_CHANGED" });
  expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
});
it("sets owner context and binds owner and revision on highlight creation", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : q.includes("r.snapshot")
        ? [current]
        : q.startsWith("SELECT id FROM")
          ? []
          : q.startsWith("INSERT")
            ? [{ ...record, kind: "HIGHLIGHT", anchor, color: "yellow" }]
            : [],
  );
  const result = await createAnnotation(
    actor,
    { lessonId: lesson, revisionId: revision, kind: "HIGHLIGHT", anchor, color: "yellow" },
    f.db,
  );
  expect(result.annotation).toMatchObject({ anchor, color: "yellow" });
  expect(f.calls.find((c) => c.sql.includes("set_config"))?.params).toEqual([actor]);
  expect(f.calls.find((c) => c.sql.startsWith("INSERT"))?.params).toContain(actor);
});
it("never edits or deletes another learner item and rejects stale versions", async () => {
  const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : []));
  await expect(
    changeAnnotation(actor, block, { version: 1, body: "changed" }, false, f.db),
  ).rejects.toMatchObject({ status: 404 });
  const query = f.calls.find((c) => c.sql.includes("FOR UPDATE"))!;
  expect(query.sql).toContain("a.user_id=");
  expect(query.params).toContain(actor);
  expect(f.calls.some((c) => /^(DELETE|UPDATE)/.test(c.sql))).toBe(false);
  const stale = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : [record]));
  await expect(
    changeAnnotation(actor, block, { version: 2 }, true, stale.db),
  ).rejects.toMatchObject({ status: 409 });
});
it("edits only private fields and preserves revision/block ownership", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : q.startsWith("UPDATE")
        ? [{ ...record, body: "Updated private note", version: 2 }]
        : [record],
  );
  const result = await changeAnnotation(
    actor,
    block,
    { version: 1, body: "Updated private note" },
    false,
    f.db,
  );
  expect(result).toHaveProperty("annotation");
  const query = f.calls.find((c) => c.sql.startsWith("UPDATE"))!;
  expect(query.sql).not.toContain("revision_id=");
  expect(query.sql).not.toContain("lesson_id=");
  expect(query.params).toContain(actor);
});
it("position writes preserve completed state and never infer completion", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : q.includes("r.snapshot")
        ? [current]
        : q.includes("FOR UPDATE")
          ? [{ state: "COMPLETED", version: 2, blockId: block }]
          : q.startsWith("INSERT")
            ? [{ state: "COMPLETED", version: 3, blockId: block }]
            : [],
  );
  await saveProgress(
    actor,
    { lessonId: lesson, revisionId: revision, action: "position", blockId: block, version: 2 },
    f.db,
  );
  expect(f.calls.find((c) => c.sql.startsWith("INSERT"))?.params).toContain("COMPLETED");
});
it("requires start before position and allows explicit completion", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : q.includes("r.snapshot")
        ? [current]
        : q.startsWith("INSERT")
          ? [{ state: "COMPLETED", version: 1, blockId: null }]
          : [],
  );
  await expect(
    saveProgress(
      actor,
      { lessonId: lesson, revisionId: revision, action: "position", version: 0 },
      f.db,
    ),
  ).rejects.toMatchObject({ code: "STUDY_NOT_STARTED" });
  expect(
    await saveProgress(
      actor,
      { lessonId: lesson, revisionId: revision, action: "complete", version: 0 },
      f.db,
    ),
  ).toMatchObject({ progress: { state: "COMPLETED" } });
});
it("counts completion only against visible current revisions and never reads another owner progress", async () => {
  const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : []));
  await studyProgress(actor, {}, f.db);
  const query = f.calls.find((c) => c.sql.includes("count(*)"))!;
  expect(query.sql).toContain("p.revision_id=r.id");
  expect(query.sql).toContain("p.user_id=");
  expect(query.params).toContain(actor);
  expect(query.sql).toContain("t.status='ACTIVE'");
  expect(completionPercent(1, 3)).toBe(33);
  expect(completionPercent(0, 0)).toBe(0);
});
it("proposes only three additive tables with owner RLS and revision restrictions", () => {
  const sql = readFileSync(new URL("../../../../lib/db/drizzle/proposed/0014_interactive_study.sql",import.meta.url), "utf8");
  expect(sql.match(/CREATE TABLE/g)).toHaveLength(3);
  expect(sql).not.toMatch(/\b(DROP|TRUNCATE|GRANT|DELETE FROM)\b/);
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("current_setting('app.study_user',true)");
  for (const table of [lessonAnnotationsTable, lessonProgressTable, lessonMediaTable]) {
    const config = getTableConfig(table);
    for (const check of config.checks) expect(sql).toContain(check.name);
    for (const fk of config.foreignKeys) {
      expect(sql).toContain(fk.getName());
      expect(fk.onDelete).toBe("restrict");
    }
  }
  const journal=JSON.parse(readFileSync(new URL("../../../../lib/db/drizzle/meta/_journal.json",import.meta.url),"utf8"));
  expect(journal.entries[12]).toMatchObject({idx:12,tag:"0013_learning_lessons"});
  expect(journal.entries[13]).toMatchObject({idx:13,tag:"0014_interactive_study"});
  expect(journal.entries.at(-1)).toMatchObject({idx:16,tag:"0017_exam_simulator"});
  expect(journal.entries.map((entry:{idx:number})=>entry.idx)).toEqual(Array.from({length:17},(_,i)=>i));
});
it("keeps generated contracts aligned with current study payloads and enhanced immutable lesson blocks", () => {
  const annotation = {
    ...record,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
  expect(
    GetStudyLessonResponse.safeParse({
      revisionId: revision,
      annotations: [annotation],
      progress: { state: "NOT_STARTED", blockId: null, version: 0 },
    }).success,
  ).toBe(true);
  expect(CreateStudyAnnotationResponse.safeParse({ annotation }).success).toBe(true);
  const input = {
    chapterId: lesson,
    title: "Enhanced lesson",
    description: "",
    objectives: ["Read a safe image"],
    estimatedMinutes: 2,
    displayOrder: 0,
    blocks: [
      {
        id: block,
        type: "image",
        url: "/api/lesson-media/" + actor,
        alt: "",
        decorative: true,
        alignment: "right",
        width: "medium",
      },
      { id: revision, type: "heading", level: 4, text: "Details" },
      {
        id: actor,
        type: "richText",
        alignment: "center",
        runs: [{ text: "Review", underline: true, highlight: "pink", href: "/topics" }],
      },
    ],
  };
  expect(lessonInputSchema.safeParse(input).success).toBe(true);
  const payload = {
    lesson: {
      ...input,
      id: lesson,
      revisionId: revision,
      revisionNumber: 1,
      publishedRevisionId: revision,
      version: 1,
      status: "PUBLISHED",
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
      chapter: {
        id: lesson,
        title: "Chapter",
        bookReference: "V1 / Chapter 1",
        domainId: actor,
        domainName: "Fundamentals",
      },
    },
    previous: null,
    next: null,
  };
  expect(GetPublishedLessonResponse.safeParse(payload).success).toBe(true);
});
