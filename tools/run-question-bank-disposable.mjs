import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Reuses only the previously approved empty private Drizzle-check database.
import assert from 'node:assert/strict';
import { realpathSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { questionBankPlan } from './question-bank-upgrade-core.mjs';
import {
  withDisposableAccess,
  disposable,
  sterileEnvironment,
} from './question-bank-disposable-access.mjs';
import { emptyRestoreCheck } from './question-bank-empty-restore-check.mjs';
const root = realpathSync(process.cwd()),
  mode = process.argv[2] ?? '--plan';
assert.equal(root.replaceAll('\\', '/').toLowerCase(), portableRoot.toLowerCase());
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'main',
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  '03b14526aae448e49eacd602a43bfb0e355aca4d',
);
assert(process.argv.length <= 3 && ['--plan', '--execute-isolated'].includes(mode));
const plan = questionBankPlan(root);
if (mode === '--plan') {
  console.log(
    JSON.stringify(
      {
        target: disposable,
        migrations: plan.manifest.map((m) => m.tag),
        databaseOperations: 0,
        transactions: 'ROLLBACK ONLY',
        hba: 'Temporary exact database/owner/IPv4 rule; restored byte-for-byte',
        sequence: 'Only disposable ledger/question sequences may advance',
      },
      null,
      2,
    ),
  );
} else
  await withDisposableAccess(root, async () => {
    const env = {
      ...sterileEnvironment(),
      RUN_QUESTION_BANK_DISPOSABLE_TESTS: '1',
      ESBUILD_BINARY_PATH: path.join(
        root,
        '.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe',
      ),
    };
    const folder = readdirSync('node_modules/.pnpm').find((n) => n.startsWith('vitest@3.2.7_'));
    assert(folder);
    const r = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/.pnpm', folder, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'tools/question-bank-disposable.config.mjs',
        '--reporter=verbose',
      ],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    process.stdout.write(r.stdout ?? '');
    process.stderr.write(r.stderr ?? '');
    if (r.error) throw Error('Isolated tests exceeded bounded deadline');
    process.exitCode = r.status ?? 1;
  });
if (mode === '--execute-isolated' && !process.exitCode)
  console.log(JSON.stringify(await emptyRestoreCheck(root)));
