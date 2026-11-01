import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Source-only operation. Run only after explicit approval of the Nexus upgrade.
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { assertNexusSource, nexusSnapshot, nexusMigration } from "./nexus-policy.mjs";
import { migrationManifest } from "./phase6a-local/policy.mjs";
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
assertNexusSource(root);
assert.equal(migrationManifest(root).length, 7);
const journal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
const proposed = JSON.parse(readFileSync("lib/db/drizzle/proposed/meta/0007_journal.json", "utf8"));
assert.deepEqual(proposed.entries.slice(0, 7), journal.entries);
assert.deepEqual(proposed.entries[7], {
  idx: 7,
  version: "7",
  when: nexusMigration[1],
  tag: nexusMigration[0],
  breakpoints: true,
});
const previous = JSON.parse(readFileSync("lib/db/drizzle/meta/0006_snapshot.json", "utf8")),
  next = nexusSnapshot(root);
assert.equal(next.prevId, previous.id);
for (const [name, table] of Object.entries(previous.tables))
  assert.deepEqual(next.tables[name], table);
assert(!existsSync("lib/db/drizzle/0007_nexus_sessions.sql"));
assert(!existsSync("lib/db/drizzle/meta/0007_snapshot.json"));
if (process.argv[2] === "--promote-source") {
  writeFileSync(
    "lib/db/drizzle/0007_nexus_sessions.sql",
    readFileSync("lib/db/drizzle/proposed/0007_nexus_sessions.sql"),
  );
  writeFileSync(
    "lib/db/drizzle/meta/0007_snapshot.json",
    readFileSync("lib/db/drizzle/proposed/meta/0007_snapshot.json"),
  );
  writeFileSync("lib/db/drizzle/meta/_journal.json", JSON.stringify(proposed, null, 2) + "\n");
  assert.equal(migrationManifest(root).length, 8);
}
console.log(
  JSON.stringify({
    mode: process.argv[2],
    databaseOperations: 0,
    migration: nexusMigration[0],
    requiresApprovedApplicationUpgrade: process.argv[2] === "--promote-source",
  }),
);
