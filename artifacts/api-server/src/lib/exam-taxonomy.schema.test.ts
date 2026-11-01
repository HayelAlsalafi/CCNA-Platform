import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import {
  examBlueprintStatusEnum, examBlueprintsTable, examDomainsTable,
  examObjectivesTable, questionObjectivesTable,
} from "@workspace/db/schema";

// Inspect metadata and SQL text only. Never load @workspace/db or its config.
const migration = readFileSync(new URL("../../../../lib/db/drizzle/0005_exam_taxonomy.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: { idx: number; tag: string }[];
};
const tables = [examBlueprintsTable, examDomainsTable, examObjectivesTable, questionObjectivesTable];
const dialect = new PgDialect();
const render = (value: SQL) => dialect.sqlToQuery(value).sql;
// Normalize SQL formatting while preserving the content of string literals.
const normalize = (value: string) => value.split(/('(?:''|[^'])*')/g).map((part, position) => position % 2 ? part :
  part.replace(/"[^"]+"\./g, "").replace(/public\./g, "").replace(/"/g, "")
    .replace(/timestamp with time zone/g, "timestamptz").replace(/\s+/g, "").toLowerCase(),
).join("");
const statements = migration.replace(/^--[^\n]*$/gm, "").split(";").map((value) => value.trim()).filter(Boolean);

describe("official additive taxonomy migration (static, no database)", () => {
  it('links the new snapshot and preserves every historical schema object',()=>{
    const previous=JSON.parse(readFileSync(new URL('../../../../lib/db/drizzle/meta/0004_snapshot.json',import.meta.url),'utf8'));
    const current=JSON.parse(readFileSync(new URL('../../../../lib/db/drizzle/meta/0005_snapshot.json',import.meta.url),'utf8'));
    expect(current.prevId).toBe(previous.id);expect(current.id).not.toBe(previous.id);
    for(const [name,definition]of Object.entries(previous.tables))expect(current.tables[name]).toEqual(definition);
    for(const [name,definition]of Object.entries(previous.enums))expect(current.enums[name]).toEqual(definition);
    for(const key of ['sequences','roles','policies','views','schemas'])expect(current[key]).toEqual(previous[key]);
    expect(Object.keys(current.tables).length).toBe(Object.keys(previous.tables).length+4);
  });
  it("contains only creation of the taxonomy enum, four new tables and their indexes", () => {
    expect(statements).toHaveLength(11);
    expect(statements.every((value) => /^CREATE (TYPE|TABLE|(?:UNIQUE )?INDEX)\b/.test(value))).toBe(true);
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|ALTER TABLE|DROP|TRUNCATE)\b/i);
    expect([...migration.matchAll(/CREATE TABLE public\.(\w+)/g)].map((value) => value[1]))
      .toEqual(tables.map(getTableName));
    const definition = statements.find((value) => value.startsWith(`CREATE TYPE public.${examBlueprintStatusEnum.enumName} `));
    expect(normalize(definition!)).toBe(normalize(`CREATE TYPE public.${examBlueprintStatusEnum.enumName} AS ENUM ('${examBlueprintStatusEnum.enumValues.join("', '")}')`));
  });
  it("is journaled after the revision migration and preserves rehearsed SQL", () => {
    expect(journal.entries.at(-1)).toMatchObject({ idx: 5, tag: "0005_exam_taxonomy" });
    expect(journal.entries.map((entry) => entry.idx)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(migration).toBe(readFileSync(new URL("../../../../lib/db/drizzle/proposed/0005_exam_taxonomy.sql", import.meta.url), "utf8"));
  });
  it.each(tables.map((table) => [getTableName(table), table] as const))("matches columns, defaults, checks, keys and indexes for %s", (_name, table) => {
    const config = getTableConfig(table);
    const statement = statements.find((value) => value.startsWith(`CREATE TABLE public.${config.name} (`));
    expect(statement).toBeDefined();
    const body = statement!;
    const columnLines = body.split("\n").map((value) => value.trim()).filter((value) => !value.startsWith("CONSTRAINT"));
    for (const column of config.columns) {
      const line = columnLines.find((value) => value.startsWith(`${column.name} `));
      expect(line, `${config.name}.${column.name}`).toBeDefined();
      expect(normalize(line!)).toContain(normalize(`${column.name} ${column.getSQLType()}`));
      expect(/\bNOT NULL\b|\bPRIMARY KEY\b/.test(line!)).toBe(column.notNull);
      expect(line!.includes("PRIMARY KEY")).toBe(column.primary);
      if (column.default !== undefined) {
        const value = typeof column.default === "object" ? render(column.default as SQL) : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
        expect(normalize(line!)).toContain(normalize(`DEFAULT ${value}`));
      } else {
        expect(line).not.toContain("DEFAULT");
      }
    }
    expect([...body.matchAll(/^  (?!CONSTRAINT)(\w+) /gm)].map((value) => value[1])).toEqual(config.columns.map((column) => column.name));
    for (const constraint of config.checks) {
      const definition = body.split("\n").map((value) => value.trim().replace(/,$/, ""))
        .find((value) => value.startsWith(`CONSTRAINT ${constraint.name} CHECK(`));
      expect(definition).toBeDefined();
      expect(normalize(definition!)).toBe(normalize(`CONSTRAINT ${constraint.name} CHECK(${render(constraint.value)})`));
    }
    for (const constraint of config.uniqueConstraints) {
      expect(normalize(body)).toContain(normalize(`CONSTRAINT ${constraint.name} UNIQUE(${constraint.columns.map((column) => column.name).join(",")})`));
    }
    for (const constraint of config.primaryKeys) {
      expect(normalize(body)).toContain(normalize(`CONSTRAINT ${constraint.getName()} PRIMARY KEY(${constraint.columns.map((column) => column.name).join(",")})`));
    }
    for (const constraint of config.foreignKeys) {
      const reference = constraint.reference();
      const columns = reference.columns.map((column) => column.name).join(",");
      const target = `${getTableName(reference.foreignTable)}(${reference.foreignColumns.map((column) => column.name).join(",")})`;
      expect(constraint.onDelete).toBe("restrict");
      const definition = reference.columns.length === 1
        ? `${columns} uuid NOT NULL CONSTRAINT ${constraint.getName()} REFERENCES ${target} ON DELETE RESTRICT`
        : `CONSTRAINT ${constraint.getName()} FOREIGN KEY(${columns}) REFERENCES ${target} ON DELETE RESTRICT`;
      expect(normalize(body)).toContain(normalize(definition));
    }
    for (const index of config.indexes) {
      const columns = index.config.columns.map((column) => "name" in column ? column.name : render(column as SQL)).join(",");
      const definition = `CREATE ${index.config.unique ? "UNIQUE " : ""}INDEX ${index.config.name} ON ${config.name}(${columns})${index.config.where ? ` WHERE ${render(index.config.where)}` : ""}`;
      const statement = statements.find((value) => value.startsWith(`CREATE ${index.config.unique ? "UNIQUE " : ""}INDEX ${index.config.name} `));
      expect(statement).toBeDefined();
      expect(normalize(statement!)).toBe(normalize(definition));
    }
  });
  it("uses a partial unique index scoped to both question and blueprint", () => {
    const primary = getTableConfig(questionObjectivesTable).indexes.find((value) => value.config.name === "question_objectives_primary_uq")!;
    expect(primary.config.unique).toBe(true);
    expect(primary.config.columns.map((column) => "name" in column ? column.name : "expression")).toEqual(["question_id", "blueprint_id"]);
    expect(normalize(render(primary.config.where!))).toBe("is_primary");
  });
});
