import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  readPack,
  checkPack,
  choices,
  topicBodies,
  taxonomyBodies,
  bindingsTemplate,
  validateBindings,
  questionRecords,
  csv,
  headers,
  directory,
} from "./prepare-pack.mjs";
import { createTopicInputSchema } from "../../../lib/db/src/schema/topics";
import {
  createExamBlueprintInputSchema,
  createExamObjectiveInputSchema,
  examBlueprintDomainsInputSchema,
} from "../../../lib/db/src/schema/exam-taxonomy-validation";
import { ccna200301V11Catalog } from "../../../lib/db/src/schema/ccna-200-301-v1-1";
import {
  importHeaders,
  validateImportRows,
  importSummary,
  questionFingerprint,
} from "../../../artifacts/api-server/src/lib/admin-content-validation";
import { parseQuestionFile } from "../../../artifacts/api-server/src/lib/question-import-files";

// Synthetic identifiers used solely by this database-free test; never delivered as real IDs.
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const p = readPack();
const bindings = {
  ...bindingsTemplate(p),
  blueprintId: uuid(1),
  domainIds: Object.fromEntries(
    p.domains.map((d: { code: string }, i: number) => [d.code, uuid(10 + i)]),
  ),
  topicIds: Object.fromEntries(
    p.topics.map((t: { slug: string }, i: number) => [t.slug, uuid(100 + i)]),
  ),
};
const taxonomy = taxonomyBodies(p, bindings);
const catalog = {
  topics: Object.values(bindings.topicIds).map((id) => ({ id: id as string })),
  objectives: taxonomy.objectives.map((o: { code: string; blueprintId: string }, i: number) => ({
    id: uuid(200 + i),
    code: o.code,
    blueprintId: o.blueprintId,
  })),
};
const records = questionRecords(p, bindings);
describe("original CCNA pilot content without database access", () => {
  it("contains exactly 24 topics, 60 questions and the six approved weighted domains", () => {
    expect(checkPack(p)).toEqual({
      topics: 24,
      questions: 60,
      objectives: 53,
      coveredObjectives: 44,
      difficulty: { EASY: 19, MEDIUM: 31, HARD: 10 },
    });
    expect(
      p.domains.map((d: { code: string; weightPercent: number }) => [d.code, d.weightPercent]),
    ).toEqual(ccna200301V11Catalog.domains.map((d) => [d.code, d.weightPercent]));
    expect(
      p.domains.flatMap((d: { objectives: [string, string][] }) => d.objectives.map((o) => o[0])),
    ).toEqual(ccna200301V11Catalog.domains.flatMap((d) => d.objectives.map((o) => o.code)));
  });
  it("all topic create payloads pass the actual strict schema and start disabled", () => {
    for (const body of topicBodies(p)) {
      expect(createTopicInputSchema.parse(body)).toEqual(body);
      expect(body.status).toBe("DISABLED");
    }
  });
  it("all blueprint/domain/objective payloads satisfy actual schemas with explicit bindings", () => {
    const body = { ...taxonomy.blueprint, verifiedAt: new Date(taxonomy.blueprint.verifiedAt) };
    expect(createExamBlueprintInputSchema.parse(body).status).toBe("DRAFT");
    expect(examBlueprintDomainsInputSchema.parse(taxonomy.domains)).toHaveLength(6);
    for (const o of taxonomy.objectives) expect(createExamObjectiveInputSchema.parse(o)).toEqual(o);
  });
  it("CSV round-trips every text, quote, field and explanation through the real parser", () => {
    expect(headers).toEqual(importHeaders);
    expect(parseQuestionFile("pilot.csv", Buffer.from(csv(records)))).toEqual(records);
    expect(Buffer.byteLength(csv(records))).toBeLessThan(2 * 1024 * 1024);
  });
  it("all 60 bound rows pass actual import validation with four options, one correct and one primary", () => {
    const rows = validateImportRows(records, catalog, new Set());
    expect(importSummary(rows)).toEqual({ accepted: 60, rejected: 0, duplicates: 0, total: 60 });
    for (const row of rows) {
      expect(row.draft!.question.options).toHaveLength(4);
      expect(row.draft!.question.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(row.draft!.question.status).toBe("DISABLED");
      expect(row.draft!.assignments).toHaveLength(1);
      expect(row.draft!.assignments[0].isPrimary).toBe(true);
      expect(row.draft!.question.explanation.length).toBeGreaterThan(70);
    }
  });
  it("repeat import is entirely duplicate, including when stored questions are disabled", () => {
    const first = validateImportRows(records, catalog, new Set());
    const existing = new Set(first.map((row) => questionFingerprint(row.draft!.question)));
    expect(importSummary(validateImportRows(records, catalog, existing))).toEqual({
      accepted: 0,
      rejected: 0,
      duplicates: 60,
      total: 60,
    });
  });
  it("duplicate detection is insensitive to option order and choice labels", () => {
    const first = validateImportRows(records, catalog, new Set());
    const q = first[0].draft!.question;
    expect(questionFingerprint({ ...q, options: [...q.options].reverse() })).toBe(
      questionFingerprint(q),
    );
  });
  it("unbound question source cannot masquerade as an import-ready CSV", () => {
    const source = parseQuestionFile(
      "source.csv",
      readFileSync(path.join(directory, "questions.source.csv")),
    );
    expect(importSummary(validateImportRows(source, catalog, new Set()))).toEqual({
      accepted: 0,
      rejected: 60,
      duplicates: 0,
      total: 60,
    });
    expect(() => validateBindings(p, bindingsTemplate(p))).toThrow(/real Admin UUID/);
  });
  it("bindings reject another pack, omitted topics, extra overrides and repeated UUIDs", () => {
    expect(() => validateBindings(p, { ...bindings, packId: "other-pack" })).toThrow(/packId/);
    expect(() => validateBindings(p, { ...bindings, topicIds: {} })).toThrow(/binding keys/);
    expect(() => validateBindings(p, { ...bindings, DATABASE_URL: "not-supported" })).toThrow(
      /binding keys/,
    );
    const ids = { ...bindings.topicIds };
    ids[p.topics[1].slug] = ids[p.topics[0].slug];
    expect(() => validateBindings(p, { ...bindings, topicIds: ids })).toThrow(
      /Repeated binding UUID/,
    );
  });
  it("correct-answer positions are balanced without modifying explanations", () => {
    expect(
      ["A", "B", "C", "D"].map(
        (key) => records.filter((r: Record<string, string>) => r.correctOption === key).length,
      ),
    ).toEqual([15, 15, 15, 15]);
    for (let i = 0; i < p.questions.length; i++)
      expect(
        choices(p.questions[i], i).find((o: { isCorrect: boolean }) => o.isCorrect)!.text,
      ).toBe(p.questions[i].correct);
  });
  it("subnet calculation and modified EUI-64 answer are independently recomputed", () => {
    const hostBits = 32 - 26,
      block = 2 ** hostBits,
      network = Math.floor(64 / block) * block;
    expect([network + 1, network + block - 2]).toEqual([65, 126]);
    const mac = "00:25:96:12:34:56".split(":").map((v) => parseInt(v, 16));
    const iid = [mac[0] ^ 2, ...mac.slice(1, 3), 255, 254, ...mac.slice(3)];
    const hex = iid.map((v) => v.toString(16).padStart(2, "0")).join("");
    expect(hex.match(/.{4}/g)!.join(":")).toBe(
      p.questions.find((q: { id: string }) => q.id === "S7-D1-Q10").correct,
    );
  });
  it("all prepared files retain their recorded manifest hashes", () => {
    const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
    for (const [name, expected] of Object.entries(manifest.hashes))
      expect(
        createHash("sha256")
          .update(readFileSync(path.join(directory, name)))
          .digest("hex"),
        name,
      ).toBe(expected);
  });
});
