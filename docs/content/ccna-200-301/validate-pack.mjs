import {portableRoot} from '../../../tools/workspace-root.mjs';
// Installed-cache unit runner only; no env files, network or DB tests.
import { readdirSync, existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
if (
  process.cwd().replaceAll("\\", "/").toLowerCase() !== root.replaceAll("\\", "/").toLowerCase() ||
  root.replaceAll("\\", "/").toLowerCase() !== portableRoot.toLowerCase()
)
  throw Error("Wrong workspace.");
for (const name of Object.keys(process.env))
  if (/DATABASE|CLERK|NEON|^PG|^REPL|^VITE_|NODE_OPTIONS|DOTENV/i.test(name))
    delete process.env[name];
process.env.RUN_DB_TESTS = "0";
process.env.RUN_REVISION_DB_TESTS = "0";
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const folder = readdirSync(path.join(root, "node_modules/.pnpm")).find((n) =>
  n.startsWith("vitest@3.2.7_"),
);
const cli = path.join(root, "node_modules/.pnpm", folder, "node_modules/vitest/vitest.mjs");
if (!existsSync(cli)) throw Error("Installed Vitest unavailable; no automatic install.");
const inputFlags = new Map(),
  argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (
    !["--csv", "--catalog", "--bindings"].includes(argv[i]) ||
    !argv[i + 1] ||
    inputFlags.has(argv[i])
  )
    throw Error("Use all three unique --csv, --catalog and --bindings paths.");
  inputFlags.set(argv[i], argv[i + 1]);
}
if (inputFlags.size && inputFlags.size !== 3)
  throw Error("Supply CSV, catalog snapshot and bindings together.");
for (const [flag, variable] of [
  ["--csv", "CCNA_CONTENT_CSV"],
  ["--catalog", "CCNA_CONTENT_CATALOG"],
  ["--bindings", "CCNA_CONTENT_BINDINGS"],
]) {
  delete process.env[variable];
  if (inputFlags.size) {
    const file = realpathSync(path.resolve(inputFlags.get(flag)));
    const content = realpathSync(path.join(root, "docs/content/ccna-200-301"));
    if (!file.toLowerCase().startsWith(content.toLowerCase() + path.sep))
      throw Error("Validation inputs must be in the content folder.");
    process.env[variable] = file;
  }
}
const result = spawnSync(
  process.execPath,
  [
    cli,
    "run",
    "--root",
    root,
    "--config",
    path.join(root, "tools/admin-unit.config.mjs"),
    "docs/content/ccna-200-301/pilot-content.test.ts",
    "docs/content/ccna-200-301/manual-admin-workflow.test.ts",
    ...(inputFlags.size ? ["docs/content/ccna-200-301/final-import.test.ts"] : []),
    "--reporter=dot",
  ],
  { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
