import { z } from "zod/v4";
import { examBlueprintStatusEnum, type ExamObjective } from "./exam-blueprints";

const id = z.uuid().transform((value) => value.toLowerCase());
const order = z.number().int().min(0).max(2_147_483_647);
const domainCode = z.string().regex(/^[1-9][0-9]*[.]0$/);
const objectiveCode = z.string().max(30).regex(/^[1-9][0-9]*[.][1-9][0-9]*([.][a-z])?$/);

function isValidSourceUrl(value: string): boolean {
  // Require an explicit authority. URL() alone repairs missing slashes, ignores
  // some control characters and treats backslashes as separators for HTTP URLs.
  if (!/^https?:\/\/[^/?#]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // URL() validates IP literals and converts international hostnames to ASCII.
    if (url.hostname.startsWith("[")) return true;
    const hostname = url.hostname.replace(/\.$/, "");
    return hostname.length > 0 && hostname.length <= 253 && hostname.split(".").every(
      (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    );
  } catch {
    return false;
  }
}

/** Pure input contracts. These modules never import the database entry point. */
export const createExamBlueprintInputSchema = z.strictObject({
  examCode: z.string().trim().min(1).max(40),
  version: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(180),
  status: z.enum(examBlueprintStatusEnum.enumValues).default("DRAFT"),
  sourceUrl: z.string().max(2048).refine(isValidSourceUrl, {
    message: "Source URL must be an absolute HTTP or HTTPS URL with a valid hostname.",
  }).nullable().default(null),
  verifiedAt: z.date().nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.verifiedAt !== null && value.sourceUrl === null) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Verification requires a source URL." });
  }
  if (value.status === "ACTIVE" && value.verifiedAt === null) {
    ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "Active blueprints require explicit verification." });
  }
});

export const createExamDomainInputSchema = z.strictObject({
  blueprintId: id,
  code: domainCode.max(20),
  name: z.string().trim().min(1).max(180),
  weightPercent: z.number().int().min(1).max(100),
  displayOrder: order,
});

/** Validate a complete proposed domain set; draft DB rows may be incomplete. */
export const examBlueprintDomainsInputSchema = z.array(createExamDomainInputSchema).min(1)
  .superRefine((domains, ctx) => {
    const codes = new Set(domains.map((domain) => domain.code));
    if (codes.size !== domains.length) {
      ctx.addIssue({ code: "custom", message: "Domain codes must be unique within a blueprint." });
    }
    if (new Set(domains.map((domain) => domain.blueprintId)).size !== 1) {
      ctx.addIssue({ code: "custom", message: "A domain set must belong to one blueprint." });
    }
    if (domains.reduce((total, domain) => total + domain.weightPercent, 0) !== 100) {
      ctx.addIssue({ code: "custom", message: "Complete blueprint domain weights must total 100%." });
    }
  });

export const createExamObjectiveInputSchema = z.strictObject({
  domainId: id,
  blueprintId: id,
  domainCode: domainCode.max(20),
  code: objectiveCode,
  description: z.string().trim().min(1),
  displayOrder: order,
}).refine((value) => value.domainCode === `${value.code.split(".")[0]}.0`, {
  path: ["domainCode"], message: "Objective code must belong to its domain.",
});

export const questionObjectiveInputSchema = z.strictObject({
  questionId: id,
  objectiveId: id,
  blueprintId: id,
  isPrimary: z.boolean().default(false),
});

export const questionObjectiveAssignmentsSchema = z.array(questionObjectiveInputSchema)
  .superRefine((values, ctx) => {
    const bindings = new Set<string>();
    const primaryBindings = new Set<string>();
    values.forEach((value, position) => {
      const binding = `${value.questionId}:${value.objectiveId}`;
      const primaryBinding = `${value.questionId}:${value.blueprintId}`;
      if (bindings.has(binding)) {
        ctx.addIssue({ code: "custom", path: [position, "objectiveId"], message: "Question/objective mapping must be unique." });
      }
      bindings.add(binding);
      if (value.isPrimary && primaryBindings.has(primaryBinding)) {
        ctx.addIssue({ code: "custom", path: [position, "isPrimary"], message: "At most one primary objective per question per blueprint." });
      }
      if (value.isPrimary) primaryBindings.add(primaryBinding);
    });
  });

/**
 * Check membership against an explicitly supplied catalog (typically DB rows).
 * This validates one proposed set; the partial unique index also guards existing
 * rows and concurrent writes. No persistence, question publication or inference.
 */
export function validateQuestionObjectiveAssignments(
  input: unknown,
  objectives: readonly Pick<ExamObjective, "id" | "blueprintId">[],
) {
  const catalog = new Map(objectives.map((objective) => [objective.id.toLowerCase(), objective.blueprintId.toLowerCase()]));
  return questionObjectiveAssignmentsSchema.superRefine((values, ctx) => {
    values.forEach((value, position) => {
      if (catalog.get(value.objectiveId) !== value.blueprintId) {
        ctx.addIssue({ code: "custom", path: [position, "objectiveId"], message: "Objective must exist in the supplied blueprint catalog." });
      }
    });
  }).parse(input);
}

export type CreateExamBlueprintInput = z.infer<typeof createExamBlueprintInputSchema>;
export type CreateExamDomainInput = z.infer<typeof createExamDomainInputSchema>;
export type CreateExamObjectiveInput = z.infer<typeof createExamObjectiveInputSchema>;
export type QuestionObjectiveInput = z.infer<typeof questionObjectiveInputSchema>;
