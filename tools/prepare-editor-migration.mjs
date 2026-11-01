import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Offline staging only. Does not promote source or open any database connection.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { migrationManifest } from "./phase6a-local/policy.mjs";
import { assertNexusSource, nexusMigration } from "./nexus-policy.mjs";
import { assertLearningSource, learningMigration } from "./learning-policy.mjs";
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
export const editorHash = "cd2ea484ba1b6f850eb1f64b95fbe91869deecd2093061e05336588819492cef";
const source = readFileSync("lib/db/drizzle/proposed/0009_multiple_answer_questions.sql");
assert.equal(createHash("sha256").update(source).digest("hex"), editorHash);
const journal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
const manifest = migrationManifest(root);
assert([7, 8, 9, 10, 11].includes(manifest.length));
const folder = ".local/editor-migration";
mkdirSync(folder + "/meta", { recursive: true });
for (const e of manifest.slice(0, 7))
  writeFileSync(folder + "/" + e.tag + ".sql", readFileSync("lib/db/drizzle/" + e.tag + ".sql"));
for (const [tag, bytes] of [
  [nexusMigration[0], assertNexusSource(root)],
  [learningMigration[0], assertLearningSource(root)],
])
  writeFileSync(folder + "/" + tag + ".sql", bytes);
writeFileSync(folder + "/0009_multiple_answer_questions.sql", source);
const additions = [
  ...[
    [7, nexusMigration],
    [8, learningMigration],
  ].map(([idx, p]) => ({ idx, version: "7", when: p[1], tag: p[0], breakpoints: true })),
  {
    idx: 9,
    version: "7",
    when: 1792108800000,
    tag: "0009_multiple_answer_questions",
    breakpoints: true,
  },
];
writeFileSync(
  folder + "/meta/_journal.json",
  JSON.stringify({ ...journal, entries: [...journal.entries.slice(0, 7), ...additions] }, null, 2) +
    "\n",
);
writeFileSync(
  "lib/db/drizzle/proposed/meta/0009_journal.json",
  readFileSync(folder + "/meta/_journal.json"),
);
const previous = JSON.parse(
  readFileSync("lib/db/drizzle/proposed/meta/0008_snapshot.json", "utf8"),
);
const snapshot = structuredClone(previous);
snapshot.id = "ecf20009-ccaa-4000-8000-000000000009";
snapshot.prevId = previous.id;
snapshot.enums["public.question_type_v2"] = {
  name: "question_type_v2",
  schema: "public",
  values: ["MULTIPLE_CHOICE_SINGLE", "MULTIPLE_CHOICE_MULTIPLE"],
};
snapshot.tables["public.questions"].columns.type.type = "question_type_v2";
for (const table of ["public.practice_attempts", "public.learning_session_items"])
  snapshot.tables[table].columns.selected_option_key.type = "varchar(128)";
writeFileSync(
  "lib/db/drizzle/proposed/meta/0009_snapshot.json",
  JSON.stringify(snapshot, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    folder,
    sqlHash: editorHash,
    migrations: 10,
    databaseOperations: 0,
    officialJournalModified: false,
  }),
);
