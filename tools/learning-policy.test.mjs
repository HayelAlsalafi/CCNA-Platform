import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {migrationManifest} from './phase6a-local/policy.mjs';
import {
  assertLearningSource,
  learningSnapshot,
  learningCatalog,
  assertLearningPrivileges,
} from "./learning-policy.mjs";
import { nexusSnapshot } from "./nexus-policy.mjs";
const root = portableRoot;
test("008 proposal retains every 007 table and adds only two live-use achievement tables", () => {
  assertLearningSource(root);
  const before = nexusSnapshot(root),
    after = learningSnapshot(root);
  assert.equal(after.prevId, before.id);
  assert.equal(Object.keys(after.tables).length, 15);
  for (const [key, table] of Object.entries(before.tables))
    assert.deepEqual(after.tables[key], table);
  const source = assertLearningSource(root).toString("utf8");
  assert.doesNotMatch(source, /DROP TABLE|TRUNCATE|UPDATE public|DELETE FROM/);
  assert.match(
    source,
    /REVOKE ALL ON public.achievement_definitions, public.learner_achievements FROM PUBLIC/,
  );
});
test("initial catalog contains seven distinct measured rule versions and no learner awards", () => {
  const rows = learningCatalog(root);
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((r) => r.id)).size, 7);
  assert(rows.every((r) => r.ruleVersion === 1 && r.active));
  assert.equal(rows.find((r) => r.id === "precision-90.v1").criteria.attempts, 30);
  assert.doesNotMatch(
    assertLearningSource(root).toString("utf8"),
    /INSERT INTO public.learner_achievements/,
  );
});
const required = () => [
  { table: "achievement_definitions", select: true, insert: false, unsafe: false },
  { table: "learner_achievements", select: true, insert: true, unsafe: false },
];
const client = (rows = required(), exists = { definitions: true, awards: true }) => ({
  query: async (sql) => ({ rows: sql.includes("to_regclass") ? [exists] : rows }),
});
test("accepts only read-only definitions and append-only awards", async () => {
  assert.deepEqual(await assertLearningPrivileges(client()), { installed: true, ready: true });
});
for (const [table, field] of [
  [0, "select"],
  [0, "insert"],
  [0, "unsafe"],
  [1, "select"],
  [1, "insert"],
  [1, "unsafe"],
])
  test("rejects altered privilege " + table + "/" + field, async () => {
    const r = required();
    r[table][field] = !r[table][field];
    await assert.rejects(assertLearningPrivileges(client(r)), /privileges differ/);
  });
test("fails closed on partially installed or missing catalog evidence", async () => {
  await assert.rejects(
    assertLearningPrivileges(client([], { definitions: true, awards: false })),
    /partial/,
  );
  await assert.rejects(assertLearningPrivileges(client([])), /missing/);
});
test("absent badge storage reports unavailable without weakening the reviewed source prefix", async () => {
  assert.deepEqual(
    await assertLearningPrivileges(client([], { definitions: false, awards: false })),
    { installed: false },
  );
  const journal = JSON.parse(readFileSync(root + "/lib/db/drizzle/meta/_journal.json", "utf8"));
  assert([7,8,9,10,11].includes(journal.entries.length));assert.equal(migrationManifest(root).length,journal.entries.length);assert.equal(journal.entries[6].tag,"0006_controlled_history_delete");
});
