// Offline typecheck with installed cache packages; no installs, env files or DB.
import { createRequire } from "node:module";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js");
const packages = new Map(),
  typeRoots = [];
for (const folder of readdirSync("node_modules/.pnpm")) {
  const cache = path.join(root, "node_modules/.pnpm", folder, "node_modules");
  if (!existsSync(cache)) continue;
  for (const name of readdirSync(cache)) {
    if (name.startsWith(".")) continue;
    const dirs = name.startsWith("@")
      ? readdirSync(path.join(cache, name)).map((n) => [name + "/" + n, path.join(cache, name, n)])
      : [[name, path.join(cache, name)]];
    for (const [key, dir] of dirs)
      if (existsSync(path.join(dir, "package.json")) && !packages.has(key)) packages.set(key, dir);
  }
  if (existsSync(path.join(cache, "@types"))) typeRoots.push(path.join(cache, "@types"));
}
const paths = { "@/*": ["artifacts/ccna-learning/src/*"] };
for (const [name, dir] of packages) {
  paths[name] = [dir];
  paths[name + "/*"] = [dir + "/*"];
}
for (const folder of readdirSync("lib")) {
  const file = path.join("lib", folder, "package.json");
  if (!existsSync(file)) continue;
  const p = JSON.parse(readFileSync(file, "utf8"));
  paths[p.name] = [path.join(root, "lib", folder, "src/index.ts")];
  paths[p.name + "/*"] = [path.join(root, "lib", folder, "src/*")];
}
for (const name of ["react", "react-dom", "pg", "express", "cors", "cookie-parser", "chai"]) {
  const dir = packages.get("@types/" + name);
  if (dir) {
    paths[name] = [dir];
    paths[name + "/*"] = [dir + "/*"];
  }
}
const base = ts.readConfigFile("tsconfig.base.json", ts.sys.readFile).config;
const config = ts.parseJsonConfigFileContent(
  {
    ...base,
    compilerOptions: {
      ...base.compilerOptions,
      baseUrl: root,
      paths,
      typeRoots,
      types: ["node", "react", "chai"],
      lib: ["es2022", "dom", "dom.iterable"],
      jsx: "react-jsx",
      noEmit: true,
      incremental: false,
      rootDir: root,
    },
    include: [
      "artifacts/api-server/src",
      "artifacts/ccna-learning/src",
      "lib/db/src",
      "lib/api-client-react/src",
      "lib/api-zod/src",
    ],
    exclude: ["**/*.test.ts", "**/*.test.tsx"],
  },
  ts.sys,
  root,
);
config.fileNames.push(path.join(packages.get("vite"), "client.d.ts"));
for (const file of [
  "artifacts/api-server/src/lib/study.test.ts",
  "artifacts/api-server/src/lib/lesson-media.test.ts",
  "artifacts/api-server/src/routes/study.test.ts",
  "artifacts/ccna-learning/src/components/study.test.tsx",
  "artifacts/api-server/src/lib/question-import-files.test.ts",
  "artifacts/api-server/src/lib/question-import.test.ts",
  "artifacts/api-server/src/lib/taxonomy-admin.test.ts",
  "artifacts/api-server/src/routes/admin-content.test.ts",
  "artifacts/ccna-learning/src/components/admin-content.test.tsx",
  "artifacts/ccna-learning/src/components/admin-modernization.test.tsx",
])
  config.fileNames.push(path.join(root, file));
const program = ts.createProgram(config.fileNames, config.options);
const errors = ts.getPreEmitDiagnostics(program);
if (errors.length) {
  console.log(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (s) => s,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "PASS: API, frontend, DB schema and API-client TypeScript with installed cache packages.",
  );
