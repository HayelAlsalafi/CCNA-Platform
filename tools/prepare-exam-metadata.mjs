// Offline proposal generation only. Never imports the application's DB pool.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd(),
  req = createRequire(path.join(root, "lib/db/package.json"));
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
mkdirSync(".local/exam-metadata", { recursive: true });
req(
  path.join(root, "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"),
).buildSync({
  entryPoints: ["lib/db/src/schema/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ".local/exam-metadata/schema.cjs",
  logLevel: "silent",
});
const schema = req(path.join(root, ".local/exam-metadata/schema.cjs"));
const { generateDrizzleJson, generateMigration } = req(
  path.join(root, "node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.js"),
);
const old = JSON.parse(readFileSync("lib/db/drizzle/meta/0011_snapshot.json", "utf8"));
const generated = generateDrizzleJson(schema, old.id),
  next = structuredClone(old);
next.id = "ecf20012-ccaa-4000-8000-000000000012";
next.prevId = old.id;
for (const table of ["public.exam_sessions", "public.exam_session_items"])
  next.tables[table] = generated.tables[table];
const statements = await generateMigration(old, next);
if (
  statements.some(
    (s) => !/^CREATE (TABLE|INDEX|UNIQUE INDEX)|^ALTER TABLE.*ADD CONSTRAINT/s.test(s),
  )
)
  throw Error("Unexpected proposal DDL");
writeFileSync(
  "lib/db/drizzle/proposed/0012_exam_simulator.sql",
  "-- PROPOSAL ONLY. Apply only through a separately approved guarded migration.\n" +
    statements.join("\n--> statement-breakpoint\n") +
    "\n" +
    readFileSync("tools/exam-guards.sql", "utf8").replace(/^\uFEFF/, ""),
);
writeFileSync(
  "lib/db/drizzle/proposed/meta/0012_snapshot.json",
  JSON.stringify(next, null, 2) + "\n",
);
const journal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
if (journal.entries.length !== 12) throw Error("Expected reviewed twelve-entry source baseline");
journal.entries.push({
  idx: 12,
  version: "7",
  when: 1792368000000,
  tag: "0012_exam_simulator",
  breakpoints: true,
});
writeFileSync(
  "lib/db/drizzle/proposed/meta/0012_journal.json",
  JSON.stringify(journal, null, 2) + "\n",
);
console.log("Prepared proposed 0012 only. No database connection or official promotion.");
