import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd(),
  req = createRequire(path.join(root, "lib/db/package.json"));
const { buildSync } = req(
  path.join(root, "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js"),
);
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
mkdirSync(".local/canonical-metadata", { recursive: true });
buildSync({
  entryPoints: ["lib/db/src/schema/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ".local/canonical-metadata/schema.cjs",
  logLevel: "silent",
});
const schema = req(path.join(root, ".local/canonical-metadata/schema.cjs"));
buildSync({
  entryPoints: ["lib/ccna-book-chapters.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ".local/canonical-metadata/catalog.cjs",
  logLevel: "silent",
});
const catalog = req(path.join(root, ".local/canonical-metadata/catalog.cjs"));
writeFileSync(
  "lib/canonical-chapters.json",
  JSON.stringify(
    {
      domains: catalog.ccnaBookDomains.map(({ chapters, ...d }) => ({
        ...d,
        chapterCount: chapters.length,
      })),
      chapters: catalog.ccnaBookChapters,
    },
    null,
    2,
  ) + "\n",
);
const { generateDrizzleJson, generateMigration } = req(
  path.join(root, "node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.js"),
);
const old = JSON.parse(readFileSync("lib/db/drizzle/meta/0010_snapshot.json", "utf8"));
const generated = generateDrizzleJson(schema, old.id);
const next = structuredClone(old);
next.id = "ecf20011-ccaa-4000-8000-000000000011";
next.prevId = old.id;
next.tables["public.curriculum_chapters"] = generated.tables["public.curriculum_chapters"];
next.tables["public.questions"].foreignKeys.questions_chapter_fk =
  generated.tables["public.questions"].foreignKeys.questions_chapter_fk;
if (
  !next.tables["public.curriculum_chapters"] ||
  !next.tables["public.questions"].foreignKeys.questions_chapter_fk
)
  throw Error("Missing generated canonical metadata");
const statements = await generateMigration(old, next);
if (statements.some((s) => /^\s*(DROP|TRUNCATE|DELETE|ALTER[^;]*DISABLE TRIGGER)\b/im.test(s)))
  throw Error("Unexpected destructive DDL");
writeFileSync(
  "lib/db/drizzle/proposed/0011_canonical_book_chapters.sql",
  "-- Guarded development reset prerequisite: questions must be empty.\n" +
    statements.join("\n--> statement-breakpoint\n") +
    "\n",
);
writeFileSync(
  "lib/db/drizzle/proposed/meta/0011_snapshot.json",
  JSON.stringify(next, null, 2) + "\n",
);
const journal = JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8"));
if (journal.entries.length !== 11) throw Error("Unexpected official journal");
journal.entries.push({
  idx: 11,
  version: "7",
  when: 1792195200000,
  tag: "0011_canonical_book_chapters",
  breakpoints: true,
});
writeFileSync(
  "lib/db/drizzle/proposed/meta/0011_journal.json",
  JSON.stringify(journal, null, 2) + "\n",
);
console.log(
  "Prepared proposed 0011 SQL and metadata without a connection or official journal change.",
);
