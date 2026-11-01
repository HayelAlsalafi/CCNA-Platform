// Inert helpers shared by the future explicitly approved operator and offline tests.
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { backupReceipt } from "./staging.mjs";
export const rehearsalRelative =
  "lesson-rehearsal-859695b9-9d30-4450-96c2-f52289a42ecb/rehearsal.json";
export function assertExecutionIntent(args) {
  assert.deepEqual(
    args,
    ["--apply", "--confirm-reviewed-lessons"],
    "Explicit separate lesson activation approval is required",
  );
}
export function verifyRehearsal(folder) {
  const report = JSON.parse(readFileSync(path.join(folder, rehearsalRelative), "utf8"));
  assert.equal(report.stage, "complete");
  assert.equal(report.backupHash, backupReceipt.hash);
  assert.equal(report.database, "ccna_drizzle_check_20261012_c08f12ad34b6");
  assert.equal(report.port, 55440);
  for (const key of ["rolledBack", "isolatedSequencesRestored", "lessonOnly"])
    assert.equal(report[key], true);
  assert.equal(report.applicationDatabaseConnections, 0);
  assert.equal(report.applicationWrites, 0);
  assert.deepEqual(
    Object.keys(report.outcomes).sort(),
    [
      "freshBackupRestored",
      "migrationFailureRollback",
      "migratorAndRepeat",
      "constraintsAndTrigger",
      "draftAndVisibility",
      "publicationSnapshots",
      "rejectsInvalidDependencies",
      "leastPrivilege",
      "applicationRowsPreserved",
      "rollbackVerified",
      "hbaRestored",
    ].sort(),
  );
  assert(Object.values(report.outcomes).every((v) => v === true));
  return report;
}
export function promotionFiles(root) {
  const base = path.join(root, "lib/db/drizzle");
  const files = [
    ["proposed/0013_learning_lessons.sql", "0013_learning_lessons.sql"],
    ["proposed/meta/0013_snapshot.json", "meta/0013_snapshot.json"],
  ];
  for (const [, destination] of files)
    assert(
      !existsSync(path.join(base, destination)),
      "Promotion destination already exists; stop for state review",
    );
  return { base, files, journal: readFileSync(path.join(base, "meta/_journal.json")) };
}
// Called only after database verification, before COMMIT. On failure retain source
// evidence and stop; never automatically revert user files or retry the migration.
export function promoteSource(root, expected) {
  const current = promotionFiles(root);
  assert.deepEqual(current.journal, expected.journal, "Official journal changed");
  for (const [source, destination] of current.files)
    writeFileSync(
      path.join(current.base, destination),
      readFileSync(path.join(current.base, source)),
      { flag: "wx" },
    );
  const journalPath = path.join(current.base, "meta/_journal.json");
  const temporary = journalPath + ".lessons-promotion-pending";
  writeFileSync(
    temporary,
    readFileSync(path.join(current.base, "proposed/meta/0013_journal.json")),
    { flag: "wx" },
  );
  assert.deepEqual(readFileSync(journalPath), expected.journal, "Journal changed during promotion");
  renameSync(temporary, journalPath);
}
