// Offline only: stage immutable proposals; never connect or promote official files.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
await import('./prepare-editor-migration.mjs');
const folder = '.local/question-bank-migration';
mkdirSync(folder + '/meta', { recursive: true });
const previous = JSON.parse(
  readFileSync('lib/db/drizzle/proposed/meta/0009_snapshot.json', 'utf8'),
);
const journal = JSON.parse(readFileSync('.local/editor-migration/meta/_journal.json', 'utf8'));
for (const e of journal.entries)
  writeFileSync(
    folder + '/' + e.tag + '.sql',
    readFileSync('.local/editor-migration/' + e.tag + '.sql'),
  );
const root = process.cwd(),
  require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  '.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe',
);
const { build } = require('esbuild');
const { generateDrizzleJson } =
  await import('../node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.mjs');
const built = await build({
    entryPoints: ['lib/db/src/schema/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  }),
  module = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const generated = generateDrizzleJson(module.exports, previous.id),
  snapshot = structuredClone(previous);
snapshot.id = 'ecf20010-ccaa-4000-8000-000000000010';
snapshot.prevId = previous.id;
for (const table of ['public.question_deletion_audits', 'public.learning_session_items']) {
  assert(generated.tables[table]);
  snapshot.tables[table] = generated.tables[table];
}
const entry = {
  idx: 10,
  version: '7',
  when: 1792108801000,
  tag: '0010_universal_question_deletion',
  breakpoints: true,
};
writeFileSync(
  folder + '/' + entry.tag + '.sql',
  readFileSync('lib/db/drizzle/proposed/' + entry.tag + '.sql'),
);
for (const target of [
  folder + '/meta/_journal.json',
  'lib/db/drizzle/proposed/meta/0010_journal.json',
])
  writeFileSync(
    target,
    JSON.stringify({ ...journal, entries: [...journal.entries, entry] }, null, 2) + '\n',
  );
writeFileSync(
  'lib/db/drizzle/proposed/meta/0010_snapshot.json',
  JSON.stringify(snapshot, null, 2) + '\n',
);
console.log(
  JSON.stringify({ folder, migrations: 11, databaseOperations: 0, officialJournalModified: false }),
);
