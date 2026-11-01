import { describe, expect, it } from "vitest";
import {
  ccna200301V11Catalog,
  createExamBlueprintInputSchema,
  createExamDomainInputSchema,
  createExamObjectiveInputSchema,
  createQuestionInputSchema,
  examBlueprintDomainsInputSchema,
  questionObjectiveAssignmentsSchema,
  updateQuestionInputSchema,
  validateQuestionObjectiveAssignments,
} from "@workspace/db/schema";

const questionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const blueprintId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const nextBlueprintId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const domainId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const objectiveId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const secondObjectiveId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const thirdObjectiveId = "11111111-1111-4111-8111-111111111111";
const mapping = { questionId, blueprintId, objectiveId, isPrimary: true };
const catalog = [
  { id: objectiveId, blueprintId },
  { id: secondObjectiveId, blueprintId },
  { id: thirdObjectiveId, blueprintId: nextBlueprintId },
];
const domain = { blueprintId, code: "1.0", name: "Fundamentals", weightPercent: 20, displayOrder: 0 };
const objective = { domainId, blueprintId, domainCode: "1.0", code: "1.1", description: "Reviewed description", displayOrder: 0 };

describe("taxonomy validation without database access", () => {
  it("defaults new blueprint metadata to draft and unverified", () => {
    expect(createExamBlueprintInputSchema.parse({ examCode: " 200-301 ", version: "1.1", title: "CCNA" }))
      .toEqual({ examCode: "200-301", version: "1.1", title: "CCNA", status: "DRAFT", sourceUrl: null, verifiedAt: null });
  });
  it("requires explicit source verification for active blueprint metadata", () => {
    const input = { examCode: "200-301", version: "1.1", title: "CCNA", status: "ACTIVE" };
    expect(createExamBlueprintInputSchema.safeParse(input).success).toBe(false);
    expect(createExamBlueprintInputSchema.safeParse({ ...input, verifiedAt: new Date("2026-10-12") }).success).toBe(false);
    expect(createExamBlueprintInputSchema.safeParse({ ...input, verifiedAt: new Date("2026-10-12"), sourceUrl: ccna200301V11Catalog.sourceUrl }).success).toBe(true);
  });
  it.each([
    { examCode: " " }, { version: "" }, { title: " " }, { status: "PUBLISHED" },
    { sourceUrl: "ftp://example.com" }, { sourceUrl: "https://example.com bad" },
    { questionCode: "CCNA-Q-000001" },
  ])("rejects invalid or unexpected blueprint fields: %j", (change) => {
    expect(createExamBlueprintInputSchema.safeParse({ examCode: "200-301", version: "1.1", title: "CCNA", ...change }).success).toBe(false);
  });
  it.each([
    { blueprintId: "invalid" }, { code: "1" }, { code: "01.0" }, { name: " " },
    { weightPercent: 0 }, { weightPercent: 101 }, { weightPercent: 20.5 },
    { displayOrder: -1 }, { displayOrder: 2_147_483_648 },
  ])("rejects invalid domain metadata: %j", (change) => {
    expect(createExamDomainInputSchema.safeParse({ ...domain, ...change }).success).toBe(false);
  });
  it("validates complete sets separately from individual draft domains", () => {
    const domains = ccna200301V11Catalog.domains.map(({ objectives: _objectives, ...value }) => ({ ...value, blueprintId }));
    expect(examBlueprintDomainsInputSchema.parse(domains)).toHaveLength(6);
    expect(examBlueprintDomainsInputSchema.safeParse(domains.slice(1)).success).toBe(false);
    expect(examBlueprintDomainsInputSchema.safeParse([domains[0], { ...domains[0], weightPercent: 80 }]).success).toBe(false);
    expect(examBlueprintDomainsInputSchema.safeParse(domains.map((value, index) => index ? value : { ...value, blueprintId: nextBlueprintId })).success).toBe(false);
  });
  it.each(["1.1", "1.10", "1.1.a"])("accepts canonical objective code %s", (code) => {
    expect(createExamObjectiveInputSchema.safeParse({ ...objective, code }).success).toBe(true);
  });
  it.each(["1.0", "1.01", "1.1.A", "1.1a", "1.1.a.extra", "2.1"])("rejects malformed or foreign-domain code %s", (code) => {
    expect(createExamObjectiveInputSchema.safeParse({ ...objective, code }).success).toBe(false);
  });
  it("requires valid objective IDs, descriptions and order", () => {
    for (const change of [{ domainId: "bad" }, { blueprintId: "bad" }, { description: " " }, { displayOrder: -1 }, { isCorrect: true }]) {
      expect(createExamObjectiveInputSchema.safeParse({ ...objective, ...change }).success).toBe(false);
    }
  });
  it("keeps empty classifications valid and unclassified", () => {
    expect(validateQuestionObjectiveAssignments([], catalog)).toEqual([]);
  });
  it("supports multiple objectives, including a separate primary in another blueprint", () => {
    const assignments = [mapping, { ...mapping, objectiveId: secondObjectiveId, isPrimary: false }, { ...mapping, objectiveId: thirdObjectiveId, blueprintId: nextBlueprintId }];
    expect(validateQuestionObjectiveAssignments(assignments, catalog)).toEqual(assignments);
  });
  it("permits secondary-only classifications without inventing a primary", () => {
    expect(validateQuestionObjectiveAssignments([{ ...mapping, isPrimary: false }], catalog)[0].isPrimary).toBe(false);
    expect(questionObjectiveAssignmentsSchema.parse([{ questionId, blueprintId, objectiveId }])[0].isPrimary).toBe(false);
  });
  it("rejects two primary objectives for the same question and blueprint", () => {
    expect(() => validateQuestionObjectiveAssignments([mapping, { ...mapping, objectiveId: secondObjectiveId }], catalog)).toThrow();
  });
  it("permits independent primaries for different questions", () => {
    expect(validateQuestionObjectiveAssignments([mapping, { ...mapping, questionId: domainId }], catalog)).toHaveLength(2);
  });
  it("rejects duplicate mappings, including UUID letter-case differences", () => {
    expect(questionObjectiveAssignmentsSchema.safeParse([mapping, { ...mapping, isPrimary: false }]).success).toBe(false);
    expect(questionObjectiveAssignmentsSchema.safeParse([mapping, { ...mapping, questionId: questionId.toUpperCase(), objectiveId: objectiveId.toUpperCase(), isPrimary: false }]).success).toBe(false);
  });
  it("rejects unknown objectives and wrong blueprint bindings", () => {
    expect(() => validateQuestionObjectiveAssignments([mapping], [])).toThrow();
    expect(() => validateQuestionObjectiveAssignments([{ ...mapping, blueprintId: nextBlueprintId }], catalog)).toThrow();
  });
  it("rejects answer fields, invalid IDs and nonboolean primary flags", () => {
    for (const change of [{ questionId: "bad" }, { blueprintId: "bad" }, { objectiveId: "bad" }, { isPrimary: "true" }, { isCorrect: true }]) {
      expect(questionObjectiveAssignmentsSchema.safeParse([{ ...mapping, ...change }]).success).toBe(false);
    }
  });
});

