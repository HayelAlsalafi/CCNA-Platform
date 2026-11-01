import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Offline source promotion only. Database execution requires separate approval.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { migrationManifest } from "./phase6a-local/policy.mjs";
import { assertLearningSource, learningSnapshot } from "./learning-policy.mjs";
const root = realpathSync(process.cwd());
assert.equal(root.replaceAll("\\", "/").toLowerCase(), portableRoot.toLowerCase());
assert.equal(
  execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
  "main",
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  "03b14526aae448e49eacd602a43bfb0e355aca4d",
);
assert.equal(process.argv.length, 3);
assert(["--plan", "--promote-source"].includes(process.argv[2]));
assertLearningSource(root);
const manifest = migrationManifest(root);
assert([7, 8].includes(manifest.length));
const current = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8")),
  proposed = JSON.parse(readFileSync("lib/db/drizzle/proposed/meta/0008_journal.json", "utf8"));
assert.equal(proposed.entries.length, 9);
assert.deepEqual(proposed.entries.slice(0, manifest.length), current.entries);
const next = learningSnapshot(root),
  previous = JSON.parse(readFileSync("lib/db/drizzle/proposed/meta/0007_snapshot.json", "utf8"));
assert.equal(next.prevId, previous.id);
for (const [key, value] of Object.entries(previous.tables))
  assert.deepEqual(next.tables[key], value);
for (let i = manifest.length; i < 9; i++) {
  const entry = proposed.entries[i],
    tag = String(i).padStart(4, "0");
  assert.equal(entry.idx, i);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
  assert(!existsSync("lib/db/drizzle/" + entry.tag + ".sql"));
  assert(!existsSync("lib/db/drizzle/meta/" + tag + "_snapshot.json"));
}
// Validate the future entries too, without modifying files in plan mode.
const { nexusMigration } = await import("./nexus-policy.mjs"),
  { learningMigration } = await import("./learning-policy.mjs");
for (const [index, expected] of [
  [7, nexusMigration],
  [8, learningMigration],
])
  assert.deepEqual(proposed.entries[index], {
    idx: index,
    version: "7",
    when: expected[1],
    tag: expected[0],
    breakpoints: true,
  });
if (process.argv[2] === "--promote-source") {
  for (let i = manifest.length; i < 9; i++) {
    const entry = proposed.entries[i],
      tag = String(i).padStart(4, "0");
    writeFileSync(
      "lib/db/drizzle/" + entry.tag + ".sql",
      readFileSync("lib/db/drizzle/proposed/" + entry.tag + ".sql"),
    );
    writeFileSync(
      "lib/db/drizzle/meta/" + tag + "_snapshot.json",
      readFileSync("lib/db/drizzle/proposed/meta/" + tag + "_snapshot.json"),
    );
  }
  writeFileSync("lib/db/drizzle/meta/_journal.json", JSON.stringify(proposed, null, 2) + "\n");
  assert.equal(migrationManifest(root).length, 9);
}
console.log(
  JSON.stringify({
    mode: process.argv[2],
    pending: proposed.entries.slice(manifest.length).map((e) => e.tag),
    databaseOperations: 0,
  }),
);
