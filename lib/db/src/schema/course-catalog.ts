import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, integer, timestamp, unique, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { examBlueprintsTable } from "./exam-blueprints";

const metadata = () => ({
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull().default(""),
  status: varchar("status", { length: 10 }).notNull().default("DRAFT"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tracksTable = pgTable("tracks", {
  id: uuid("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ...metadata(),
}, t => [check("tracks_status_ck", sql`${t.status} IN ('DRAFT','ACTIVE','RETIRED')`),
  check("tracks_slug_ck", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);

export const coursesTable = pgTable("courses", {
  id: uuid("id").primaryKey(),
  trackId: uuid("track_id").notNull().references(() => tracksTable.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ...metadata(),
}, t => [check("courses_status_ck", sql`${t.status} IN ('DRAFT','ACTIVE','RETIRED')`),
  check("courses_slug_ck", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);

export const courseVersionsTable = pgTable("course_versions", {
  id: uuid("id").primaryKey(),
  courseId: uuid("course_id").notNull().references(() => coursesTable.id, { onDelete: "restrict" }),
  blueprintId: uuid("blueprint_id").notNull().unique().references((): AnyPgColumn => examBlueprintsTable.id, { onDelete: "restrict" }),
  versionKey: varchar("version_key", { length: 100 }).notNull(),
  catalogKey: varchar("catalog_key", { length: 160 }).notNull().unique(),
  ...metadata(),
}, t => [unique("course_versions_course_key_uq").on(t.courseId, t.versionKey),
  unique("course_versions_blueprint_binding_uq").on(t.id, t.blueprintId),
  check("course_versions_status_ck", sql`${t.status} IN ('DRAFT','ACTIVE','RETIRED')`),
  check("course_versions_keys_ck", sql`length(trim(${t.versionKey})) > 0 AND length(trim(${t.catalogKey})) > 0`)]);
