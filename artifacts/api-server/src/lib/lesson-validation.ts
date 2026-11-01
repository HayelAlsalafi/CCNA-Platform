import { z } from "zod/v4";
/** Structural diagnostics only: never include authored text or received values. */
export function lessonIssueDetails(
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
) {
  return issues.slice(0, 8).map((issue) => ({
    path: issue.path
      .slice(0, 10)
      .map((part) =>
        typeof part === "number"
          ? String(part)
          : typeof part === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,48}$/.test(part)
            ? part
            : "field",
      )
      .join("."),
    code: /^[a-z_]+$/.test(issue.code) ? issue.code : "invalid",
  }));
}
const text = z.string().trim().min(1).max(20000);
const blockText = z
  .string()
  .min(1)
  .max(20000)
  .refine((v) => !!v.trim(), "Enter block content.");
const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      if (/^\/api\/lesson-media\/[a-f0-9-]{36}$/.test(value)) return true;
      if (
        /^\/(?:learn\/chapters\/|topics(?:[?#]|$))/.test(value) &&
        !value.includes("\\") &&
        !/[\u0000-\u0020]/.test(value)
      )
        return true;
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !!url.hostname &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use an absolute HTTP or HTTPS URL without credentials.");
const id = z.string().uuid();
// Image resources cannot point to chapter/topic navigation. Legacy HTTP images
// remain compatible; the authoring UI requires HTTPS for new sources.
const imageUrl = safeUrl.refine(
  (value) => /^https?:\/\//i.test(value) || /^\/api\/lesson-media\/[a-f0-9-]{36}$/.test(value),
  "Use a hosted image URL or an approved lesson-media reference.",
);
const alignment = z.enum(["left", "center", "right"]);
const run = z
  .object({
    text: z.string().max(20000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    superscript: z.boolean().optional(),
    subscript: z.boolean().optional(),
    code: z.boolean().optional(),
    href: safeUrl.optional(),
    color: z.enum(["default", "muted", "accent", "danger"]).optional(),
    highlight: z.enum(["yellow", "green", "blue", "pink"]).optional(),
  })
  .strict();
// Versioned, optional presentation data. Legacy blocks remain valid unchanged.
const appearance = z
  .object({
    version: z.literal(1),
    background: z.enum(["paper", "blue", "green", "yellow", "pink"]).optional(),
    accent: z.enum(["default", "muted", "accent", "danger"]).optional(),
    card: z.boolean().optional(),
    padding: z.enum(["compact", "cozy", "roomy"]).optional(),
    spacing: z.enum(["compact", "normal", "airy"]).optional(),
    decoration: z.boolean().optional(),
  })
  .strict();
const direction = z.enum(["auto", "ltr", "rtl"]).optional();
const optionalRuns = z.array(run).min(1).max(100).optional();
export const lessonBlockSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        id,
        type: z.literal("paragraph"),
        text: blockText,
        runs: optionalRuns,
        direction,
        alignment: alignment.optional(),
        appearance: appearance.optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("richText"),
        runs: z.array(run).min(1).max(100),
        direction,
        alignment: alignment.optional(),
        appearance: appearance.optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("heading"),
        text: blockText.max(200),
        level: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
        ]),
        runs: optionalRuns,
        direction,
        alignment: alignment.optional(),
        appearance: appearance.optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("code"),
        text: z
          .string()
          .min(1)
          .max(20000)
          .refine((value) => !!value.trim(), "Enter a CLI example."),
        language: z.string().max(40),
        explanation: z.string().max(4000).optional(),
        lineNumbers: z.boolean().optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("image"),
        url: imageUrl,
        alt: z.string().trim().max(500),
        decorative: z.boolean().optional(),
        caption: z.string().max(1000).optional(),
        alignment: alignment.optional(),
        width: z.enum(["small", "medium", "wide", "full"]).optional(),
        pixelWidth:z.number().int().min(1).max(8192).optional(),
        pixelHeight:z.number().int().min(1).max(8192).optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("diagram"),
        url: imageUrl,
        alt: z.string().trim().max(500),
        decorative: z.boolean().optional(),
        caption: z.string().max(1000).optional(),
        alignment: alignment.optional(),
        width: z.enum(["small", "medium", "wide", "full"]).optional(),
        pixelWidth:z.number().int().min(1).max(8192).optional(),
        pixelHeight:z.number().int().min(1).max(8192).optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("callout"),
        text: blockText,
        tone: z.enum(["info", "warning", "tip", "important", "example", "note"]),
        title: z.string().max(200).optional(),
        runs: z.array(run).min(1).max(100).optional(),
        direction,
        alignment: alignment.optional(),
        showIcon: z.boolean().optional(),
        appearance: appearance.optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("quote"),
        text: blockText,
        alignment: alignment.optional(),
        runs: optionalRuns,
        direction,
        attribution: z.string().max(500).optional(),
        appearance: appearance.optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("list"),
        ordered: z.boolean(),
        items: z.array(blockText.max(2000)).min(1).max(100),
        itemRuns: z.array(z.array(run).min(1).max(100)).min(1).max(100).optional(),
        numbering: z
          .enum([
            "decimal",
            "upper-alpha",
            "lower-alpha",
            "upper-roman",
            "lower-roman",
            "disc",
            "circle",
            "square",
          ])
          .optional(),
        start: z.number().int().min(1).max(100000).optional(),
        levels: z.array(z.number().int().min(0).max(4)).min(1).max(100).optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("table"),
        headers: z.array(text.max(300)).min(1).max(12),
        rows: z
          .array(z.array(z.string().max(2000)).min(1).max(12))
          .min(1)
          .max(100),
        headerRow: z.boolean().optional(),
        headerColumn: z.boolean().optional(),
        alignment: alignment.optional(),
        columnWidth: z.enum(["auto", "equal", "wide-first"]).optional(),
        cells: z
          .array(
            z
              .object({
                row: z.number().int().min(0).max(100),
                column: z.number().int().min(0).max(11),
                background: z.enum(["paper", "blue", "green", "yellow", "pink"]).optional(),
                alignment: alignment.optional(),
              })
              .strict(),
          )
          .max(1212)
          .optional(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("knowledgeCheck"),
        prompt: text,
        choices: z.array(text.max(2000)).min(2).max(8),
        correctIndex: z.number().int().min(0).max(7),
        explanation: text,
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("labReference"),
        title: text.max(200),
        url: safeUrl.optional(),
        description: text,
        objectives: z.array(text.max(500)).max(30).optional(),
        requirements: z.array(text.max(500)).max(30).optional(),
        steps: z.array(text.max(2000)).max(50).optional(),
        expectedResults: z.string().max(4000).optional(),
      })
      .strict(),
  ])
  .superRefine((block, ctx) => {
    if (
      block.type === "list" &&
      block.itemRuns &&
      (block.itemRuns.length !== block.items.length ||
        block.itemRuns.some(
          (runs, index) => runs.map((run) => run.text).join("") !== block.items[index],
        ))
    )
      ctx.addIssue({
        code: "custom",
        path: ["itemRuns"],
        message: "Formatted list items must match their plain-text fallbacks.",
      });
    if (
      "runs" in block &&
      block.type !== "richText" &&
      block.runs &&
      "text" in block &&
      block.runs.map((r) => r.text).join("") !== block.text
    )
      ctx.addIssue({
        code: "custom",
        path: ["runs"],
        message: "Formatted text must match its plain-text fallback.",
      });
    if (
      block.type === "list" &&
      block.levels &&
      (block.levels.length !== block.items.length ||
        block.levels[0] !== 0 ||
        block.levels.some((level, i) => i > 0 && level > block.levels![i - 1] + 1))
    )
      ctx.addIssue({
        code: "custom",
        path: ["levels"],
        message: "List nesting must start at zero and increase one level at a time.",
      });
    if (
      block.type === "table" &&
      block.cells &&
      (block.cells.some((c) => c.row > block.rows.length || c.column >= block.headers.length) ||
        new Set(block.cells.map((c) => `${c.row}:${c.column}`)).size !== block.cells.length)
    )
      ctx.addIssue({
        code: "custom",
        path: ["cells"],
        message: "Cell styles must identify distinct existing cells.",
      });
    if (
      (block.type === "image" || block.type === "diagram") &&
      !block.decorative &&
      !block.alt.trim()
    )
      ctx.addIssue({
        code: "custom",
        path: ["alt"],
        message: "Describe the image or explicitly mark it decorative.",
      });
    if (block.type === "table" && block.rows.some((row) => row.length !== block.headers.length))
      ctx.addIssue({ code: "custom", message: "Every table row must match its headers." });
    if (block.type === "knowledgeCheck" && block.correctIndex >= block.choices.length)
      ctx.addIssue({ code: "custom", message: "Choose an existing correct answer." });
  });
