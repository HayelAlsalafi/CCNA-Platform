import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = new Map();
for (const folder of readdirSync(path.join(root, 'node_modules/.pnpm'))) {
  const cache = path.join(root, 'node_modules/.pnpm', folder, 'node_modules');
  if (!existsSync(cache)) continue;
  for (const name of readdirSync(cache)) {
    if (name.startsWith('.')) continue;
    const entries = name.startsWith('@')
      ? readdirSync(path.join(cache, name)).map((n) => [name + '/' + n, path.join(cache, name, n)])
      : [[name, path.join(cache, name)]];
    for (const [key, dir] of entries)
      if (existsSync(path.join(dir, 'package.json')) && !packages.has(key)) packages.set(key, dir);
  }
}
function runtime(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const key of ['import', 'node', 'default', 'require', 'browser'])
      if (value[key]) {
        const found = runtime(value[key]);
        if (found) return found;
      }
  }
}
const alias = [];
for (const [name, dir] of packages) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const exports = pkg.exports;
  if (
    exports &&
    typeof exports === 'object' &&
    Object.keys(exports).some((k) => k.startsWith('.'))
  ) {
    for (const [sub, config] of Object.entries(exports)) {
      if (sub.includes('*')) continue;
      const entry = runtime(config);
      if (entry)
        alias.push({
          find: new RegExp(
            '^' +
              (name + (sub === '.' ? '' : sub.slice(1))).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
              '$',
          ),
          replacement: path.join(dir, entry),
        });
    }
  } else {
    const entry = runtime(exports);
    alias.push({
      find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
      replacement: entry ? path.join(dir, entry) : dir,
    });
  }
}
for (const dir of readdirSync(path.join(root, 'lib'))) {
  const pkgFile = path.join(root, 'lib', dir, 'package.json');
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  alias.unshift({ find: pkg.name, replacement: path.join(root, 'lib', dir, 'src/index.ts') });
}
alias.unshift(
  { find: '@workspace/db/schema', replacement: path.join(root, 'lib/db/src/schema/index.ts') },
  { find: '@', replacement: path.join(root, 'artifacts/ccna-learning/src') },
);
export default {
  envDir: false,
  esbuild: { jsx: 'automatic' },
  resolve: { alias },
  test: {
    environment: 'node',
    exclude: ['**/*.db.test.ts', '**/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
};
