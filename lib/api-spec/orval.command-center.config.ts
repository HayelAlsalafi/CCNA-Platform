import { defineConfig, type InputTransformerFn } from "orval";
import path from "node:path";

// Additive contract generation; never clean or rewrite existing client folders.
const dashboardOnly: InputTransformerFn = (document) => ({
  ...document,
  paths: { "/nexus/analytics": document.paths?.["/nexus/analytics"]! },
  components: {
    ...document.components,
    schemas: Object.fromEntries(
      Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
        name.startsWith("CommandCenter"),
      ),
    ),
  },
});
const input = {
  target: path.resolve(__dirname, "openapi.yaml"),
  override: { transformer: dashboardOnly },
};
export default defineConfig({
  "command-center-client": {
    input,
    output: {
      target: path.resolve(__dirname, "../api-client-react/src/command-center/api.ts"),
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: false,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(__dirname, "../api-client-react/src/custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  "command-center-zod": {
    input,
    output: {
      target: path.resolve(__dirname, "../api-zod/src/command-center/api.ts"),
      client: "zod",
      mode: "single",
      clean: false,
      override: { zod: { version: 3 } },
    },
  },
});