export const lessonInputSchema = z
  .object({
    chapterId: id,
    title: text.max(180),
    description: z.string().trim().max(4000),
    objectives: z.array(text.max(500)).max(30),
    estimatedMinutes: z.number().int().min(1).max(600),
    displayOrder: z.number().int().min(0).max(1000000),
    blocks: z.array(lessonBlockSchema).max(200),
  })
  .strict()
  .superRefine((lesson, ctx) => {
    if (new Set(lesson.blocks.map((block) => block.id)).size !== lesson.blocks.length)
      ctx.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "Section identifiers must be unique.",
      });
    if (Buffer.byteLength(JSON.stringify(lesson), "utf8") > 512000)
      ctx.addIssue({ code: "custom", message: "Lesson exceeds the 500 KiB content limit." });
  });
export type LessonInput = z.infer<typeof lessonInputSchema>;
export const lessonVersionSchema = z.object({ version: z.number().int().positive() }).strict();
export const lessonUpdateSchema = z
  .object({ version: z.number().int().positive(), ...lessonInputSchema.shape })
  .strict()
  .superRefine((value, ctx) => {
    const { version: _, ...input } = value;
    const result = lessonInputSchema.safeParse(input);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue(issue);
  });
export const lessonReorderSchema = z
  .object({
    chapterId: id,
    lessons: z
      .array(
        z
          .object({
            id,
            version: z.number().int().positive(),
            displayOrder: z.number().int().min(0).max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      new Set(input.lessons.map((item) => item.id)).size !== input.lessons.length ||
      new Set(input.lessons.map((item) => item.displayOrder)).size !== input.lessons.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Lesson IDs and requested order values must be unique.",
      });
  });
export function assertPublishable(input: LessonInput) {
  if (!input.blocks.length || !input.objectives.length)
    throw new Error("Add at least one content block and learning objective before publishing.");
}

export const lessonLibraryQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    chapterId: id.optional(),
    domainId: id.optional(),
    domainCode: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"]).optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    volume: z.enum(["V1", "V2"]).optional(),
    updatedAfter: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((value) => [10, 25, 50].includes(value))
      .default(25),
  })
  .strict();
