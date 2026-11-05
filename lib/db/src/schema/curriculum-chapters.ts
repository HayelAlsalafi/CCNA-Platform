import { ccnaBookChapters } from "../../../ccna-book-chapters";
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  unique,
  foreignKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import { topicsTable } from "./topics";
import { examDomainsTable } from "./exam-blueprints";
import { courseVersionsTable } from "./course-catalog";

/** A chapter owns one topic UUID. Questions, history and future lessons use this ID. */
export const curriculumChaptersTable = pgTable(
  "curriculum_chapters",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => topicsTable.id, { onDelete: "restrict" }),
    blueprintId: uuid("blueprint_id").notNull(),
    courseVersionId: uuid("course_version_id"),
    domainId: uuid("domain_id").notNull(),
    domainCode: varchar("domain_code", { length: 20 }).notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    volume: varchar("volume", { length: 2 }).notNull(),
    chapterNumber: integer("chapter_number").notNull(),
  },
  (t) => [
    unique("curriculum_chapters_code_uq").on(t.blueprintId, t.code),
    foreignKey({
      name: "curriculum_chapters_course_version_fk",
      columns: [t.courseVersionId, t.blueprintId],
      foreignColumns: [courseVersionsTable.id, courseVersionsTable.blueprintId],
    }).onDelete("restrict"),
    index("curriculum_chapters_course_version_idx").on(t.courseVersionId, t.id),
    unique("curriculum_chapters_number_uq").on(t.blueprintId, t.volume, t.chapterNumber),
    foreignKey({
      name: "curriculum_chapters_domain_fk",
      columns: [t.domainId, t.blueprintId, t.domainCode],
      foreignColumns: [examDomainsTable.id, examDomainsTable.blueprintId, examDomainsTable.code],
    }).onDelete("restrict"),
    index("curriculum_chapters_domain_idx").on(t.domainId, t.id),
    check(
      "curriculum_chapters_canonical_ck",
      sql.raw(
        "(id,volume,chapter_number,domain_code) IN (" +
          ccnaBookChapters
            .map(
              (c) => `('${c.topicId}'::uuid,'${c.volume}',${c.chapterNumber},'${c.primaryDomain}')`,
            )
            .join(",") +
          ")",
      ),
    ),
    check(
      "curriculum_chapters_number_ck",
      sql`(${t.volume}='V1' AND ${t.chapterNumber} BETWEEN 1 AND 29) OR (${t.volume}='V2' AND ${t.chapterNumber} BETWEEN 1 AND 19)`,
    ),
    check(
      "curriculum_chapters_code_ck",
      sql`${t.code} = 'CCNA-' || ${t.volume} || '-' || lpad(${t.chapterNumber}::text,2,'0')`,
    ),
  ],
);
