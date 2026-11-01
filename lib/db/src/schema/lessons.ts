import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
  check,
  foreignKey,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import { curriculumChaptersTable } from "./curriculum-chapters";
import { usersTable } from "./users";

/** Editable working copy. Published readers use an immutable revision, never this content. */
export const lessonsTable = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
    estimatedMinutes: integer("estimated_minutes").notNull().default(5),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    displayOrder: integer("display_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    publishedRevisionId: uuid("published_revision_id"),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("lessons_chapter_order_idx").on(t.chapterId, t.displayOrder, t.id),
    foreignKey({ name: 'lessons_chapter_id_fkey', columns: [t.chapterId], foreignColumns: [curriculumChaptersTable.id] }).onDelete('restrict'),
    foreignKey({ name: 'lessons_created_by_fkey', columns: [t.createdBy], foreignColumns: [usersTable.id] }).onDelete('restrict'),
    foreignKey({ name: 'lessons_updated_by_fkey', columns: [t.updatedBy], foreignColumns: [usersTable.id] }).onDelete('restrict'),
    foreignKey({
      name: "lessons_published_revision_fk",
      columns: [t.publishedRevisionId, t.id],
      foreignColumns: [lessonRevisionsTable.id, lessonRevisionsTable.lessonId],
    }).onDelete("restrict"),
    check(
      "lessons_bounds_ck",
      sql`${t.version}>0 AND ${t.displayOrder}>=0 AND ${t.estimatedMinutes} BETWEEN 1 AND 600`,
    ),
    check(
      "lessons_content_arrays_ck",
      sql`jsonb_typeof(${t.objectives})='array' AND jsonb_typeof(${t.blocks})='array'`,
    ),
  ],
);

/** Stable section UUIDs plus revision UUIDs are future personal-note/highlight anchors. */
export const lessonRevisionsTable = pgTable(
  "lesson_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    foreignKey({ name: 'lesson_revisions_lesson_id_fkey', columns: [t.lessonId], foreignColumns: [lessonsTable.id] }).onDelete('restrict'),
    foreignKey({ name: 'lesson_revisions_created_by_fkey', columns: [t.createdBy], foreignColumns: [usersTable.id] }).onDelete('restrict'),
    unique("lesson_revisions_number_uq").on(t.lessonId, t.revisionNumber),
    unique("lesson_revisions_identity_uq").on(t.id, t.lessonId),
    index("lesson_revisions_lesson_idx").on(t.lessonId, t.revisionNumber),
    check("lesson_revisions_number_ck", sql`${t.revisionNumber}>0`),
    check("lesson_revisions_snapshot_ck", sql`jsonb_typeof(${t.snapshot})='object'`),
  ],
);
