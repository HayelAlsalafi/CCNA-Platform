import { defineConfig, type InputTransformerFn } from "orval";
import path from "node:path";

// Generate only additive lesson contracts; preserve every existing generated API.
const lessonOnly: InputTransformerFn = (document) => ({
  ...document,
  paths: Object.fromEntries(
    Object.entries(document.paths ?? {}).filter(
      ([route]) =>
        route.startsWith("/admin/lessons") ||
        route.startsWith("/lessons/") ||
        /^\/chapters\/[^/]+\/lessons$/.test(route),
    ),
  ),
  components: {
    ...document.components,
    schemas: Object.fromEntries(
      Object.entries(document.components?.schemas ?? {}).filter(
        ([name]) => name.startsWith("Lesson") || name === "ErrorResponse",
      ),
    ),
  },
});
const input = {
  target: path.resolve(__dirname, "openapi.yaml"),
  override: { transformer: lessonOnly },
};
export default defineConfig({
  "lesson-client": {
    input,
    output: {
      target: path.resolve(__dirname, "../api-client-react/src/lesson-api/api.ts"),
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
  "lesson-zod": {
    input,
    output: {
      target: path.resolve(__dirname, "../api-zod/src/lessons/api.ts"),
      client: "zod",
      mode: "single",
      clean: false,
      override: { zod: { version: 3 } },
    },
  },
});
