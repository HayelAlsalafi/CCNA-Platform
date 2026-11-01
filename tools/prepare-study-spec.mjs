// Generates only the additive study API specification from inert Zod definitions.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(path.resolve("scripts/package.json"));
require("tsx/esm/api").register();
const { z } = createRequire(path.resolve("artifacts/api-server/package.json"))("zod/v4");
const c = await import("../artifacts/api-server/src/lib/study-validation.ts");
const types = {
  StudyAnnotationInput: c.annotationInput,
  StudyAnnotationPatch: c.annotationPatch,
  StudyDeleteInput: c.annotationDelete,
  StudyProgressInput: c.progressInput,
  StudyAnnotation: c.annotationRecord,
  StudyLessonResult: c.studyLessonResult,
  StudyAnnotationResult: c.annotationResult,
  StudyProgressResult: c.progressResult,
  StudyMutationResult: c.mutationResult,
  StudyWorkspaceResult: c.workspaceResult,
  StudyProgressOverview: c.progressOverview,
  StudyMediaResult: c.mediaResult,
};
const schemas = Object.fromEntries(
  Object.entries(types).map(([name, value]) => {
    const { $schema, ...schema } = z.toJSONSchema(value, { unrepresentable: "any" });
    return [name, schema];
  }),
);
const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  query = z.toJSONSchema(c.workspaceQuery, { unrepresentable: "any" });
const parameters = Object.entries(query.properties).map(([name, schema]) => ({
  name,
  in: "query",
  schema,
}));
const paths = {};
function endpoint(route, method, operationId, response, body, params = []) {
  paths[route] ??= {};
  paths[route][method] = {
    operationId,
    tags: ["study"],
    security: [{ clerkSession: [] }],
    parameters: params,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/" + body } } },
          },
        }
      : {}),
    responses: {
      200: {
        description: "Authenticated owner-scoped result",
        content: { "application/json": { schema: { $ref: "#/components/schemas/" + response } } },
      },
      401: { description: "Authentication required" },
      403: { description: "Account not allowed" },
      409: { description: "Revision/session/version conflict" },
      503: { description: "Study persistence awaits approval" },
    },
  };
}
endpoint("/study/lessons/{id}", "get", "getStudyLesson", "StudyLessonResult", null, [id]);
endpoint(
  "/study/annotations",
  "post",
  "createStudyAnnotation",
  "StudyAnnotationResult",
  "StudyAnnotationInput",
);
endpoint(
  "/study/annotations/{id}",
  "patch",
  "updateStudyAnnotation",
  "StudyAnnotationResult",
  "StudyAnnotationPatch",
  [id],
);
endpoint(
  "/study/annotations/{id}",
  "delete",
  "deleteStudyAnnotation",
  "StudyMutationResult",
  "StudyDeleteInput",
  [id],
);
endpoint(
  "/study/progress",
  "put",
  "updateStudyProgress",
  "StudyProgressResult",
  "StudyProgressInput",
);
endpoint("/study/progress", "get", "getStudyProgress", "StudyProgressOverview", null, parameters);
endpoint("/study/workspace", "get", "getStudyWorkspace", "StudyWorkspaceResult", null, parameters);
for (const operations of Object.values(paths))
  for (const [method, operation] of Object.entries(operations))
    if (method !== "get")
      operation.parameters.push({
        name: "X-Study-Session",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 256 },
      });
paths["/admin/lesson-media"] = {
  post: {
    operationId: "uploadStudyMedia",
    tags: ["study"],
    summary: "ADMIN-only bounded persistent image upload; separate storage activation required",
    security: [{ clerkSession: [] }],
    parameters: [{ name: "X-Admin-Session", in: "header", schema: { type: "string" } }],
    requestBody: {
      required: true,
      content: Object.fromEntries(
        ["image/png", "image/jpeg", "image/webp"].map((mime) => [
          mime,
          { schema: { type: "string", format: "binary" } },
        ]),
      ),
    },
    responses: {
      200: {
        description: "Durable media metadata",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/StudyMediaResult" } },
        },
      },
      403: { description: "Database ADMIN role required" },
      413: { description: "File exceeds 5 MiB" },
      503: { description: "Storage/table not activated" },
    },
  },
};
paths["/lesson-media/{id}"] = {
  get: {
    operationId: "getStudyMedia",
    tags: ["study"],
    security: [{ clerkSession: [] }],
    parameters: [id],
    responses: {
      200: {
        description: "Authenticated published image (or ADMIN preview)",
        content: Object.fromEntries(['image/png','image/jpeg','image/webp'].map(mime=>[mime,{schema:{type:'string',format:'binary'}}])),
      },
      404: { description: "No authorized published reference" },
      503: { description: "Media not activated" },
    },
  },
};
const spec = {
  openapi: "3.1.0",
  info: { title: "CCNA Study API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  paths,
  components: { securitySchemes: { clerkSession: { type: "http", scheme: "bearer" } }, schemas },
};
writeFileSync("lib/api-spec/study.openapi.json", JSON.stringify(spec, null, 2) + "\n");
