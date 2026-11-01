import { ccnaBookChapters } from "../../../../lib/ccna-book-chapters";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { curriculumDomains, mapCurriculumTopics, topicChapterBindings } from "./curriculum-config";
const state = vi.hoisted(() => ({
  selection: {} as Record<string, unknown>,
  rows: [] as unknown[],
  join: null as any,
  where: null as any,
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return {
    ...schema,
    db: {
      select: (selection: Record<string, unknown>) => {
        state.selection = selection;
        const chain: any = {};
        for (const key of ["from", "leftJoin", "where", "groupBy"]) chain[key] = () => chain;
        chain.leftJoin = (_table: unknown, on: unknown) => {
          state.join = on;
          return chain;
        };
        chain.where = (on: unknown) => {
          state.where = on;
          return chain;
        };
        chain.orderBy = async () => state.rows;
        return chain;
      },
    },
  };
});
import { curriculumSummary, curriculumMappingReport, curriculumTopics } from "./curriculum";
const topic = (slug: string, id = ccnaBookChapters.find(c=>c.slug===slug)?.topicId??slug) => ({
  id,
  slug,
  name: slug,
  description: "Real description",
  status: "ACTIVE" as const,
  questionCount: 3,
});
it("has the exact 48 canonical chapters and six correctly weighted domains",()=>{
 expect(curriculumDomains.map(d=>d.sections.flatMap(s=>s.chapters).length)).toEqual([12,10,9,6,7,4]);
 expect(curriculumDomains.flatMap(d=>d.sections.flatMap(s=>s.chapters.map(c=>[c.id,c.title])))).toEqual(ccnaBookChapters.map(c=>[c.topicId,c.title]));
});
it("maps only exact stable chapter IDs and slugs; disposable legacy slugs are never guessed",()=>{
 const c=ccnaBookChapters[0];expect(mapCurriculumTopics([topic(c.slug)]).mapped[0].chapterIds).toEqual([c.topicId]);
 expect(mapCurriculumTopics([topic(c.slug,"random-uuid"),topic("ccna-v1-1-s7-static-routing")]).unmapped).toHaveLength(2);
});
it("rejects duplicate IDs or slugs as ambiguous instead of merging them", () => {
  const t = topic(Object.keys(topicChapterBindings)[0]);
  expect(mapCurriculumTopics([t, { ...t, id: "another" }]).ambiguous).toHaveLength(2);
  expect(mapCurriculumTopics([t, { ...t, slug: "other" }]).mapped).toHaveLength(0);
});
it("summary reads metadata/counts only and excludes unmapped records", async () => {
  state.rows = [topic(ccnaBookChapters[0].slug), topic("unknown")];
  const summary = await curriculumSummary();
  expect(summary.topics).toHaveLength(1);
  expect(summary.topics[0].questionCount).toBe(3);
  expect(summary.counts).toEqual({availableQuestions:6,mappedQuestions:3});
  expect(Object.keys(state.selection)).toEqual([
    "id",
    "slug",
    "name",
    "description",
    "status",
    "questionCount",
  ]);
  expect(JSON.stringify(summary)).not.toMatch(/isCorrect|explanation|correctAnswer/);
  expect((await curriculumMappingReport()).unmapped).toHaveLength(1);
});
it("counts only published questions on active topics and limits the learner inventory to ACTIVE", async () => {
  await curriculumTopics();
  const dialect = new PgDialect();
  const join = dialect.sqlToQuery(state.join),
    where = dialect.sqlToQuery(state.where);
  expect(join.params).toEqual(["ACTIVE", "ACTIVE"]);
  expect(join.sql).toContain('"questions"."topic_id"');
  expect(join.sql).toContain('"questions"."status"');
  expect(where.params).toEqual(["ACTIVE"]);
});
it("Admin report includes disabled metadata without counting its hidden questions", async () => {
  await curriculumTopics(true);
  expect(state.where).toBeUndefined();
  expect(new PgDialect().sqlToQuery(state.join).params).toEqual(["ACTIVE", "ACTIVE"]);
});
