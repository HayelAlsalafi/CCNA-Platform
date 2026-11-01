import {ccnaBookChapters} from "../../../../lib/ccna-book-chapters";
import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  parseTopicPage,
  topicSlug,
  listManagedTopics,
  topicDetails,
  previewTopicDependencies,
  bulkTopicStatus,
  updateManagedTopic,
  suggestTopicSlug,
  createManagedTopic,
} from "./topics-management";
const id = ccnaBookChapters[0].topicId,
  other = "22222222-2222-4222-8222-222222222222",
  version = "2026-10-14T12:00:00.123456Z";
const row = {
  id,
  name: "Routing",
  slug: "routing",
  description: "",
  status: "ACTIVE",
  displayOrder: 0,
  createdAt: version,
  updatedAt: version,
  version,
  questionCount: 4,
  publishedQuestionCount: 2,
};
const dialect = new PgDialect();
function fake(results: unknown[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (statement: any) => {
    queries.push(dialect.sqlToQuery(statement));
    return { rows: results.shift() ?? [] };
  });
  const db: any = { execute, transaction: vi.fn((fn: any) => fn(db)) };
  return { db, queries, execute };
}
describe("bounded topics management", () => {
  it.each([
    { page: 0 },
    { pageSize: 100 },
    { sort: "name;DELETE" },
    { status: "PUBLISHED" },
    { chapter: "invented" },
    { domain: "invented" },
    { search: "a".repeat(181) },
    { extra: true },
  ])("rejects invalid query %j", (input) => expect(() => parseTopicPage(input)).toThrow());
  it.each([10, 25, 50])("accepts page size %s", (pageSize) =>
    expect(parseTopicPage({ pageSize: String(pageSize) }).pageSize).toBe(pageSize),
  );
  it("uses two aggregate queries, snapshot consistency and a bounded page with escaped literal search", async () => {
    const { db, queries } = fake([
      [{ total: 31, stats: { total: 40, active: 24, disabled: 16 } }],
      [row],
    ]);
    const result = await listManagedTopics(
      { page: 99, pageSize: 10, search: "%_' OR true", sort: "updatedAt", direction: "desc" },
      db,
    );
    expect(result.page).toBe(4);
    expect(result.items[0].version).toBe(version);
    expect(result.totalPages).toBe(4);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(queries).toHaveLength(2);
    expect(queries[1].sql).toContain("JOIN paged");
    expect(queries[1].sql).toContain("t.updated_at DESC");
    expect(queries[1].params).toContain(10);
    expect(queries[1].params).toContain(30);
    expect(queries[0].sql).not.toContain("OR true");
    expect(queries[0].params).toContain("%\\%\\_' OR true%");
  });
  it("binds distinct curriculum and taxonomy filters without guessed relationships", async () => {
    const { db, queries } = fake([[{ total: 0, stats: { total: 0, active: 0, disabled: 0 } }], []]);
    await listManagedTopics(
      { domain: "d1", chapter: id, taxonomyDomain: id, status: "ACTIVE" },
      db,
    );
    expect(queries[0].params).toContain("d1");
    expect(queries[0].params).toContain(id);
    expect(queries[0].params).toContain(id);
    expect(queries[0].sql).toContain("c.domain_id=");
  });
  it("details never select answers, paginate questions and keep objective relationships separate", async () => {
    const { db, queries } = fake([
      [row],
      [
        {
          id: other,
          questionCode: "CCNA-Q-1",
          text: "Question",
          status: "ACTIVE",
          difficulty: "EASY",
        },
      ],
      [],
    ]);
    const result = await topicDetails(id, 7, db);
    expect(result.questionPage).toBe(1);
    expect(queries).toHaveLength(3);
    expect(queries[1].sql).toContain("LIMIT 10");
    expect(queries.map((q) => q.sql).join("")).not.toMatch(
      /is_correct|explanation|question_options/i,
    );
  });
  it("returns missing topics as 404", async () => {
    const { db } = fake([[]]);
    await expect(topicDetails(id, 1, db)).rejects.toMatchObject({ status: 404 });
  });
  it("aggregates deletion dependencies once and identifies absent IDs", async () => {
    const { db, queries } = fake([
      [
        {
          id,
          name: "Routing",
          slug: "routing",
          questionCount: 1,
          publishedQuestionCount: 1,
          attempts: 0,
          revisionSnapshots: 0,
        },
      ],
    ]);
    const result = await previewTopicDependencies({ ids: [id, other] }, db);
    expect(result.items[0].blocked).toBe(true);
    expect(result.missingIds).toEqual([other]);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).not.toMatch(/DELETE|UPDATE/);
  });
  it("returns UPDATED and BLOCKED only and writes no questions or history", async () => {
    const { db, queries } = fake([[], [], [{ id }, { id: other }], [{ id }]]);
    const result = await bulkTopicStatus(
      {
        status: "DISABLED",
        items: [
          { id, version },
          { id: other, version },
        ],
      },
      db,
    );
    expect(result.updated).toBe(1);
    expect(result.blocked).toBe(1);
    expect(queries[2].sql).toContain("ORDER BY id FOR UPDATE");
    expect(queries[3].sql).toContain("t.updated_at=s.version");
    expect(queries[3].sql).toContain("UPDATE public.topics");
    expect(queries[3].sql).not.toContain("public.questions");
  });
  it.each([
    {
      status: "ACTIVE",
      items: [
        { id, version },
        { id, version },
      ],
    },
    { status: "ACTIVE", items: [{ id, version: "2026-10-14T12:00:00.123Z" }] },
    { status: "ACTIVE", items: [] },
  ])("rejects unsafe bulk update %j", async (body) => {
    const { db, execute } = fake([]);
    await expect(bulkTopicStatus(body, db)).rejects.toMatchObject({ status: 400 });
    expect(execute).not.toHaveBeenCalled();
  });
  it("requires exact microsecond versions and preserves strict field validation", async () => {
    const { db } = fake([]);
    await expect(
      updateManagedTopic(id, { expectedVersion: version, name: "Good", topicId: other }, db),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateManagedTopic(id, { expectedVersion: "2026-10-14T12:00:00.123Z", name: "Good" }, db),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("atomic edit includes version and reviewed-slug acknowledgement guards", async () => {
    let condition: any;
    const returning = vi.fn().mockResolvedValue([]),
      db: any = {
        update: () => ({
          set: () => ({
            where: (value: any) => {
              condition = value;
              return { returning };
            },
          }),
        }),
      };
    await expect(
      updateManagedTopic(id, { expectedVersion: version, description: "changed description" }, db),
    ).rejects.toMatchObject({ status: 409 });
    const query = dialect.sqlToQuery(condition);
    expect(query.sql).toContain("timestamptz");
    expect(query.sql).toContain("updated_at");
    expect(query.params).toContain(version);
    returning.mockResolvedValue([row]);
    await updateManagedTopic(
      id,
      { expectedVersion: version, description:"changed description" },
      db,
    );
    expect(dialect.sqlToQuery(condition).sql).not.toContain("ANY(");
  });
  it("generates Unicode-safe bounded ASCII slugs and queries bounded collision candidates", async () => {
    expect(topicSlug("Éthernet & VLANs")).toBe("ethernet-vlans");
    expect(topicSlug("شبكات")).toBe("topic");
    expect(topicSlug("a".repeat(180)).length).toBe(108);
    const { db, queries } = fake([[{ slug: "routing-2" }]]);
    expect(await suggestTopicSlug("Routing", db)).toEqual({ slug: "routing-2" });
    expect(queries[0].sql).toContain("generate_series(0,10000)");
  });
  it("fails closed when slug candidates are exhausted or automatic mode is invalid", async () => {
    const { db } = fake([[]]);
    await expect(suggestTopicSlug("Routing", db)).rejects.toMatchObject({ status: 409 });
    await expect(createManagedTopic({ autoSlug: "yes" }, db)).rejects.toMatchObject({
      status: 400,
    });
  });
});
