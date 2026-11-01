import { describe, expect, it } from "vitest";
import {
  importHeaders,
  questionFingerprint,
  validateImportRows,
  importSummary,
} from "./admin-content-validation";
import {
  csvRows,
  parseQuestionFile,
  xlsxTemplate,
  zipEntries,
  MAX_FILE_BYTES,
} from "./question-import-files";
const topic = "11111111-1111-4111-8111-111111111111",
  blueprint = "22222222-2222-4222-8222-222222222222";
const row = {
  topicId: topic,
  text: "Which protocol?",
  difficulty: "EASY",
  optionA: "OSPF",
  optionB: "FTP",
  correctOption: "A",
};
const record = (overrides: Record<string, string> = {}) => ({ ...row, ...overrides });
const values = (r: Record<string, string>) => importHeaders.map((h) => r[h] ?? "");
const catalog = {
  topics: [{ id: topic }],
  objectives: [
    { id: "33333333-3333-4333-8333-333333333333", blueprintId: blueprint, code: "1.1" },
    { id: "44444444-4444-4444-8444-444444444444", blueprintId: blueprint, code: "2.1" },
  ],
};
describe("CSV/XLSX parsing without a database", () => {
  it("reads BOM, quoted commas, escaped quotes and multiline fields", () => {
    const rows = csvRows('topicId,text\r\n1,"first, line\nsecond ""quoted"""\r\n');
    expect(rows).toEqual([
      ["topicId", "text"],
      ["1", 'first, line\nsecond "quoted"'],
    ]);
  });
  it.each(['"unclosed', 'a"b,c', '"a"z,b'])("rejects malformed CSV: %s", (text) =>
    expect(() => csvRows(text)).toThrow(),
  );
  it("round-trips generated Excel cells, Unicode, whitespace and XML escaping", () => {
    const r = record({ text: "OSPF < TCP & UDP — سؤال", explanation: "line 1\nline 2" });
    expect(parseQuestionFile("template.xlsx", xlsxTemplate([importHeaders, values(r)]))[0]).toEqual(
      Object.fromEntries(importHeaders.map((h) => [h, r[h as keyof typeof r] ?? ""])),
    );
  });
  it("accepts a valid UTF-8 CSV using the same headers", () => {
    expect(
      parseQuestionFile(
        "q.CSV",
        Buffer.from("\uFEFF" + importHeaders.join(",") + "\n" + values(row).join(",")),
      )[0]?.text,
    ).toBe(row.text);
  });
  it("rejects duplicate or unsupported headers", () => {
    for (const h of ["topicId,topicId", "topicId,unknown"])
      expect(() => parseQuestionFile("q.csv", Buffer.from(h + "\na,b"))).toThrow();
  });
  it("rejects an empty template, old XLS files, bad ZIP and invalid UTF-8", () => {
    expect(() => parseQuestionFile("q.xlsx", xlsxTemplate())).toThrow();
    expect(() => parseQuestionFile("q.xls", Buffer.from("abc"))).toThrow();
    expect(() => parseQuestionFile("q.xlsx", Buffer.from("abc"))).toThrow();
    expect(() => parseQuestionFile("q.csv", Buffer.from([255]))).toThrow();
  });
  it("rejects files over 2 MiB and more than 500 rows", () => {
    expect(() => parseQuestionFile("q.csv", Buffer.alloc(MAX_FILE_BYTES + 1))).toThrow();
    expect(() =>
      parseQuestionFile(
        "q.csv",
        Buffer.from(
          importHeaders.join(",") + "\n" + Array(501).fill(values(row).join(",")).join("\n"),
        ),
      ),
    ).toThrow();
  });
  const workbook = (sheet: string, extra: Record<string, string> = {}) =>
    zipEntries({
      "xl/workbook.xml": '<workbook><sheets><sheet r:id="s"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="s" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml": sheet,
      ...extra,
    });
  it("rejects formulas, merged cells, entity declarations and traversal", () => {
    for (const sheet of [
      "<worksheet><f>1+1</f></worksheet>",
      "<worksheet><mergeCells/></worksheet>",
      "<!DOCTYPE foo><worksheet/>",
    ])
      expect(() => parseQuestionFile("q.xlsx", workbook(sheet))).toThrow();
    expect(() =>
      parseQuestionFile("q.xlsx", workbook("<worksheet/>", { "../bad.xml": "<bad/>" })),
    ).toThrow();
  });
  it("reads shared strings and sparse ordinary Excel cells", () => {
    const shared = [...importHeaders, ...values(row)].map((v) => `<si><t>${v}</t></si>`).join("");
    const cells = (offset: number, num: number) =>
      importHeaders
        .map((_, i) => `<c r="${String.fromCharCode(65 + i)}${num}" t="s"><v>${i + offset}</v></c>`)
        .join("");
    const file = workbook(
      `<worksheet><sheetData><row r="1">${cells(0, 1)}</row><row r="2">${cells(importHeaders.length, 2)}</row></sheetData></worksheet>`,
      { "xl/sharedStrings.xml": `<sst>${shared}</sst>` },
    );
    expect(parseQuestionFile("q.xlsx", file)[0]?.correctOption).toBe("A");
  });
  it("rejects damaged CRC and oversized decompression claims", () => {
    const damaged = xlsxTemplate([importHeaders, values(row)]);
    const at = damaged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    damaged.writeUInt32LE(0, at + 16);
    expect(() => parseQuestionFile("q.xlsx", damaged)).toThrow();
    const bomb = xlsxTemplate([importHeaders, values(row)]);
    const dir = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(30 * 1024 * 1024, dir + 24);
    expect(() => parseQuestionFile("q.xlsx", bomb)).toThrow();
  });
});
describe("row validation and explicit taxonomy", () => {
  it("creates only unpublished single-answer drafts, with no inferred objectives", () => {
    const out = validateImportRows([row], catalog, new Set());
    expect(out[0]?.draft?.question.status).toBe("DISABLED");
    expect(out[0]?.draft?.question.type).toBe("MULTIPLE_CHOICE_SINGLE");
    expect(out[0]?.draft?.assignments).toEqual([]);
  });
  it.each<Record<string, string>>([
    { correctOption: "Z" },
    { optionB: "" },
    { topicId: "invalid" },
    { topicId: "55555555-5555-4555-8555-555555555555" },
    { difficulty: "IMPOSSIBLE" },
    { text: "" },
    { text: "x".repeat(10001) },
    { text: "bad\u0000text" },
  ])("returns row-level errors for %j", (overrides) => {
    const out = validateImportRows([record(overrides)], catalog, new Set());
    expect(out[0]?.status).toBe("rejected");
    expect(out[0]?.row).toBe(2);
    expect(out[0]?.errors.length).toBeGreaterThan(0);
  });
  it("accepts multiple objective codes with exactly one explicitly selected primary", () => {
    const out = validateImportRows(
      [record({ blueprintId: blueprint, objectiveCodes: "1.1;2.1", primaryObjectiveCode: "2.1" })],
      catalog,
      new Set(),
    );
    expect(out[0]?.status).toBe("accepted");
    expect(out[0]?.draft?.assignments.map((a) => a.isPrimary)).toEqual([false, true]);
  });
  it.each<Record<string, string>>([
    { blueprintId: blueprint },
    { objectiveCodes: "1.1" },
    { blueprintId: blueprint, objectiveCodes: "9.9" },
    { blueprintId: blueprint, objectiveCodes: "1.1;1.1" },
    { blueprintId: blueprint, objectiveCodes: "1.1", primaryObjectiveCode: "2.1" },
  ])("rejects invalid objective associations %j", (overrides) =>
    expect(validateImportRows([record(overrides)], catalog, new Set())[0]?.status).toBe("rejected"),
  );
  it("detects duplicates in the file and against existing data despite reordered answers/case/spacing", () => {
    const q = validateImportRows([row], catalog, new Set())[0]!.draft!.question;
    const changed = record({
      text: "  WHICH   PROTOCOL? ",
      optionA: "ftp",
      optionB: "ospf",
      correctOption: "B",
    });
    expect(importSummary(validateImportRows([row, changed], catalog, new Set()))).toEqual({
      accepted: 1,
      rejected: 0,
      duplicates: 1,
      total: 2,
    });
    expect(
      validateImportRows([changed], catalog, new Set([questionFingerprint(q)]))[0]?.status,
    ).toBe("duplicate");
  });
});
