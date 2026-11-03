import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { lessonsTable, lessonRevisionsTable } from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  lessonInputSchema,
  lessonUpdateSchema,
  lessonReorderSchema,
  assertPublishable,
} from "./lesson-validation";
import {
  lessonsReady,
  createLesson,
  updateLesson,
  publishLesson,
  publishedLesson,
  chapterLessonList,
  reorderLessons,
  adminLessonLibrary,
} from "./lessons";
import { GetChapterLessonsResponse, GetPublishedLessonResponse } from "@workspace/api-zod";
import { lessonLibraryQuerySchema } from "./lesson-validation";
const id = "11111111-1111-4111-8111-111111111111",
  chapter = "22222222-2222-4222-8222-222222222222",
  actor = "33333333-3333-4333-8333-333333333333";
const input = {
  chapterId: chapter,
  title: "Ethernet forwarding",
  description: "Learn switching",
  objectives: ["Explain MAC learning"],
  estimatedMinutes: 5,
  displayOrder: 0,
  blocks: [{ id, type: "paragraph" as const, text: "A switch learns source MAC addresses." }],
};
const row = {
  ...input,
  id,
  version: 1,
  publishedRevisionId: null,
  createdAt: new Date("2026-10-27T00:00:00Z"),
  updatedAt: new Date("2026-10-27T00:00:00Z"),
};
it("keeps the approved lesson migration additive with matching publication ownership FK", () => {
  const proposal = readFileSync(new URL("../../../../lib/db/drizzle/proposed/0013_learning_lessons.sql",import.meta.url), "utf8");
  const journal = JSON.parse(readFileSync(new URL("../../../../lib/db/drizzle/meta/_journal.json",import.meta.url), "utf8"));
  expect(journal.entries[12]).toMatchObject({idx:12,tag:"0013_learning_lessons"});
  expect(journal.entries[13]).toMatchObject({idx:13,tag:"0014_interactive_study"});
  expect(journal.entries.at(-1)).toMatchObject({idx:16,tag:"0017_exam_simulator"});
  expect(journal.entries.map((entry:{idx:number})=>entry.idx)).toEqual(Array.from({length:17},(_,i)=>i));
  expect(readFileSync(new URL("../../../../lib/db/drizzle/0013_learning_lessons.sql",import.meta.url), "utf8")).toBe(proposal);
  expect(proposal).not.toMatch(
    /\b(?:DROP|TRUNCATE)\b|(?:DELETE FROM|UPDATE|ALTER TABLE) public\.(?:questions|topics|practice_|users|curriculum_chapters)/i,
  );
  const key = getTableConfig(lessonsTable).foreignKeys.find(
    (fk) => fk.getName() === "lessons_published_revision_fk",
  )!;
  expect(key.reference().columns.map((c) => c.name)).toEqual(["published_revision_id", "id"]);
  expect(key.reference().foreignColumns.map((c) => c.name)).toEqual(["id", "lesson_id"]);
  expect(key.onDelete).toBe("restrict");
  expect(
    getTableConfig(lessonRevisionsTable).uniqueConstraints.some(
      (c) => c.name === "lesson_revisions_identity_uq",
    ),
  ).toBe(true);
  expect(proposal).toContain("BEFORE UPDATE OR DELETE ON public.lesson_revisions");
});
function fake(respond: (query: string, params: unknown[]) => Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const database = {
    execute: vi.fn(async (statement: SQL) => {
      const query = new PgDialect().sqlToQuery(statement);
      calls.push(query);
      return { rows: respond(query.sql, query.params) };
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(database)),
  };
  return {
    calls,
    database: database as unknown as NonNullable<Parameters<typeof createLesson>[2]>,
    raw: database,
  };
}
it("classifies malformed stored publication metadata as a server invariant, not bad user filters", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : [
          {
            ...row,
            snapshot: { title: "PRIVATE authored text", blocks: [], objectives: [] },
            revisionId: actor,
            revisionNumber: 1,
          },
        ],
  );
  await expect(chapterLessonList(chapter, f.database)).rejects.toMatchObject({
    status: 500,
    code: "LESSON_PUBLISHED_DATA_INVALID",
    details: expect.arrayContaining([{ path: "chapterId", code: expect.any(String) }]),
  });
  try {
    await chapterLessonList(chapter, f.database);
  } catch (error) {
    expect(JSON.stringify(error)).not.toContain("PRIVATE authored text");
  }
  expect(f.calls.every((call) => call.sql.trim().startsWith("SELECT"))).toBe(true);
});
it("paginates and filters studio metadata on the server with bound search values", async () => {
  const f = fake((q) =>
    q.includes("to_regclass")
      ? [{ ready: true }]
      : q.includes("count(DISTINCT")
        ? [{ total: 75, published: 40, drafts: 35, chapters: 5 }]
        : q.includes("count(*)")
          ? [{ total: 22 }]
          : [
              {
                ...row,
                domainId: actor,
                domainName: "Network Access",
                chapterTitle: "CLI",
                volume: "V1",
                chapterNumber: 2,
                publishedRevisionNumber: null,
              },
            ],
  );
  const result = await adminLessonLibrary(
    {
      q: "a%' OR 1=1",
      chapterId: chapter,
      domainId: actor,
      status: "DRAFT",
      volume: "V1",
      updatedAfter: "2026-10-01T00:00:00Z",
      page: 2,
      pageSize: 10,
    },
    f.database,
  );
  expect(result).toMatchObject({
    total: 22,
    page: 2,
    pageSize: 10,
    summary: { total: 75, published: 40, drafts: 35, chapters: 5 },
  });
  const query = f.calls.at(-1)!;
  expect(query.sql).not.toContain("OR 1=1");
  expect(query.params).toContain("a%' OR 1=1");
  expect(query.sql).toContain("published_revision_id IS NULL");
  expect(query.sql).toContain("LIMIT");
  expect(query.params.slice(-2)).toEqual([10, 10]);
  expect(query.sql).not.toContain("l.blocks");
  expect(query.sql).not.toContain("r.snapshot");
  expect(f.calls).toHaveLength(4);
  expect(f.raw.transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
it.each([
  { page: 0 },
  { pageSize: 500 },
  { status: "ARCHIVED" },
  { domainId: "fake" },
  { updatedAfter: "yesterday" },
  { unexpected: true },
])("rejects invalid studio query %j", (input) => {
  expect(lessonLibraryQuerySchema.safeParse(input).success).toBe(false);
});
describe("strict lesson content validation", () => {
  it("accepts stable sections, original chapter IDs and safe rich formatting", () => {
    expect(lessonInputSchema.parse(input)).toEqual(input);
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [
          {
            id,
            type: "richText",
            runs: [{ text: "Network", bold: true, href: "https://example.com/docs?q=ios#cli" }],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "https://#",
    "file:///secret",
    "https://user:password@example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [{ id, type: "image", url, alt: "diagram" }],
      }).success,
    ).toBe(false);
  });
  it("rejects raw HTML blocks and unrecognized executable properties", () => {
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [{ id, type: "html", html: "<script>alert(1)</script>" }],
      }).success,
    ).toBe(false);
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [{ ...input.blocks[0], onClick: "alert(1)" }],
      }).success,
    ).toBe(false);
  });
  it("retains HTML-like text literally rather than allowing HTML rendering", () => {
    expect(
      lessonInputSchema.parse({
        ...input,
        blocks: [{ ...input.blocks[0], text: "<script>alert(1)</script>" }],
      }).blocks[0],
    ).toHaveProperty("text", "<script>alert(1)</script>");
  });
  it("rejects duplicate section anchors", () =>
    expect(
      lessonInputSchema.safeParse({ ...input, blocks: [input.blocks[0], input.blocks[0]] }).success,
    ).toBe(false));
  it("requires rectangular bounded tables and an actual quiz answer", () => {
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [{ id, type: "table", headers: ["A", "B"], rows: [["one"]] }],
      }).success,
    ).toBe(false);
    expect(
      lessonInputSchema.safeParse({
        ...input,
        blocks: [
          {
            id,
            type: "knowledgeCheck",
            prompt: "Which?",
            choices: ["A", "B"],
            correctIndex: 2,
            explanation: "A",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("allows empty drafts but prevents empty publication", () => {
    const draft = { ...input, blocks: [], objectives: [] };
    expect(lessonInputSchema.safeParse(draft).success).toBe(true);
    expect(() => assertPublishable(draft)).toThrow("before publishing");
  });
  it("enforces optimistic version and unique reorder identities", () => {
    expect(lessonUpdateSchema.safeParse({ ...input, version: 0 }).success).toBe(false);
    expect(
      lessonReorderSchema.safeParse({
        chapterId: chapter,
        lessons: [
          { id, version: 1, displayOrder: 0 },
          { id, version: 1, displayOrder: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      lessonReorderSchema.safeParse({
        chapterId: chapter,
        lessons: [
          { id, version: 1, displayOrder: 0 },
          { id: actor, version: 1, displayOrder: 0 },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("lesson persistence boundaries without database access", () => {
  it("fails closed when lesson persistence is not installed", async () => {
    const f = fake(() => [{ ready: false }]);
    await expect(lessonsReady(f.database)).rejects.toMatchObject({
      status: 503,
      code: "LESSONS_NOT_READY",
    });
    expect(f.calls).toHaveLength(1);
  });
  it("creates only a draft and checks existing chapter FK target first", async () => {
    const f = fake((q) =>
      q.includes("to_regclass")
        ? [{ ready: true }]
        : q.includes("FROM public.curriculum_chapters")
          ? [{ id: chapter }]
          : [row],
    );
    const result = await createLesson(input, actor, f.database);
    expect(result.lesson.status).toBe("DRAFT");
    expect(f.calls.find((c) => c.sql.includes("INSERT INTO public.lessons"))?.params).toContain(
      actor,
    );
    expect(f.calls.some((c) => c.sql.includes("INSERT INTO public.lesson_revisions"))).toBe(false);
  });
  it("rejects nonexistent chapters without creating a lesson", async () => {
    const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : []));
    await expect(createLesson(input, actor, f.database)).rejects.toMatchObject({
      code: "INVALID_CHAPTER",
    });
    expect(f.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
  it("rejects stale edits before any write and locks the exact stable lesson ID", async () => {
    const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : [row]));
    await expect(updateLesson(id, input, 9, actor, f.database)).rejects.toMatchObject({
      status: 409,
      code: "LESSON_CONFLICT",
    });
    expect(f.calls.some((c) => c.sql.includes("FOR UPDATE") && c.params.includes(id))).toBe(true);
    expect(f.calls.some((c) => c.sql.includes("UPDATE public"))).toBe(false);
  });
  it("does not silently move a published lesson while saving a working draft", async () => {
    const f = fake((q) =>
      q.includes("to_regclass") ? [{ ready: true }] : [{ ...row, publishedRevisionId: actor }],
    );
    await expect(
      updateLesson(id, { ...input, chapterId: actor }, 1, actor, f.database),
    ).rejects.toMatchObject({ code: "UNPUBLISH_BEFORE_MOVE" });
    expect(f.calls.some((c) => c.sql.includes("UPDATE public"))).toBe(false);
  });
  it("publication inserts an immutable complete snapshot and advances publication atomically", async () => {
    const f = fake((q) =>
      q.includes("to_regclass")
        ? [{ ready: true }]
        : q.includes("FROM public.curriculum_chapters")
          ? [{ id: chapter }]
          : q.includes("INSERT INTO public.lesson_revisions")
            ? [{ id: actor }]
            : q.includes("UPDATE public.lessons")
              ? [{ ...row, version: 2, publishedRevisionId: actor }]
              : [row],
    );
    const result = await publishLesson(id, 1, actor, true, f.database);
    expect(result.lesson.status).toBe("PUBLISHED");
    const snapshot = f.calls.find((c) => c.sql.includes("INSERT INTO public.lesson_revisions"));
    expect(snapshot?.params).toContain(JSON.stringify(input));
    expect(f.raw.transaction).toHaveBeenCalledTimes(1);
    expect(f.calls.some((c) => /DELETE|UPDATE public.lesson_revisions/.test(c.sql))).toBe(false);
  });
  it("unpublishing preserves revision history and changes only the publication pointer", async () => {
    const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : [row]));
    await publishLesson(id, 1, actor, false, f.database);
    expect(f.calls.some((c) => c.sql.includes("UPDATE public.lessons"))).toBe(true);
    expect(
      f.calls.some(
        (c) => c.sql.includes("DELETE") || c.sql.includes("INSERT INTO public.lesson_revisions"),
      ),
    ).toBe(false);
  });
  it("learner chapter lists serialize only published snapshots, not edited drafts", async () => {
    const { blocks: _, objectives: __, ...summaryInput } = input;
    const f = fake((q) =>
      q.includes("to_regclass")
        ? [{ ready: true }]
        : [
            {
              ...row,
              title: "SECRET draft",
              snapshot: summaryInput,
              revisionId: actor,
              revisionNumber: 1,
            },
          ],
    );
    const result = await chapterLessonList(chapter, f.database);
    expect(result.items[0].title).toBe(input.title);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result.items[0]).not.toHaveProperty("blocks");
    expect(GetChapterLessonsResponse.safeParse(result).success).toBe(true);
    expect(result.items[0]).toMatchObject({ revisionId: actor, revisionNumber: 1 });
    const query = f.calls[1].sql;
    expect(query).toContain("r.id=l.published_revision_id");
    expect(query).toContain("t.status='ACTIVE'");
    expect(query).toContain("b.status='ACTIVE'");
  });
  it("unknown/unpublished lesson returns 404, not a working copy", async () => {
    const f = fake((q) => (q.includes("to_regclass") ? [{ ready: true }] : []));
    await expect(publishedLesson(id, f.database)).rejects.toMatchObject({ status: 404 });
    expect(f.calls[1].sql).toContain("r.id=l.published_revision_id");
  });
  it("published reader has bounded deterministic previous/next and original chapter metadata", async () => {
    const f = fake((q) =>
      q.includes("to_regclass")
        ? [{ ready: true }]
        : q.includes("jsonb_build_object")
          ? [
              {
                ...row,
                snapshot: input,
                revisionId: actor,
                revisionNumber: 1,
                chapter: {
                  id: chapter,
                  title: "Book chapter",
                  bookReference: "V1 / Chapter 1",
                  domainId: actor,
                  domainName: "Network Fundamentals",
                },
              },
            ]
          : [],
    );
    const result = await publishedLesson(id, f.database);
    expect(result.lesson.chapter).toHaveProperty("bookReference", "V1 / Chapter 1");
    expect(GetPublishedLessonResponse.safeParse(result).success).toBe(true);
    expect(result.previous).toBeNull();
    expect(result.next).toBeNull();
    expect(f.calls.slice(-2).every((c) => c.sql.includes("LIMIT 1"))).toBe(true);
  });
  it("rejects mixed-chapter ordering before any mutation", async () => {
    const f = fake((q) =>
      q.includes("to_regclass")
        ? [{ ready: true }]
        : q.includes("FROM public.curriculum_chapters")
          ? [{ id: chapter }]
          : [{ ...row, chapterId: actor }],
    );
    await expect(
      reorderLessons(
        { chapterId: chapter, lessons: [{ id, version: 1, displayOrder: 2 }] },
        actor,
        f.database,
      ),
    ).rejects.toMatchObject({ code: "INVALID_CHAPTER" });
    expect(f.calls.some((c) => c.sql.includes("UPDATE public"))).toBe(false);
  });
});
