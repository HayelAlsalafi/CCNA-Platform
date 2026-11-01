// Source-only promotion/check. Never imports a DB client or reads credentials.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  '.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe',
);
const { build } = require('esbuild');
const { generateDrizzleJson } = await import(
  new URL(
    '../node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.mjs',
    import.meta.url,
  )
);
const result = await build({
  entryPoints: [path.join(root, 'lib/db/src/schema/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent',
});
// Evaluate only the bundled schema exports; no @workspace/db entrypoint/config.
const schemaModule = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(
  schemaModule,
  schemaModule.exports,
  require,
);
const previous = JSON.parse(
  readFileSync(path.join(root, 'lib/db/drizzle/meta/0004_snapshot.json'), 'utf8'),
);
const generated = JSON.parse(
  JSON.stringify(generateDrizzleJson(schemaModule.exports, previous.id)),
);
const tables = ['exam_blueprints', 'exam_domains', 'exam_objectives', 'question_objectives'];
const snapshot = {
  ...previous,
  id: randomUUID(),
  prevId: previous.id,
  tables: { ...previous.tables },
  enums: { ...previous.enums },
};
for (const table of tables) {
  assert(generated.tables['public.' + table]);
  snapshot.tables['public.' + table] = generated.tables['public.' + table];
}
snapshot.enums['public.exam_blueprint_status'] = generated.enums['public.exam_blueprint_status'];
const proposal = readFileSync(path.join(root, 'lib/db/drizzle/proposed/0005_exam_taxonomy.sql'));
assert.equal(
  createHash('sha256').update(proposal).digest('hex'),
  'd1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226',
);
const journalPath = path.join(root, 'lib/db/drizzle/meta/_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
if (process.argv[2] === '--prepare') {
  assert.equal(journal.entries.length, 5);
  assert.equal(journal.entries.at(-1).tag, '0004_question_revisions');
  writeFileSync(path.join(root, 'lib/db/drizzle/0005_exam_taxonomy.sql'), proposal, { flag: 'wx' });
  writeFileSync(
    path.join(root, 'lib/db/drizzle/meta/0005_snapshot.json'),
    JSON.stringify(snapshot, null, 2) + '\n',
    { flag: 'wx' },
  );
  journal.entries.push({
    idx: 5,
    version: '7',
    when: Math.max(Date.now(), journal.entries.at(-1).when + 1),
    tag: '0005_exam_taxonomy',
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
} else assert(process.argv.length === 2 || process.argv[2] === '--check');
const promoted = JSON.parse(
  readFileSync(path.join(root, 'lib/db/drizzle/meta/0005_snapshot.json'), 'utf8'),
);
for (const [name, table] of Object.entries(previous.tables))
  assert.deepEqual(promoted.tables[name], table);
for (const name of tables)
  assert.deepEqual(promoted.tables['public.' + name], generated.tables['public.' + name]);
assert.deepEqual(promoted.enums, snapshot.enums);
assert.equal(promoted.prevId, previous.id);
for (const key of ['schemas', 'sequences', 'roles', 'policies', 'views', '_meta'])
  assert.deepEqual(promoted[key], previous[key]);
assert(readFileSync(path.join(root, 'lib/db/drizzle/0005_exam_taxonomy.sql')).equals(proposal));
const finalJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
assert.deepEqual(
  finalJournal.entries.map((e) => e.idx),
  [0, 1, 2, 3, 4, 5],
);
assert.equal(finalJournal.entries.at(-1).tag, '0005_exam_taxonomy');
assert(finalJournal.entries.every((e, i, a) => !i || e.when > a[i - 1].when));
console.log(
  'PASS: official 0005 matches rehearsed SQL; snapshot preserves existing objects; journal order 0–5. No database operations.',
);
