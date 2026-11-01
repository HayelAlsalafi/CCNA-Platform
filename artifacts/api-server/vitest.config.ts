import { defineConfig } from "vitest/config";

// Local config so Vitest does not pick up the repository-root Vite config.
export default defineConfig({
  envDir: false,
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    environment: "node",
  },
});
