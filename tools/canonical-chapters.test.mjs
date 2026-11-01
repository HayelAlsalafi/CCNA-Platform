import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { canonicalSources, canonicalMigration } from "./canonical-chapters-policy.mjs";
import { assertResetScope } from "./canonical-chapters-reset.mjs";
import { metadataDiagnostic } from "./canonical-diagnostics.mjs";
const root = process.cwd(),
  sources = canonicalSources(root);
test("pins reviewed canonical sources and keeps the official eleven-entry journal unchanged before approval", () => {
  const journal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
  assert.equal(journal.entries.length, 11);
  assert.deepEqual(sources.journal.entries.slice(0, 11), journal.entries);
  assert.deepEqual(sources.journal.entries[11], {
    idx: 11,
    version: "7",
    when: canonicalMigration[1],
    tag: canonicalMigration[0],
    breakpoints: true,
  });
});
test("the proposed snapshot changes only the chapter table and additional question FK", () => {
  const old = JSON.parse(readFileSync("lib/db/drizzle/meta/0010_snapshot.json", "utf8")),
    next = structuredClone(sources.snapshot);
  delete next.tables["public.curriculum_chapters"];
  delete next.tables["public.questions"].foreignKeys.questions_chapter_fk;
  next.id = old.id;
  next.prevId = old.prevId;
  assert.deepEqual(next, old);
});
test("DDL has no destructive data operations or disabled constraints", () => {
  const sql = readFileSync("lib/db/drizzle/proposed/0011_canonical_book_chapters.sql", "utf8");
  assert(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|DISABLE)\b/im.test(sql));
  assert(!/DISABLE TRIGGER/i.test(sql));
  assert(sql.includes("questions_chapter_fk"));
  assert(sql.includes("curriculum_chapters_canonical_ck"));
  assert.equal((sql.match(/::uuid,'V[12]'/g) ?? []).length, 48);
});
test("stable chapter UUIDs are reproducible UUIDv5 of volume and number, not titles or runtime random IDs", () => {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  for (const c of sources.catalog.chapters) {
    const b = createHash("sha1")
      .update(namespace)
      .update(`https://ccna-platform.local/curriculum/200-301/1.1/${c.volume}/${c.chapterNumber}`)
      .digest()
      .subarray(0, 16);
    b[6] = (b[6] & 15) | 0x50;
    b[8] = (b[8] & 63) | 0x80;
    const h = b.toString("hex");
    assert.equal(
      c.topicId,
      `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
    );
  }
});
test("reviewed scope preserves every account and definition and deletes only the named development tables", () => {
  assertResetScope(sources.plan, sources.catalog);
  assert.equal(sources.plan.rowProof.users.count, 9);
  assert.equal(sources.plan.rowProof.questions.count, 2);
  assert.equal(sources.plan.rowProof.exam_objectives.count, 53);
});
for (const mutate of [
  (p) => p.clearTables.push("users"),
  (p) => p.preservedTables.splice(0, 1),
  (p) => p.catalog.blueprints.push(p.catalog.blueprints[0]),
  (p) => (p.catalog.domains[0].weight_percent = 25),
  (p) => p.catalog.objectives.pop(),
  (p) => (p.restoration.restoreVerified = false),
  (p) => (p.backup.sha256 = "0".repeat(64)),
])
  test("refuses changed or unverified approval scope " + String(mutate), () => {
    const plan = structuredClone(sources.plan);
    mutate(plan);
    assert.throws(() => assertResetScope(plan, sources.catalog));
  });
test("application execution without both final confirmation flags stops before credential input or a connection", () => {
  const result = spawnSync(process.execPath, ["tools/execute-canonical-chapters.mjs"], {
    cwd: root,
    encoding: "utf8",
    input: "",
    windowsHide: true,
  });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.stage, "explicit-execution-gates");
  assert.equal(output.committed, false);
  assert.equal(output.commitOutcome, "NOT_COMMITTED");
});
test("diagnostics omit driver messages and hash long metadata strings", () => {
  assert.equal(metadataDiagnostic({ code: "28P01", message: "password=DO-NOT-PRINT" }), undefined);
  let error;
  try {
    assert.equal("sensitive-".repeat(100), "expected");
  } catch (e) {
    error = e;
  }
  const output = JSON.stringify(metadataDiagnostic(error));
  assert(!output.includes("sensitive-sensitive"));
  assert(output.includes("sha256"));
});
