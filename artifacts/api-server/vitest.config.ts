import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local config so Vitest does not pick up the repository-root Vite config.
export default defineConfig({
  envDir: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    // Bound CPU/memory contention; keep all existing test and hook deadlines.
    maxWorkers: 2,
    include: ["artifacts/api-server/src/**/*.test.ts"],
    exclude: ["artifacts/api-server/src/**/*.integration.test.ts"],
    environment: "node",
  },
});
