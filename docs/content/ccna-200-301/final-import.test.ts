// Optional actual-file validation: no database; the supplied snapshot is not a live check.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readPack, validateBindings, questionRecords } from "./prepare-pack.mjs";
import { parseQuestionFile } from "../../../artifacts/api-server/src/lib/question-import-files";
import {
  validateImportRows,
  importSummary,
} from "../../../artifacts/api-server/src/lib/admin-content-validation";
import {
  examBlueprintDomainsInputSchema,
  createExamObjectiveInputSchema,
} from "../../../lib/db/src/schema/exam-taxonomy-validation";
it("validates the final bound CSV against the actual Admin-exported ID snapshot", () => {
  const p = readPack(),
    bindings = JSON.parse(readFileSync(process.env.CCNA_CONTENT_BINDINGS!, "utf8"));
  validateBindings(p, bindings);
  const catalog = JSON.parse(readFileSync(process.env.CCNA_CONTENT_CATALOG!, "utf8"));
  expect(catalog.packId).toBe(p.packId);
  expect(catalog.blueprints).toHaveLength(1);
  expect(catalog.blueprints[0].id).toBe(bindings.blueprintId);
  expect(catalog.blueprints[0].examCode).toBe("200-301");
  expect(catalog.blueprints[0].version).toBe("1.1");
  expect(catalog.blueprints[0].sourceUrl).toBe(p.sourceUrl);
  expect(
    examBlueprintDomainsInputSchema.parse(
      catalog.domains.map((d: any) => ({
        blueprintId: d.blueprintId,
        code: d.code,
        name: d.name,
        weightPercent: d.weightPercent,
        displayOrder: d.displayOrder,
      })),
    ),
  ).toHaveLength(6);
  for (const d of catalog.domains) expect(d.id).toBe(bindings.domainIds[d.code]);
  for (const domain of p.domains)
    for (const [code] of domain.objectives) {
      const matches = catalog.objectives.filter(
        (o: any) => o.code === code && o.blueprintId === bindings.blueprintId,
      );
      expect(matches, code).toHaveLength(1);
      const o = matches[0];
      expect(o.domainId).toBe(bindings.domainIds[domain.code]);
      expect(
        createExamObjectiveInputSchema.parse({
          domainId: o.domainId,
          blueprintId: o.blueprintId,
          domainCode: o.domainCode,
          code: o.code,
          description: o.description,
          displayOrder: o.displayOrder,
        }),
      ).toBeDefined();
    }
  expect(catalog.topics).toHaveLength(24);
  for (const t of p.topics)
    expect(catalog.topics.find((row: any) => row.slug === t.slug)?.id).toBe(
      bindings.topicIds[t.slug],
    );
  const records = parseQuestionFile(
    "questions.import.csv",
    readFileSync(process.env.CCNA_CONTENT_CSV!),
  );
  expect(records).toEqual(questionRecords(p, bindings));
  expect(importSummary(validateImportRows(records, catalog, new Set()))).toEqual({
    accepted: 60,
    rejected: 0,
    duplicates: 0,
    total: 60,
  });
});
