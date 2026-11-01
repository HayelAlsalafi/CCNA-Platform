import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Offline staging only. No database client, credentials or environment-file access.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
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
const currentJournal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
assert([7,8,9].includes(currentJournal.entries.length));
const journal={...currentJournal,entries:currentJournal.entries.slice(0,7)};
const folder = path.join(root, ".local/nexus-migration");
mkdirSync(path.join(folder, "meta"), { recursive: true });
const hashes = journal.entries.map((e) => {
  const bytes = readFileSync("lib/db/drizzle/" + e.tag + ".sql");
  writeFileSync(path.join(folder, e.tag + ".sql"), bytes);
  return { tag: e.tag, when: e.when, hash: createHash("sha256").update(bytes).digest("hex") };
});
const proposal = readFileSync("lib/db/drizzle/proposed/0007_nexus_sessions.sql");
const entry = {
  idx: 7,
  version: "7",
  when: 1792022400000,
  tag: "0007_nexus_sessions",
  breakpoints: true,
};
writeFileSync(path.join(folder, entry.tag + ".sql"), proposal);
writeFileSync(
  path.join(folder, "meta/_journal.json"),
  JSON.stringify({ ...journal, entries: [...journal.entries, entry] }, null, 2) + "\n",
);
hashes.push({
  tag: entry.tag,
  when: entry.when,
  hash: createHash("sha256").update(proposal).digest("hex"),
});
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const { build } = require("esbuild");
const { generateDrizzleJson } =
  await import("../node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.mjs");
const result = await build({
  entryPoints: ["lib/db/src/schema/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  logLevel: "silent",
});
const module = { exports: {} };
new Function("module", "exports", "require", result.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const previous = JSON.parse(readFileSync("lib/db/drizzle/meta/0006_snapshot.json", "utf8"));
const generated = generateDrizzleJson(module.exports, previous.id);
const snapshot = {
  ...previous,
  id: "ecf20007-ccaa-4000-8000-000000000007",
  prevId: previous.id,
  tables: { ...previous.tables },
};
for (const table of ["public.learning_sessions", "public.learning_session_items"]) {
  assert(generated.tables[table]);
  snapshot.tables[table] = generated.tables[table];
}
// Stage the immutable 0007 SQL shape, even when the current model targets a later proposal.
snapshot.tables["public.learning_session_items"].columns.selected_option_key.type="varchar(8)";
const snapshotText = JSON.stringify(snapshot, null, 2) + "\n";
writeFileSync(path.join(folder, "meta/0007_snapshot.json"), snapshotText);
mkdirSync("lib/db/drizzle/proposed/meta", { recursive: true });
writeFileSync("lib/db/drizzle/proposed/meta/0007_snapshot.json", snapshotText);
writeFileSync(
  "lib/db/drizzle/proposed/meta/0007_journal.json",
  JSON.stringify({ ...journal, entries: [...journal.entries, entry] }, null, 2) + "\n",
);
writeFileSync(
  path.join(folder, "manifest.json"),
  JSON.stringify(
    { folder, entries: hashes, officialJournalModified: false, databaseOperations: 0 },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    folder,
    proposalHash: hashes[7].hash,
    databaseOperations: 0,
    officialJournalModified: false,
  }),
);