describe("taxonomy documentation URL validation", () => {
  const blueprint = { examCode: "200-301", version: "1.1", title: "CCNA" };
  it.each([
    ccna200301V11Catalog.sourceUrl,
    "http://example.com",
    "https://docs.example.com/guide/topics.pdf",
    "http://docs.example.com:8080/guide?version=1.1&format=pdf#objectives",
    "https://example.com/search?q=network%20access#section-2",
    "https://example.com/a%2Fb?url=https%3A%2F%2Fexample.org#part%201",
    "HTTPS://Docs.Example.COM/guide",
    "https://example.com./guide",
    "http://localhost:8080/docs",
    "http://127.0.0.1:8080/docs",
    "https://[2001:db8::1]:8443/docs#section",
    "https://例子.测试/文档?版本=1#目标",
    `https://${"a".repeat(63)}.example/docs`,
  ])("preserves valid documentation URL %j", (sourceUrl) => {
    expect(createExamBlueprintInputSchema.parse({ ...blueprint, sourceUrl }).sourceUrl).toBe(sourceUrl);
  });
  it.each([
    "", "https://#", "https://", "http://", "https://?version=1", "https://:443/docs",
    "https:///example.com/docs", "https:example.com/docs", "https:/example.com/docs",
    "//example.com/docs", "/docs/guide.pdf", "example.com/docs",
    "ftp://example.com/docs", "file:///docs.pdf", "mailto:docs@example.com", "javascript:alert(1)", "data:text/plain,docs",
    "https://bad_host.example/docs", "https://-bad.example/docs", "https://bad-.example/docs",
    "https://example..com/docs", "https://.example.com/docs",
    `https://${"a".repeat(64)}.example/docs`,
    `https://${["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(63)].join(".")}/docs`,
    "https://example.com:abc/docs", "https://example.com:65536/docs", "https://[invalid]/docs", "https://999.999.999.999/docs",
    " https://example.com/docs", "https://example.com/docs ", "https://example.com/a b",
    "https://exam\nple.com/docs", "https://example.com/\tpath", "https://example.com/\u0000path", "https://example.com/\u007fpath",
    "https://example.com\\docs", "https://example.com/%", "https://example.com/%GG",
  ])("rejects malformed or unsupported URL %j", (sourceUrl) => {
    const result = createExamBlueprintInputSchema.safeParse({ ...blueprint, sourceUrl });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "sourceUrl")).toBe(true);
  });
  it("preserves nullable and omitted sources for unverified blueprints", () => {
    expect(createExamBlueprintInputSchema.parse(blueprint).sourceUrl).toBeNull();
    expect(createExamBlueprintInputSchema.parse({ ...blueprint, sourceUrl: null }).sourceUrl).toBeNull();
  });
  it("keeps the 2048-character bound without truncating valid input", () => {
    const prefix = "https://example.com/";
    const sourceUrl = prefix + "a".repeat(2048 - prefix.length);
    expect(createExamBlueprintInputSchema.parse({ ...blueprint, sourceUrl }).sourceUrl).toBe(sourceUrl);
    expect(createExamBlueprintInputSchema.safeParse({ ...blueprint, sourceUrl: sourceUrl + "a" }).success).toBe(false);
  });
  it("accepts an explicitly verified HTTP blueprint and rejects an invalid verification date", () => {
    const input = { ...blueprint, status: "ACTIVE", sourceUrl: "http://example.com/docs", verifiedAt: new Date("2026-10-12") };
    expect(createExamBlueprintInputSchema.safeParse(input).success).toBe(true);
    expect(createExamBlueprintInputSchema.safeParse({ ...input, verifiedAt: new Date(NaN) }).success).toBe(false);
  });
});

