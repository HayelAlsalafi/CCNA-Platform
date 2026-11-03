import {ccnaBookChapters} from "../../../../lib/ccna-book-chapters";
import { it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
const writes = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), assign: vi.fn() }));
vi.mock("./questions-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./questions-admin")>()),
  createAdminQuestion: writes.create,
  updateAdminQuestion: writes.update,
}));
vi.mock("./taxonomy-admin", () => ({
  replaceQuestionAssignments: writes.assign,
  questionAssignments: vi.fn().mockResolvedValue([]),
}));
import {
  parseStudioQuery,
  listStudioQuestions,
  studioLookup,
  validateStudioSave,
  studioDuplicates,
  saveStudioQuestion,
  bulkStudioQuestions,
  studioDeletePreview,
} from "./question-studio";
const id = "11111111-1111-4111-8111-111111111111",
  objective = "22222222-2222-4222-8222-222222222222",
  token = "a".repeat(64),
  dialect = new PgDialect();
const question = {
  topicId: ccnaBookChapters[0].topicId,
  text: "Which interface belongs to VLAN 10?",
  type: "MULTIPLE_CHOICE_SINGLE",
  difficulty: "MEDIUM",
  status: "DISABLED",
  explanation: "A switch access port belongs to its configured access VLAN.",
  options: [
    { optionKey: "A", text: "Access port in VLAN 10", isCorrect: true },
    { optionKey: "B", text: "Access port in VLAN 20", isCorrect: false },
  ],
};
function fake(results: unknown[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db: any = {
    execute: vi.fn(async (statement: any) => {
      queries.push(dialect.sqlToQuery(statement));
      return { rows: results.shift() ?? [] };
    }),
    transaction: vi.fn((fn: any) => fn(db)),
  };
  return { db, queries };
}
it.each([
  { page: 0 },
  { pageSize: 100 },
  { sort: "code;DELETE" },
  { status: "DRAFT" },
  { mapping: "guessed" },
  { chapterId: "unknown" },
  { search: "a".repeat(181) },
  { extra: true },
])("rejects invalid studio query %j", (q) => expect(() => parseStudioQuery(q)).toThrow());
it.each([10, 25, 50])("accepts page size %s", (size) =>
  expect(parseStudioQuery({ pageSize: String(size) }).pageSize).toBe(size),
);
it("uses bounded stable server pages and aggregates only their relationships, with no list answer key", async () => {
  const { db, queries } = fake([
    [
      {
        total: 31,
        stats: {
          total: 60,
          active: 60,
          disabled: 0,
          missingObjectives: 2,
          easy: 20,
          medium: 30,
          hard: 10,
        },
      },
    ],
    [
      {
        id,
        questionCode: "CCNA-Q-1",
        text: "Preview",
        topicSlug: "unknown",
        createdAt: new Date(),
        updatedAt: new Date(),
        objectives: [],
        editToken: token,
      },
    ],
  ]);
  const result = await listStudioQuestions(
    { page: 9, pageSize: 10, search: "%' OR true", sort: "code", direction: "asc" },
    db,
  );
  expect(result.page).toBe(4);
  expect(result.items[0].chapterIds).toEqual([]);
  expect(queries).toHaveLength(2);
  expect(queries[1].sql).toContain("FROM paged q");
  expect(queries[1].sql).toContain("q.question_code ASC");
  expect(queries[1].params).toContain(30);
  expect(queries[0].sql).not.toContain("OR true");
  expect(queries[1].sql).toContain("to_jsonb(original)");
  expect(queries[1].sql).toContain('extract(epoch from original.updated_at)');
  expect(queries[1].sql).toContain('extract(epoch from a.updated_at)');
  expect(queries[1].sql).not.toContain('AS "isCorrect"');
  expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
it("binds exact filters and distinguishes missing chapter and objective mappings", async () => {
  const { db, queries } = fake([[{ total: 0, stats: {} }], []]);
  await listStudioQuestions(
    {
      topicId: id,
      domainId: id,
      chapterId: ccnaBookChapters[0].topicId,
      mapping: "chapter",
      difficulty: "HARD",
      status: "ACTIVE",
    },
    db,
  );
  expect(queries[0].params).toContain(ccnaBookChapters[0].topicId);
  expect(queries[0].params).toContain(id);
  expect(queries[0].sql).toContain("public.curriculum_chapters");
});
it("uses bounded searchable topic lookups rather than downloading the topic inventory", async () => {
  const { db, queries } = fake([
    Array.from({ length: 26 }, (_, i) => ({ id: String(i), label: "Topic", slug: "unknown" })),
  ]);
  const result = await studioLookup({ kind: "topics", page: 2, search: "route_" }, db);
  expect(result.items).toHaveLength(25);
  expect(result.hasMore).toBe(true);
  expect(queries[0].sql).toContain("LIMIT 26 OFFSET");
  expect(queries[0].params).toContain(25);
  expect(queries[0].params).toContain("%route\\_%");
});
it.each([
  { ...question, options: [] },
  { ...question, options: question.options.map((o) => ({ ...o, isCorrect: false })) },
  { ...question, options: question.options.map((o) => ({ ...o, text: "Same" })) },
  { ...question, status: "ACTIVE", explanation: "" },
  { ...question, topicId: "bad" },
  { ...question, questionCode: "REWRITE" },
])("rejects invalid or unpublishable question data", (q) =>
  expect(() => validateStudioSave({ question: q })).toThrow(),
);
it("uses real states, supports unpublished validated questions and rejects stale token formats", () => {
  expect(validateStudioSave({ question: { ...question, explanation: "" } }).question.status).toBe(
    "DISABLED",
  );
  expect(() => validateStudioSave({ question, expectedToken: "bad" })).toThrow();
  expect(() =>
    validateStudioSave({
      question,
      assignments: [{ objectiveId: objective, blueprintId: id, isPrimary: true, extra: 1 }],
    }),
  ).toThrow();
});
it("duplicate detection is normalized, bounded, parameterized and excludes the edited UUID", async () => {
  const { db, queries } = fake([[{ id: objective, questionCode: "CCNA-Q-2" }]]);
  expect(
    (
      await studioDuplicates(
        { topicId: id, text: " ROUTER\n show ip route ", excludeId: objective },
        db,
      )
    ).items,
  ).toHaveLength(1);
  expect(queries[0].sql).toContain("LIMIT 6");
  expect(queries[0].params).toContain("\\s+");
  expect(queries[0].params).toContain(objective);
  expect(queries[0].sql).not.toContain("show ip route");
});
it("saves chapter-backed content through the existing revision-aware writers", async () => {
  writes.create.mockResolvedValue({ id: objective });
  writes.assign.mockResolvedValue([]);
  const { db, queries } = fake([[], [], [{ status: "ACTIVE" }], [], [{ editToken: token }]]);
  const result = await saveStudioQuestion(
    { question, assignments: [] },
    undefined,
    db,
  );
  expect(result.editToken).toBe(token);
  expect(writes.create).toHaveBeenCalledWith(expect.objectContaining({ status: "DISABLED" }), db);
  expect(writes.assign).not.toHaveBeenCalled();
  expect(queries.map((q) => q.sql).join("")).not.toMatch(
    /DELETE.*practice|DELETE.*question_revisions/,
  );
});
it("blocks duplicate creation before any writer unless explicitly acknowledged", async () => {
  writes.create.mockClear();
  const { db } = fake([[], [], [{ status: "ACTIVE" }], [{ id: objective }]]);
  await expect(saveStudioQuestion({ question }, undefined, db)).rejects.toMatchObject({
    status: 409,
  });
  expect(writes.create).not.toHaveBeenCalled();
});
it("an explicit existing-question publication passes readiness before the revision-aware writer",async()=>{
  writes.update.mockClear();writes.update.mockResolvedValue({id});
  const {db}=fake([[],[],[{id}],[{editToken:token}],[{status:"ACTIVE"}],[],[{editToken:token}]]);
  await saveStudioQuestion({question:{...question,status:"ACTIVE"},assignments:[],expectedToken:token},id,db);
  expect(writes.update).toHaveBeenCalledWith(id,expect.objectContaining({status:"ACTIVE"}),db,true);
});
it("blocks publication in a disabled topic and stale edits before rewriting content", async () => {
  const { db } = fake([[], [], [{ status: "DISABLED" }]]);
  await expect(
    saveStudioQuestion({ question: { ...question, status: "ACTIVE" } }, undefined, db),
  ).rejects.toMatchObject({ status: 400 });
  const stale = fake([[], [], [{ id }], [{ editToken: "b".repeat(64) }]]);
  await expect(
    saveStudioQuestion({ question, assignments:[], expectedToken: token }, id, stale.db),
  ).rejects.toMatchObject({ status: 409 });
});
it("requires bounded unique selection and one supported bulk mutation", async () => {
  const { db } = fake([]);
  await expect(
    bulkStudioQuestions(
      {
        items: [
          { id, editToken: token },
          { id, editToken: token },
        ],
        change: { status: "ACTIVE" },
      },
      db,
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    bulkStudioQuestions(
      { items: [{ id, editToken: token }], change: { status: "ACTIVE", topicId: id } },
      db,
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("deletion preview batches historical dependency counts without modifying history", async () => {
  const { db, queries } = fake([
    [{ id, questionCode: "CCNA-Q-1", revisions: 2, deliveries: 1, attempts: 1 }],
  ]);
  expect((await studioDeletePreview({ ids: [id] }, db)).items).toHaveLength(1);
  expect(queries).toHaveLength(1);
  expect(queries[0].sql).not.toMatch(/DELETE|UPDATE/);
});
it("blocks bulk topic reassignment that would introduce a duplicate rather than silently acknowledging it", async () => {
  writes.update.mockClear();
  const { db } = fake([
    [],
    [],
    [{ id }],
    [{ name: "Routing", slug: "routing", revisionCount: 1 }],
    [],
    [{ editToken: token }],
    [{ id }],
    [{ editToken: token }],
    [{ status: "ACTIVE" }],
    [{ id: objective, questionCode: "CCNA-Q-2" }],
  ]);
  db.select = () => {
    let name: string;
    const c: any = {
      from: (table: any) => {
        name = table[Symbol.for("drizzle:Name")];
        return c;
      },
      where: () => c,
      limit: async () => [
        {
          ...question,
          id,
          questionCode: "CCNA-Q-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          referenceNotes: null,
          imageKey: null,
        },
      ],
      then: (resolve: any) =>
        resolve(
          name === "question_options"
            ? question.options.map((o, i) => ({ ...o, displayOrder: i }))
            : [],
        ),
    };
    return c;
  };
  const result = await bulkStudioQuestions(
    { items: [{ id, editToken: token }], change: { topicId: ccnaBookChapters[1].topicId } },
    db,
  );
  expect(result.blocked).toBe(1);
  expect(result.items[0].reason).toContain("Possible duplicate");
  expect(writes.update).not.toHaveBeenCalled();
});
