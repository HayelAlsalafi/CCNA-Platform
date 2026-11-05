import { readFileSync } from "node:fs";
import { it, expect, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { curriculumChaptersTable, questionsTable } from "@workspace/db/schema";
import { chapterCatalog, saveChapter } from "./canonical-chapters";
import { validateImportRows } from "./admin-content-validation";
import { parseQuestionFile, xlsxTemplate } from "./question-import-files";
import { saveTaxonomy, replaceQuestionAssignments } from "./taxonomy-admin";
import { assertCanonicalTopicEdit } from "./topics-admin";
const c = ccnaBookChapters[0],
  dialect = new PgDialect();
const record = {
  chapterCode: c.code,
  text: "Which protocol supports reliable transport?",
  difficulty: "EASY",
  optionA: "TCP",
  optionB: "UDP",
  correctOption: "A",
  explanation: "TCP provides sequencing and acknowledgements.",
};
const catalog = { topics: ccnaBookChapters.map((c) => ({ id: c.topicId })), objectives: [] };
it("creates canonical chapters using only installed legacy columns before catalog activation", async () => {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const insert = vi.fn(() => ({ values: () => ({ returning: async () => [{ id: c.topicId }] }) }));
  const tx = { execute, insert, select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{id:c.topicId,blueprintId:c.topicId}] }) }) }) }) };
  const database: any = { execute: async () => ({ rows: [{ ready: true }] }), transaction: (fn: any) => fn(tx) };
  expect(await saveChapter({code:c.code,description:"",status:"ACTIVE",displayOrder:0}, undefined, database)).toEqual({id:c.topicId});
  expect(insert).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
  const q = dialect.sqlToQuery(execute.mock.calls[0][0]);
  expect(q.sql).toContain("INSERT INTO public.curriculum_chapters");
  expect(q.sql).not.toContain("course_version_id");
  expect(q.params).toEqual([c.topicId,c.code,c.volume,c.chapterNumber,c.primaryDomain,c.topicId,c.topicId]);
});
it("every question requires a persisted chapter through an additional RESTRICT FK", () => {
  const fk = getTableConfig(questionsTable).foreignKeys.find(
    (f) => f.getName() === "questions_chapter_fk",
  )!;
  expect(fk.onDelete).toBe("restrict");
  expect(fk.reference().foreignColumns[0]).toBe(curriculumChaptersTable.id);
  expect(getTableConfig(curriculumChaptersTable).checks.map((c) => c.name)).toContain(
    "curriculum_chapters_canonical_ck",
  );
});
it("shows a migration-pending catalog without querying a missing table", async () => {
  const execute = vi.fn().mockResolvedValue({ rows: [{ ready: false }] });
  expect(await chapterCatalog({ execute } as any)).toEqual({ canonicalReady: false, chapters: [] });
  expect(execute).toHaveBeenCalledTimes(1);
});
it.each(["CCNA-V1-00", "CCNA-V2-20", "1.1", "CCNA-V3-01"])(
  "rejects non-canonical chapter %s before writing",
  async (code) => {
    const transaction = vi.fn();
    await expect(
      saveChapter({ code, description: "", status: "ACTIVE", displayOrder: 0 }, undefined, {
        transaction,
      } as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  },
);
it("requires an exact concurrency token for chapter edits", async () => {
  const update = vi.fn(),
    database: any = {
      execute: async () => ({ rows: [{ ready: true }] }),
      transaction: (fn: any) => fn({ update }),
    };
  await expect(
    saveChapter(
      { code: c.code, description: "", status: "ACTIVE", displayOrder: 0 },
      c.topicId,
      database,
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(update).not.toHaveBeenCalled();
});
it("uses timestamp precision and locks the immutable canonical identity in update predicates", async () => {
  let predicate: any;
  const database: any = {
    execute: async () => ({ rows: [{ ready: true }] }),
    transaction: (fn: any) =>
      fn({
        update: () => ({
          set: () => ({
            where: (sql: any) => {
              predicate = sql;
              return { returning: async () => [] };
            },
          }),
        }),
      }),
  };
  await expect(
    saveChapter(
      {
        code: c.code,
        description: "changed",
        status: "ACTIVE",
        displayOrder: 1,
        expectedVersion: "2026-10-17T10:00:00.123456Z",
      },
      c.topicId,
      database,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const query = dialect.sqlToQuery(predicate);
  expect(query.params).toContain("2026-10-17T10:00:00.123456Z");
  expect(query.params).toContain(c.topicId);
  expect(query.sql).toContain("curriculum_chapters");
});
it("retired objective writes cannot recreate the educational classification", async () => {
  const transaction = vi.fn(),
    db: any = { transaction };
  await expect(saveTaxonomy("objectives", {}, undefined, db)).rejects.toMatchObject({
    status: 410,
  });
  await expect(
    replaceQuestionAssignments(c.topicId, { assignments: [] }, db),
  ).rejects.toMatchObject({ status: 410 });
  expect(transaction).not.toHaveBeenCalled();
});
it("preserves canonical topic names and slugs while allowing metadata edits", () => {
  expect(() => assertCanonicalTopicEdit(c.topicId, { name: c.title, slug: c.slug })).not.toThrow();
  expect(() => assertCanonicalTopicEdit(c.topicId, { name: "Different chapter" })).toThrow();
  expect(() => assertCanonicalTopicEdit(c.topicId, { slug: "custom" })).toThrow();
  expect(() => assertCanonicalTopicEdit("11111111-1111-4111-8111-111111111111", {})).toThrow();
});
it("resolves chapter codes and stable UUID aliases identically and detects duplicate rows", () => {
  const result = validateImportRows(
    [record, { ...record, chapterCode: "", topicId: c.topicId }],
    catalog,
    new Set(),
  );
  expect(result.map((r) => r.status)).toEqual(["accepted", "duplicate"]);
  expect(result[0].draft?.question.topicId).toBe(c.topicId);
  expect(result[0].draft?.assignments).toEqual([]);
});
it.each([
  { chapterCode: "1.1" },
  { chapterCode: "CCNA-V2-99" },
  { topicId: ccnaBookChapters[1].topicId },
  { objectiveCodes: "1.1" },
  { blueprintId: c.topicId },
  { questionType: "MULTIPLE_CHOICE_MULTIPLE", correctOption: "A" },
  { correctOption: "A;Z" },
  { correctOption: "A;A" },
])("rejects ambiguous or legacy import mappings %j", (patch) =>
  expect(validateImportRows([{ ...record, ...Object.fromEntries(Object.entries(patch).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }], catalog, new Set())[0].status).toBe(
    "rejected",
  ),
);
it("supports explicit complete-set multiple answers with no automatic mapping guesses", () => {
  const row = validateImportRows(
    [{ ...record, questionType: "MULTIPLE_CHOICE_MULTIPLE", correctOption: "B;A" }],
    catalog,
    new Set(),
  )[0];
  expect(row.status).toBe("accepted");
  expect(row.draft?.question.options.filter((o) => o.isCorrect)).toHaveLength(2);
});
it("CSV and XLSX templates use chapterCode and reject retired objective headers", () => {
  const csv =
    "chapterCode,text,difficulty,optionA,optionB,correctOption\nCCNA-V1-01,Fixture,EASY,A,B,A\n";
  expect(parseQuestionFile("chapters.csv", Buffer.from(csv))[0].chapterCode).toBe(c.code);
  expect(
    parseQuestionFile(
      "chapters.xlsx",
      xlsxTemplate([
        ["chapterCode", "text", "difficulty", "optionA", "optionB", "correctOption"],
        [c.code, "Fixture", "EASY", "A", "B", "A"],
      ]),
    )[0].chapterCode,
  ).toBe(c.code);
  expect(() =>
    parseQuestionFile("legacy.csv", Buffer.from(csv.replace("chapterCode", "objectiveCodes"))),
  ).toThrow();
});

it("operator seed data exactly matches the shared application catalog",()=>{
 const seed=JSON.parse(readFileSync(new URL("../../../../lib/canonical-chapters.json",import.meta.url),"utf8"));expect(seed.chapters).toEqual(ccnaBookChapters);
});
it.each(["A;C","A;B;C"])("rejects a correct key for an absent option: %s",correctOption=>{
 expect(validateImportRows([{...record,correctOption,questionType:"MULTIPLE_CHOICE_MULTIPLE"}],catalog,new Set())[0].status).toBe("rejected");
});
