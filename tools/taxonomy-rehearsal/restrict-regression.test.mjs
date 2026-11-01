// Offline source regressions only: never import the harness or execute its SQL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const harness = readFileSync(new URL("./rehearsal.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = readFileSync(new URL("../../lib/db/drizzle/proposed/0005_exam_taxonomy.sql", import.meta.url), "utf8");
const rejections = [...harness.matchAll(/await reject\("([^"]+)", (\[[^\n]*?\]), "([0-9A-Z]{5})"(?:, "([^"]+)")?\);/g)]
  .map(([, sql, params, code, constraint]) => ({ sql, params, code, constraint }));

function foreignKey(constraint, parentTable) {
  const line = migration.split(/\r?\n/).find((value) => value.includes(`CONSTRAINT ${constraint} `));
  assert(line, `Missing migration constraint: ${constraint}`);
  assert(line.includes(`REFERENCES public.${parentTable}(`));
  assert(line.includes("ON DELETE RESTRICT"));
}

// A missing reference during INSERT is foreign_key_violation (23503), even
// when that FK has ON DELETE RESTRICT. Deleting its referenced parent is
// restrict_violation (23001); keep the exact FK name for both operations.
for (const [parent, constraint] of [
  ["questions", "question_objectives_question_id_questions_id_fk"],
  ["exam_objectives", "question_objectives_objective_fk"],
  ["exam_domains", "exam_objectives_domain_fk"],
  ["exam_blueprints", "exam_domains_blueprint_id_exam_blueprints_id_fk"],
]) {
  test(`explicit RESTRICT deletion of ${parent} expects 23001 and the exact FK`, () => {
    foreignKey(constraint, parent);
    const cases = rejections.filter((entry) => entry.sql === `DELETE FROM ${parent} WHERE id=$1`);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].code, "23001");
    assert.equal(cases[0].constraint, constraint);
  });
}

for (const [name, params, constraint, parent] of [
  ["objective in a different blueprint", "[id(4), id(121), id(102)]", "question_objectives_objective_fk", "exam_objectives"],
  ["missing question", "[id(999), id(121), id(101)]", "question_objectives_question_id_questions_id_fk", "questions"],
  ["missing objective", "[id(4), id(999), id(101)]", "question_objectives_objective_fk", "exam_objectives"],
  ["domain in a different blueprint", "[id(111), id(102)]", "exam_objectives_domain_fk", "exam_domains"],
]) {
  test(`INSERT ${name} remains 23503 rather than 23001`, () => {
    foreignKey(constraint, parent);
    const cases = rejections.filter((entry) => entry.sql.startsWith("INSERT INTO ") && entry.params === params);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].code, "23503");
    assert.equal(cases[0].constraint, constraint);
  });
}

test("all explicit RESTRICT deletion cases are covered without broad SQLSTATE acceptance", () => {
  const deletes = rejections.filter((entry) => entry.code === "23001");
  assert.equal(deletes.length, 4);
  assert(deletes.every((entry) => entry.sql.startsWith("DELETE FROM ") && entry.constraint));
  assert.equal(rejections.filter((entry) => entry.code === "23503").length, 4);
  const helper = harness.slice(harness.indexOf("async function reject("), harness.indexOf("async function transaction("));
  assert(helper.includes("assert.equal(error.code, code)"));
  assert(helper.includes("if (constraint) assert.equal(error.constraint, constraint)"));
});

test("the failed RESTRICT assertion and its temporary mapping stay inside a rolled-back transaction", () => {
  const start = harness.indexOf('await transaction(async () => {\n        await client.query("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)"');
  assert(start >= 0);
  const end = harness.indexOf('pass("RESTRICT preserves', start);
  assert(end > start);
  const block = harness.slice(start, end);
  assert.equal((block.match(/await reject\("DELETE FROM /g) ?? []).length, 4);
  assert(!block.includes('client.query("COMMIT")'));
  assert(harness.includes('try { await test(); } finally { await client.query("ROLLBACK"); }'));
});
