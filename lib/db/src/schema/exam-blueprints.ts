import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { questionsTable } from "./questions";

export const examBlueprintStatusEnum = pgEnum("exam_blueprint_status", ["DRAFT", "ACTIVE", "RETIRED"]);

/** Classification metadata only: blueprint status never changes question eligibility. */
export const examBlueprintsTable = pgTable("exam_blueprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  examCode: varchar("exam_code", { length: 40 }).notNull(),
  version: varchar("version", { length: 30 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  status: examBlueprintStatusEnum("status").notNull().default("DRAFT"),
  sourceUrl: varchar("source_url", { length: 2048 }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("exam_blueprints_code_version_uq").on(t.examCode, t.version),
  index("exam_blueprints_status_idx").on(t.status),
  check("exam_blueprints_identity_ck", sql`btrim(${t.examCode}) <> '' AND ${t.examCode} = btrim(${t.examCode}) AND btrim(${t.version}) <> '' AND ${t.version} = btrim(${t.version}) AND btrim(${t.title}) <> ''`),
  check("exam_blueprints_source_ck", sql`${t.sourceUrl} IS NULL OR ${t.sourceUrl} ~* '^https?://[^[:space:]]+$'`),
  check("exam_blueprints_verification_ck", sql`(${t.verifiedAt} IS NULL OR ${t.sourceUrl} IS NOT NULL) AND (${t.status} <> 'ACTIVE' OR ${t.verifiedAt} IS NOT NULL)`),
]);

export const examDomainsTable = pgTable("exam_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  blueprintId: uuid("blueprint_id").notNull()
    .references(() => examBlueprintsTable.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  weightPercent: integer("weight_percent").notNull(),
  displayOrder: integer("display_order").notNull(),
}, (t) => [
  unique("exam_domains_blueprint_code_uq").on(t.blueprintId, t.code),
  // Composite target binds objective domain IDs, blueprint IDs and domain codes.
  unique("exam_domains_binding_uq").on(t.id, t.blueprintId, t.code),
  index("exam_domains_blueprint_order_idx").on(t.blueprintId, t.displayOrder),
  check("exam_domains_code_ck", sql`${t.code} ~ '^[1-9][0-9]*[.]0$'`),
  check("exam_domains_name_ck", sql`btrim(${t.name}) <> ''`),
  check("exam_domains_weight_ck", sql`${t.weightPercent} BETWEEN 1 AND 100`),
  check("exam_domains_order_ck", sql`${t.displayOrder} >= 0`),
]);

export const examObjectivesTable = pgTable("exam_objectives", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").notNull(),
  blueprintId: uuid("blueprint_id").notNull(),
  domainCode: varchar("domain_code", { length: 20 }).notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  description: text("description").notNull(),
  displayOrder: integer("display_order").notNull(),
}, (t) => [
  unique("exam_objectives_domain_code_uq").on(t.domainId, t.code),
  unique("exam_objectives_blueprint_code_uq").on(t.blueprintId, t.code),
  unique("exam_objectives_binding_uq").on(t.id, t.blueprintId),
  foreignKey({ name: "exam_objectives_domain_fk", columns: [t.domainId, t.blueprintId, t.domainCode], foreignColumns: [examDomainsTable.id, examDomainsTable.blueprintId, examDomainsTable.code] }).onDelete("restrict"),
  index("exam_objectives_domain_order_idx").on(t.domainId, t.blueprintId, t.domainCode, t.displayOrder),
  check("exam_objectives_code_ck", sql`${t.code} ~ '^[1-9][0-9]*[.][1-9][0-9]*([.][a-z])?$' AND ${t.domainCode} = split_part(${t.code}, '.', 1) || '.0'`),
  check("exam_objectives_description_ck", sql`btrim(${t.description}) <> ''`),
  check("exam_objectives_order_ck", sql`${t.displayOrder} >= 0`),
]);

export const questionObjectivesTable = pgTable("question_objectives", {
  questionId: uuid("question_id").notNull()
    .references(() => questionsTable.id, { onDelete: "restrict" }),
  objectiveId: uuid("objective_id").notNull(),
  blueprintId: uuid("blueprint_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.questionId, t.objectiveId] }),
  foreignKey({ name: "question_objectives_objective_fk", columns: [t.objectiveId, t.blueprintId], foreignColumns: [examObjectivesTable.id, examObjectivesTable.blueprintId] }).onDelete("restrict"),
  uniqueIndex("question_objectives_primary_uq").on(t.questionId, t.blueprintId).where(sql`${t.isPrimary}`),
  index("question_objectives_objective_idx").on(t.objectiveId, t.blueprintId),
  index("question_objectives_question_blueprint_idx").on(t.questionId, t.blueprintId),
]);

export type ExamBlueprint = typeof examBlueprintsTable.$inferSelect;
export type ExamDomain = typeof examDomainsTable.$inferSelect;
export type ExamObjective = typeof examObjectivesTable.$inferSelect;
export type QuestionObjective = typeof questionObjectivesTable.$inferSelect;
