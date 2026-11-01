import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Existing installed tooling only. Tests mock PostgreSQL; never load environment files.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
if (root.replaceAll("\\", "/").toLowerCase() !== portableRoot.toLowerCase())
  throw Error("Wrong workspace.");
for (const name of Object.keys(process.env))
  if (/DATABASE|CLERK|NEON|^PG|^REPL|^VITE_|DOTENV|NODE_OPTIONS/i.test(name))
    delete process.env[name];
process.env.RUN_DB_TESTS = "0";
process.env.RUN_REVISION_DB_TESTS = "0";
// Match the offline build's existing local Windows-native dependency cache.
// No installation or package-tree changes; child Node resolves Rollup here.
const nativeRoot = path.join(root, ".local/native-deps/node_modules");
process.env.NODE_PATH = [nativeRoot, ...readdirSync(path.join(nativeRoot, ".pnpm"))
  .map(folder => path.join(nativeRoot, ".pnpm", folder, "node_modules"))
  .filter(folder => existsSync(folder))].join(path.delimiter);
process.env.ESBUILD_BINARY_PATH = path.join(
  root,
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
const folder = readdirSync("node_modules/.pnpm").find((p) => p.startsWith("vitest@3.2.7_"));
const cli = path.join(root, "node_modules/.pnpm", folder ?? "", "node_modules/vitest/vitest.mjs");
if (!existsSync(cli)) throw Error("Installed Vitest missing; no automatic install.");
const lessonIsolated=process.argv[2]==="--lesson-db";
process.env.RUN_LESSON_DISPOSABLE_TESTS=lessonIsolated?"1":"0";
const examIsolated=process.argv[2]==="--exam-db";
const isolated=process.argv[2]==="--canonical-db"||examIsolated||lessonIsolated;
if(examIsolated)process.env.RUN_EXAM_DISPOSABLE_TESTS="1";
if(isolated&&!examIsolated&&!lessonIsolated)process.env.RUN_CANONICAL_DISPOSABLE_TESTS="1";
const files = [
  "artifacts/ccna-learning/src/components/visual-lessons.test.tsx",
  "artifacts/api-server/src/lib/visual-lessons.test.ts",
  "artifacts/api-server/src/lib/lessons.test.ts",
  "artifacts/api-server/src/lib/study.test.ts",
  "artifacts/api-server/src/lib/lesson-media.test.ts",
  "artifacts/api-server/src/routes/study.test.ts",
  "artifacts/ccna-learning/src/components/study.test.tsx",
  "artifacts/api-server/src/routes/lessons.test.ts",
  "artifacts/ccna-learning/src/components/lessons.test.tsx",
  "artifacts/api-server/src/lib/command-center.test.ts",
  "artifacts/api-server/src/routes/command-center.test.ts",
  "artifacts/ccna-learning/src/components/command-center.test.tsx",
  "artifacts/api-server/src/lib/exams.test.ts",
  "artifacts/api-server/src/routes/exams.test.ts",
  "artifacts/ccna-learning/src/pages/exams.test.tsx",
  "artifacts/ccna-learning/src/components/application-shell.test.tsx",
  "artifacts/api-server/src/lib/canonical-chapters.test.ts",
  "artifacts/ccna-learning/src/lib/ccna-book-chapters.test.ts",
  "artifacts/ccna-learning/src/components/taxonomy-book-chapters.test.tsx",
  "artifacts/api-server/src/lib/taxonomy-admin.test.ts",
  "artifacts/api-server/src/routes/admin-content.test.ts",
  "artifacts/api-server/src/lib/questions.validation.test.ts",
  "artifacts/api-server/src/lib/multiple-answer.test.ts",
  'artifacts/api-server/src/routes/learning-evidence.test.ts',
  'artifacts/ccna-learning/src/components/learning-evidence.test.tsx',
  'artifacts/api-server/src/lib/learning-evidence.test.ts',
  'artifacts/api-server/src/lib/nexus.test.ts',
  'artifacts/ccna-learning/src/pages/nexus.test.tsx',
  'artifacts/ccna-learning/src/components/question-content.test.tsx',
  'artifacts/api-server/src/lib/question-studio.test.ts',
  'artifacts/ccna-learning/src/components/question-bank-studio.test.tsx',
  'artifacts/api-server/src/lib/topics-management.test.ts',
  'artifacts/ccna-learning/src/components/topics-manager.test.tsx',
  'tools/phase8a-cleanup/provenance-diagnostics.test.ts',
  'tools/phase8a-cleanup/final-planner.test.ts',
  'artifacts/api-server/src/lib/admin-history-delete.test.ts',
  'artifacts/ccna-learning/src/components/admin-session.test.tsx',
  'artifacts/ccna-learning/src/lib/admin-session.test.ts',
  'artifacts/ccna-learning/src/components/admin-delete-controls.test.tsx',
  'artifacts/api-server/src/lib/admin-delete.test.ts',
  'artifacts/api-server/src/lib/practice-batch.test.ts',
  'artifacts/api-server/src/routes/admin-questions.test.ts',
  'artifacts/api-server/src/routes/admin-topics.test.ts',
  'artifacts/ccna-learning/src/lib/practice-run.test.ts',
  'tools/phase8a-cleanup/topic-dependencies.test.ts',
  'tools/phase8a-cleanup/authentication.test.ts',
  'artifacts/api-server/src/routes/learning-catalog.test.ts',
  'tools/phase8a-cleanup/planner.test.ts',
  'artifacts/ccna-learning/src/pages/legacy-cleanup.test.tsx',
  'artifacts/ccna-learning/src/lib/catalog-cache.test.ts',
  'artifacts/ccna-learning/src/lib/exam-simulator.test.ts',
  'artifacts/ccna-learning/src/pages/practice-history.test.ts',
  'artifacts/ccna-learning/src/lib/learning-progress-cache.test.ts',
  "artifacts/api-server/src/lib/curriculum.test.ts",
  "artifacts/api-server/src/routes/curriculum.test.ts",
  "artifacts/api-server/src/middlewares/auth.test.ts",
  "artifacts/api-server/src/routes/learning-progress.test.ts",
  "artifacts/api-server/src/lib/practice.test.ts",
  "artifacts/api-server/src/routes/practice.test.ts",
  "artifacts/ccna-learning/src/pages/curriculum.test.tsx",
  "artifacts/ccna-learning/src/pages/learning-progress.test.ts",
  "artifacts/ccna-learning/src/components/practice-workspace.test.tsx",
  "artifacts/ccna-learning/src/components/admin-modernization.test.tsx",
  "artifacts/ccna-learning/src/components/admin-content.test.tsx",
];
const selectedFiles=lessonIsolated?["tools/lesson-activation/isolated.db.test.ts"]:process.argv[2]==="--lessons"?files.filter(f=>/study\.test|lesson-media\.test|lessons\.test|curriculum\.test|application-shell|admin-session\.test|learning-progress-cache\.test/.test(f)):process.argv[2]==="--command-center"?files.filter(f=>/command-center\.test|nexus\.test|learning-evidence\.test|learning-progress-cache\.test/.test(f)):process.argv[2]==="--exams"?files.filter(f=>/exams.test|legacy-cleanup|application-shell|learning-progress-cache.test|admin-history-delete.test|admin-delete-controls.test/.test(f)):process.argv[2]==="--shell"?files.filter(f=>/application-shell|admin-modernization|admin-session.test.tsx|nexus.test.tsx|curriculum.test.tsx|legacy-cleanup/.test(f)):isolated?[examIsolated?"tools/exam-disposable.db.test.ts":"tools/canonical-chapters.db.test.ts"]:process.argv[2]==="--canonical"?files.filter(f=>/canonical-chapters|ccna-book-chapters|taxonomy-book-chapters|curriculum.test|question-studio.test|multiple-answer|nexus.test|learning-evidence.test|admin-content.test/.test(f)):process.argv[2]==="--editor" ? files.filter(f=>/questions.validation|multiple-answer|question-studio|question-bank-studio|nexus.test|admin-delete-controls|admin-questions.test|admin-topics.test/.test(f)) : process.argv[2]==="--taxonomy" ? files.filter(f=>/ccna-book-chapters|taxonomy-book-chapters|taxonomy-admin|admin-content|admin-modernization/.test(f)) : files;
if(process.argv.length>3 || process.argv[2] && !["--lesson-db","--lessons","--command-center","--editor","--taxonomy","--canonical","--canonical-db","--shell","--exams","--exam-db"].includes(process.argv[2]))throw Error("Unknown offline test selection");
const result = spawnSync(
  process.execPath,
  [
    cli,
    "run",
    "--config",
    path.join(root, lessonIsolated?"tools/lesson-db.config.mjs":examIsolated?"tools/exam-db.config.mjs":isolated?"tools/canonical-db.config.mjs":"tools/admin-unit.config.mjs"),
    ...selectedFiles,
    "--reporter=dot",
  ],
  { cwd: root, env: process.env, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
