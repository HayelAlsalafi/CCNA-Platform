import {readEvidenceFileSync as readFileSync} from '../workspace-root.mjs';
import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
import assert from "node:assert/strict";
import {writeFileSync,mkdirSync,realpathSync} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { readinessPlan } from "./readiness.mjs";
import { assertLessonSource, lessonMigration } from "./policy.mjs";
export const backupReceipt = Object.freeze({
  report:
    portableRoot + "/.local/question-bank-upgrade/lessons-2026-10-27T21-10-38.180Z-0491c14c-c71d-44c5-9cda-ab24e32aeadf/lesson-backup.json",
  hash: "ef4e8eb7dd4d734f929d8d80990c0839d7553d5df6ea057f12c559a65c40bc1a",
});
export function preparedPlan(root) {
  const base = readinessPlan(root);
  assertLessonSource(root);
  const journal = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0013_journal.json"), "utf8"),
  );
  const official = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json"), "utf8"),
  );
  assert.deepEqual(journal.entries.slice(0, 12), official.entries);
  return {
    ...base,
    journal,
    manifest: [
      ...base.manifest,
      { tag: lessonMigration[0], when: lessonMigration[1], hash: lessonMigration[2] },
    ],
  };
}
export function verifyFreshBackup(root) {
  const report = JSON.parse(readFileSync(backupReceipt.report, "utf8"));
  const folder = path.dirname(realpathSync(backupReceipt.report));
  assert(
    folder
      .replaceAll("\\", "/")
      .startsWith(root.replaceAll("\\", "/") + "/.local/question-bank-upgrade/lessons-"),
  );
  const archive = realpathSync(report.backup.path);
  assert.equal(path.dirname(archive), folder);
  assert.equal(path.basename(archive), "before-upgrade.dump");
  assert.equal(
    createHash("sha256").update(readFileSync(archive)).digest("hex"),
    backupReceipt.hash,
  );
  assert.equal(report.backup.sha256, backupReceipt.hash);
  assert.equal(report.databaseWrites, 0);
  assert.equal(report.baselineSchemaMatched, true);
  for (const flag of ["snapshotConsistent", "tocVerified", "fullArchiveDecodeVerified"])
    assert.equal(report.backup[flag], true);
  assert.equal(report.identity.systemIdentifier, "7694701597474139084");
  assert.equal(report.identity.database, "ccna_phase6a_dev");
  return { report, archive, folder };
}
export function stageMigrations(root, folder, includeLesson = true) {
  const plan = preparedPlan(root);
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const entries = plan.journal.entries.slice(0, includeLesson ? 13 : 12);
  for (const entry of entries)
    writeFileSync(
      path.join(folder, entry.tag + ".sql"),
      readFileSync(
        path.join(root, "lib/db/drizzle", entry.idx === 12 ? "proposed" : "", entry.tag + ".sql"),
      ),
      { flag: "wx" },
    );
  writeFileSync(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({ ...plan.journal, entries }, null, 2) + "\n",
    { flag: "wx" },
  );
  return { manifest: plan.manifest.slice(0, entries.length), folder };
}
