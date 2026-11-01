import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { privateConnection, isolated } from "./isolated-policy.mjs";
import { canonicalOwnerPolicy, proposedStudyManifest } from "./proposed-runtime-guard.mjs";
import { assertStudyProposal } from "./proposal.mjs";
test("private connection factory refuses application and previous rehearsal databases", () => {
  for (const name of [
    "ccna_phase6a_dev",
    "ccna_drizzle_check_20261012_c08f12ad34b6",
    "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170",
    "",
  ])
    assert.throws(() => privateConnection(name));
  assert.equal(privateConnection(isolated.database).port, 55440);
  assert.equal(privateConnection("postgres").port, 55440);
});
test("candidate manifest adds only pinned 0014 and retains every baseline entry", () => {
  const manifest = proposedStudyManifest(process.cwd());
  assert.equal(manifest.length, 14);
  assert.equal(manifest.at(-1).tag, "0014_interactive_study");
  assert(!manifest.some((m) => m.tag === "0012_exam_simulator"));
});
test("proposed PK and bookmark index metadata match PostgreSQL names and text cast", () => {
  const { snapshot } = assertStudyProposal(process.cwd());
  assert.deepEqual(Object.keys(snapshot.tables["public.lesson_progress"].compositePrimaryKeys), [
    "lesson_progress_pkey",
  ]);
  assert(
    snapshot.tables["public.lesson_annotations"].indexes.lesson_bookmark_once_idx.where.includes(
      "'BOOKMARK'::text",
    ),
  );
  const source = readFileSync("lib/db/src/schema/lesson-study.ts", "utf8");
  assert(source.includes('name: "lesson_progress_pkey"'));
});
test("policy normalization accepts only representation differences, not changed ownership rules", () => {
  const expected = canonicalOwnerPolicy(
    "user_id=nullif(current_setting('app.study_user',true),'')::uuid",
  );
  assert.equal(
    canonicalOwnerPolicy(
      "(user_id = (NULLIF(current_setting('app.study_user'::text, true), ''::text))::uuid)",
    ),
    expected,
  );
  for (const expr of [
    "true",
    "user_id=nullif(current_setting('app.other',true),'')::uuid",
    "user_id=nullif(current_setting('app.study_user',true),'')::uuid OR true",
  ])
    assert.notEqual(canonicalOwnerPolicy(expr), expected);
});
