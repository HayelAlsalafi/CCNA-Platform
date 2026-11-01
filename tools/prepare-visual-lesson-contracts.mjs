// Additive typed JSON presentation contract; no HTML, DB import or migration.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(path.resolve("scripts/package.json"));
process.env.ESBUILD_BINARY_PATH = path.resolve(
  ".local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe",
);
require("tsx/esm/api").register();
const { z } = createRequire(path.resolve("artifacts/api-server/package.json"))("zod/v4");
const { lessonBlockSchema } = await import("../artifacts/api-server/src/lib/lesson-validation.ts");
const { $schema, ...block } = z.toJSONSchema(lessonBlockSchema, {
  unrepresentable: "any",
  io: "input",
});
const yaml = createRequire(import.meta.url)(
  "../node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml",
);
const file = "lib/api-spec/openapi.yaml",
  source = readFileSync(file, "utf8");
const start = source.indexOf("    LessonContentBlock:"),
  end = source.indexOf("    LessonCreateInput:", start);
if (start < 0 || end < 0) throw Error("Lesson spec boundary missing");
const replacement = yaml
  .dump({ LessonContentBlock: block }, { lineWidth: 100, noRefs: true })
  .split("\n")
  .map((line) => (line ? "    " + line : line))
  .join("\n");
writeFileSync(file, source.slice(0, start) + replacement + source.slice(end));