describe("additional taxonomy validation boundaries", () => {
  it("rejects empty complete domain sets and fractional ordering", () => {
    expect(examBlueprintDomainsInputSchema.safeParse([]).success).toBe(false);
    expect(createExamDomainInputSchema.safeParse({ ...domain, displayOrder: 0.5 }).success).toBe(false);
    expect(createExamObjectiveInputSchema.safeParse({ ...objective, displayOrder: 0.5 }).success).toBe(false);
  });
  it("rejects whitespace-only metadata and overlength objective codes", () => {
    expect(createExamDomainInputSchema.safeParse({ ...domain, name: "\t\n" }).success).toBe(false);
    expect(createExamObjectiveInputSchema.safeParse({ ...objective, description: "\t\n" }).success).toBe(false);
    expect(createExamObjectiveInputSchema.safeParse({ ...objective, code: `1.${"1".repeat(29)}` }).success).toBe(false);
  });
  it("canonicalizes supplied catalog and mapping UUIDs without bypassing primary uniqueness", () => {
    const uppercase = catalog.map((value) => ({ id: value.id.toUpperCase(), blueprintId: value.blueprintId.toUpperCase() }));
    expect(validateQuestionObjectiveAssignments([{ ...mapping, questionId: questionId.toUpperCase(), objectiveId: objectiveId.toUpperCase(), blueprintId: blueprintId.toUpperCase() }], uppercase)).toEqual([mapping]);
    expect(() => validateQuestionObjectiveAssignments([mapping, {
      ...mapping, questionId: questionId.toUpperCase(), blueprintId: blueprintId.toUpperCase(), objectiveId: secondObjectiveId,
    }], uppercase)).toThrow();
  });
  it("allows multiple secondary mappings without choosing a primary", () => {
    const input = [mapping, { ...mapping, objectiveId: secondObjectiveId }].map((value) => ({ ...value, isPrimary: false }));
    expect(validateQuestionObjectiveAssignments(input, catalog)).toEqual(input);
  });
  it("checks lettered objective counts at their specific parent codes", () => {
    const counts = Object.fromEntries(ccna200301V11Catalog.domains.flatMap((domain) => domain.objectives
      .filter((value) => value.subobjectiveCodes.length > 0).map((value): [string, number] => [value.code, value.subobjectiveCodes.length])));
    expect(counts).toEqual({
      "1.1": 8, "1.2": 6, "1.3": 2, "1.9": 4, "1.11": 4, "1.13": 4,
      "2.1": 3, "2.2": 3, "2.5": 4, "3.1": 7, "3.2": 3, "3.3": 4, "3.4": 4, "6.3": 2,
    });
  });
});

