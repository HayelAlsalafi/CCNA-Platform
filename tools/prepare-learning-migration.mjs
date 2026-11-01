// Offline only. The existing 0007 proposal remains pinned and unchanged.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { assertNexusSource } from "./nexus-policy.mjs";
await import("./prepare-nexus-migration.mjs");
const root = process.cwd(),
  folder = path.join(root, ".local/learning-migration");
assertNexusSource(root);
mkdirSync(path.join(folder, "meta"), { recursive: true });
const journal = JSON.parse(readFileSync(".local/nexus-migration/meta/_journal.json", "utf8"));
assert.equal(journal.entries.length, 8);
for (const entry of journal.entries)
  writeFileSync(
    path.join(folder, entry.tag + ".sql"),
    readFileSync(".local/nexus-migration/" + entry.tag + ".sql"),
  );
const entry = {
    idx: 8,
    version: "7",
    when: 1792022401000,
    tag: "0008_learning_achievements",
    breakpoints: true,
  },
  source = readFileSync("lib/db/drizzle/proposed/" + entry.tag + ".sql");
writeFileSync(path.join(folder, entry.tag + ".sql"), source);
writeFileSync(
  path.join(folder, "meta/_journal.json"),
  JSON.stringify({ ...journal, entries: [...journal.entries, entry] }, null, 2) + "\n",
);
const require = createRequire(path.join(root, "artifacts/api-server/package.json")),
  { build } = require("esbuild"),
  { generateDrizzleJson } =
    await import("../node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.mjs");
const result = await build({
    entryPoints: ["lib/db/src/schema/index.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  }),
  module = { exports: {} };
new Function("module", "exports", "require", result.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const previous = JSON.parse(
    readFileSync("lib/db/drizzle/proposed/meta/0007_snapshot.json", "utf8"),
  ),
  generated = generateDrizzleJson(module.exports, previous.id),
  snapshot = {
    ...previous,
    id: "ecf20008-ccaa-4000-8000-000000000008",
    prevId: previous.id,
    tables: { ...previous.tables },
  };
for (const table of ["public.achievement_definitions", "public.learner_achievements"]) {
  assert(generated.tables[table]);
  snapshot.tables[table] = generated.tables[table];
}
const text = JSON.stringify(snapshot, null, 2) + "\n";
writeFileSync("lib/db/drizzle/proposed/meta/0008_snapshot.json", text);
writeFileSync(path.join(folder, "meta/0008_snapshot.json"), text);
writeFileSync(
  "lib/db/drizzle/proposed/meta/0008_journal.json",
  JSON.stringify({ ...journal, entries: [...journal.entries, entry] }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    folder,
    sqlHash: createHash("sha256").update(source).digest("hex"),
    snapshotHash: createHash("sha256").update(text).digest("hex"),
    databaseOperations: 0,
    officialJournalModified: false,
  }),
);
