// Focused offline fixtures only; no env files, database or running-app requests.
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = process.cwd();
const native = path.join(root, ".local/native-deps/node_modules");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/DATABASE|CLERK|NEON|^PG|DOTENV|NODE_OPTIONS|^VITE_/i.test(key),
  ),
);
env.RUN_DB_TESTS = "0";
env.RUN_REVISION_DB_TESTS = "0";
env.NODE_PATH = [
  native,
  ...readdirSync(path.join(native, ".pnpm"))
    .map((folder) => path.join(native, ".pnpm", folder, "node_modules"))
    .filter((dir) => existsSync(dir)),
].join(path.delimiter);
env.ESBUILD_BINARY_PATH = path.join(
  native,
  ".pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const folder = readdirSync(path.join(root, "node_modules/.pnpm")).find((name) =>
  name.startsWith("vitest@3.2.7_"),
);
if (!folder) throw Error("Installed Vitest unavailable; no automatic installation.");
const tests = [
  "artifacts/api-server/src/lib/phase2d-media.test.ts",
  "artifacts/api-server/src/lib/lesson-media.test.ts",
  "artifacts/api-server/src/lib/study.test.ts",
  "artifacts/api-server/src/routes/study.test.ts",
  "artifacts/ccna-learning/src/components/phase2d-study-export.test.ts",
  "artifacts/ccna-learning/src/components/phase2c-editor-reader.test.tsx",
  "artifacts/ccna-learning/src/components/visual-lessons.test.tsx",
  "artifacts/ccna-learning/src/components/lessons.test.tsx",
  "artifacts/ccna-learning/src/components/study.test.tsx",
  "artifacts/ccna-learning/src/components/chapter1-content.test.tsx",
  "artifacts/api-server/src/lib/visual-lessons.test.ts",
];
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/.pnpm", folder, "node_modules/vitest/vitest.mjs"),
    "run",
    "--config",
    "tools/admin-unit.config.mjs",
    ...tests,
    "--reporter=dot",
    "--testNamePattern=^(?!.*proposes only three additive tables with owner RLS and revision restrictions).*$",
  ],
  { cwd: root, env, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
