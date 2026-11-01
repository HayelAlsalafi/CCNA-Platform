import { z } from "zod/v4";
export const studyId = z.string().uuid();
export const studyColor = z.enum(["yellow", "green", "blue", "pink"]);
export const anchorSchema = z
  .object({
    blockId: studyId,
    start: z.number().int().min(0).max(500000),
    end: z.number().int().min(0).max(500000),
    quote: z.string().max(5000),
  })
  .strict()
  .refine((a) => a.end >= a.start, "Invalid selection range");
export const annotationInput = z
  .object({
    lessonId: studyId,
    revisionId: studyId,
    kind: z.enum(["NOTE", "HIGHLIGHT", "BOOKMARK"]),
    anchor: anchorSchema.nullable().default(null),
    body: z.string().trim().max(10000).default(""),
    color: studyColor.nullable().default(null),
    category: z.string().trim().max(80).default(""),
  })
  .strict()
  .superRefine((a, c) => {
    if (a.kind === "NOTE" && !a.body)
      c.addIssue({ code: "custom", path: ["body"], message: "Enter a note." });
    if (
      a.kind === "HIGHLIGHT" &&
      (!a.color || !a.anchor || a.anchor.end <= a.anchor.start || !a.anchor.quote)
    )
      c.addIssue({
        code: "custom",
        path: ["anchor"],
        message: "Select text and a highlight color.",
      });
  });
export const annotationPatch = z
  .object({
    version: z.number().int().positive(),
    body: z.string().trim().max(10000).optional(),
    color: studyColor.nullable().optional(),
    category: z.string().trim().max(80).optional(),
  })
  .strict();
export const annotationDelete = z.object({ version: z.number().int().positive() }).strict();
export const progressInput = z
  .object({
    lessonId: studyId,
    revisionId: studyId,
    action: z.enum(["start", "position", "complete", "reopen"]),
    blockId: studyId.nullable().default(null),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const workspaceQuery = z
  .object({
    q: z.string().trim().max(200).default(""),
    kind: z.enum(["NOTE", "HIGHLIGHT", "BOOKMARK"]).optional(),
    color: studyColor.optional(),
    chapterId: studyId.optional(),
    lessonId:studyId.optional(),
    sort:z.enum(["updated_desc","updated_asc","created_desc","created_asc"]).default("updated_desc"),
    domainCode: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"]).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const annotationRecord = z.object({
  id: studyId,
  lessonId: studyId,
  revisionId: studyId,
  kind: z.enum(["NOTE", "HIGHLIGHT", "BOOKMARK"]),
  anchor: anchorSchema.nullable(),
  body: z.string(),
  color: studyColor.nullable(),
  category: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const progressRecord = z.object({
  state: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
  blockId: studyId.nullable(),
  version: z.number().int().nonnegative(),
});
export const studyLessonResult = z.object({
  revisionId: studyId,
  annotations: z.array(annotationRecord),
  progress: progressRecord,
});
export const annotationResult = z.object({ annotation: annotationRecord });
export const progressResult = z.object({ progress: progressRecord });
export const mutationResult = z.object({ deleted: z.literal(true) });
export const workspaceItem = annotationRecord.extend({
  lessonTitle: z.string(),
  chapterId: studyId,
  chapterTitle: z.string(),
  domainName: z.string(),
  domainCode: z.string(),
  currentRevisionId: studyId,
});
export const workspaceResult = z.object({
  items: z.array(workspaceItem),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const progressOverview = z.object({
  chapters: z.array(
    z.object({
      chapterId: studyId,
      chapterTitle: z.string(),
      domainName: z.string(),
      domainCode: z.string(),
      total: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      inProgress: z.number().int().nonnegative(),
    }),
  ),
  lessons: z.array(
    z.object({
      id: studyId,
      title: z.string(),
      chapterId: studyId,
      revisionId: studyId,
      state: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
      blockId: studyId.nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const mediaResult = z.object({
  id: studyId,
  url: z.string(),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  bytes: z.number().int().positive(),
  width:z.number().int().positive().optional(),
  height:z.number().int().positive().optional(),
  name:z.string().optional(),
  caption:z.string().optional(),
  thumbnailUrl:z.string().optional(),
});
