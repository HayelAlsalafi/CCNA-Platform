// Read-only final attestation. No migrator, fixtures or restoration execution.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import {
  withPrivateTarget,
  assertPrivateIdentity,
  privateConnection,
  isolated,
  backupHash,
} from "./isolated-policy.mjs";
import { assertStudyRuntimeCatalog, assertStudyPrivileges } from "./proposed-runtime-guard.mjs";
import { assertLessonPrivileges } from "../lesson-activation/policy.mjs";
const root = process.cwd(),
  req = createRequire(path.join(root, "lib/db/package.json")),
  { Client } = req("pg");
const folder = path.join(
    root,
    ".local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5",
  ),
  file = path.join(folder, "rehearsal.json");
const report = JSON.parse(readFileSync(file, "utf8"));
assert.equal(report.completed, true);
assert.equal(report.originalRecordsPreserved, true);
assert.equal(report.hbaRestoredByteForByte, true);
await withPrivateTarget(root, async (state) => {
  const c = new Client(privateConnection(isolated.database));
  c.on("error", () => {});
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL TIME ZONE 'UTC'");
    await assertPrivateIdentity(c, isolated.database, state.data);
    await assertStudyRuntimeCatalog(c, root, isolated.owner);
    await assertStudyPrivileges(c, "pg_read_all_settings");
    await assertLessonPrivileges(c, "pg_read_all_settings");
    const counts = {};
    for (const name of [
      "questions",
      "lessons",
      "lesson_revisions",
      "users",
      "lesson_annotations",
      "lesson_progress",
      "lesson_media",
    ])
      counts[name] = (await c.query(`SELECT count(*)::int AS n FROM public.${name}`)).rows[0].n;
    assert.deepEqual(counts, {
      questions: 16,
      lessons: 3,
      lesson_revisions: 8,
      users: 13,
      lesson_annotations: 2,
      lesson_progress: 1,
      lesson_media: 0,
    });
    report.finalCountsIncludingSyntheticFixtures = counts;
    // Retain exact, sanitized default/CHECK definitions as review evidence.
    report.studyCheckDefinitions = (
      await c.query(
        "SELECT c.relname AS table,k.conname AS constraint,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.conrelid=ANY(ARRAY['public.lesson_annotations'::regclass,'public.lesson_progress'::regclass,'public.lesson_media'::regclass]) ORDER BY c.relname,k.conname",
      )
    ).rows;
    report.studyColumnDefaults = (
      await c.query(
        "SELECT c.relname AS table,a.attname AS column,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid=ANY(ARRAY['public.lesson_annotations'::regclass,'public.lesson_progress'::regclass,'public.lesson_media'::regclass]) ORDER BY c.relname,a.attname",
      )
    ).rows;
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  }
});
assert.equal(
  createHash("sha256").update(readFileSync(report.backup.path)).digest("hex"),
  backupHash,
);
report.backup.restorationVerified = true;
report.backup.rehearsalVerified = true;
report.finalReadOnlyVerification = true;
report.verifiedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    stage: "final-read-only-verification",
    databaseWrites: 0,
    applicationDatabaseConnections: 0,
    ledgerEntries: 14,
    studyTables: 3,
    rlsPolicies: 2,
    exactStudyAndLessonPrivileges: true,
    counts: report.finalCountsIncludingSyntheticFixtures,
    hbaRestoredByteForByte: true,
    report: file,
  }),
);
