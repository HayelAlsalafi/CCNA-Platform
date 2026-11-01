// Uses existing installed packages, disables env files and database test flags.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd(),
  mode = process.argv[2];
if (!['api', 'frontend'].includes(mode)) throw Error('Use api or frontend');
for (const name of Object.keys(process.env))
  if (/DATABASE|CLERK|NEON|^PG|^REPL|^VITE_/i.test(name)) delete process.env[name];
process.env.RUN_DB_TESTS = '0';
process.env.RUN_REVISION_DB_TESTS = '0';
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  '.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe',
);
const folder = readdirSync('node_modules/.pnpm').find((p) => p.startsWith('vitest@3.2.7_'));
const cli = path.join(root, 'node_modules/.pnpm', folder, 'node_modules/vitest/vitest.mjs');
if (!existsSync(cli)) throw Error('Installed Vitest missing; no automatic install');
const files =
  mode === 'api'
    ? [
        'src/lib/question-import-files.test.ts',
        'src/lib/question-import.test.ts',
        'src/lib/taxonomy-admin.test.ts',
        'src/routes/admin-content.test.ts',
        'src/lib/exam-taxonomy.schema.test.ts',
        'src/lib/exam-taxonomy.validation.test.ts',
        'src/lib/questions.validation.test.ts',
        'src/routes/admin-questions.test.ts',
        'src/routes/admin-topics.test.ts',
        'src/routes/admin-mutation.test.ts',
        'src/middlewares/auth.test.ts',
      ]
    : [
        'src/components/admin-content.test.tsx',
        'src/components/admin-modernization.test.tsx',
        'src/components/admin-session.test.tsx',
        'src/lib/admin-session.test.ts',
        'src/lib/catalog-cache.test.ts',
        'src/components/clerk-request-auth.test.tsx',
      ];
const result = spawnSync(
  process.execPath,
  [
    cli,
    'run',
    '--config',
    path.join(root, 'tools/admin-unit.config.mjs'),
    ...files,
    '--reporter=dot',
  ],
  {
    cwd: path.join(root, mode === 'api' ? 'artifacts/api-server' : 'artifacts/ccna-learning'),
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