describe("verified v1.1 reference inventory", () => {
  it("represents the six weighted domains and all reviewed codes without database IDs", () => {
    const domains = ccna200301V11Catalog.domains;
    expect(domains.map((value) => [value.code, value.weightPercent])).toEqual([
      ["1.0", 20], ["2.0", 20], ["3.0", 25], ["4.0", 10], ["5.0", 15], ["6.0", 10],
    ]);
    expect(domains.map((value) => value.objectives.length)).toEqual([13, 9, 5, 9, 10, 7]);
    const codes = domains.flatMap((value) => value.objectives.flatMap((item) => [item.code, ...item.subobjectiveCodes]));
    expect(codes).toHaveLength(111);
    expect(new Set(codes).size).toBe(111);
    for (const value of domains) {
      value.objectives.forEach((item, index) => {
        expect(item.code).toBe(`${value.code.split(".")[0]}.${index + 1}`);
        item.subobjectiveCodes.forEach((code, subindex) => {
          expect(code).toBe(`${item.code}.${String.fromCharCode(97 + subindex)}`);
          expect(createExamObjectiveInputSchema.safeParse({ ...objective, code, domainCode: value.code }).success).toBe(true);
        });
      });
    }
    expect(ccna200301V11Catalog.descriptionReviewStatus).toBe("PENDING_VERIFICATION");
    expect(ccna200301V11Catalog).not.toHaveProperty("status");
  });
});

describe("legacy single-answer authoring compatibility", () => {
  it("requires no classification on existing question create/update inputs", () => {
    const input = { topicId: domainId, text: "Existing single-answer question", type: "MULTIPLE_CHOICE_SINGLE", difficulty: "EASY", options: [
      { optionKey: "A", text: "One", isCorrect: true }, { optionKey: "B", text: "Two", isCorrect: false },
    ] };
    const parsed = createQuestionInputSchema.parse(input);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed).not.toHaveProperty("objectives");
    expect(updateQuestionInputSchema.parse({ text: "Updated" })).toEqual({ text: "Updated" });
    expect(createQuestionInputSchema.safeParse({ ...input, objectives: [mapping] }).success).toBe(false);
  });
});
