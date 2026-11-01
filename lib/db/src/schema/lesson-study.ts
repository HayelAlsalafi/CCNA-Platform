import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  foreignKey,
  index,
  uniqueIndex,
  primaryKey,
  check,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { lessonRevisionsTable } from "./lessons";
import type { TextAnchor } from "../../../lesson-study";
const times = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
export const lessonAnnotationsTable = pgTable(
  "lesson_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    lessonId: uuid("lesson_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    kind: text("kind").notNull(),
    anchor: jsonb("anchor").$type<TextAnchor>(),
    body: text("body").notNull().default(""),
    color: text("color"),
    category: text("category").notNull().default(""),
    version: integer("version").notNull().default(1),
    ...times,
  },
  (t) => [
    foreignKey({
      name: "lesson_annotations_user_fk",
      columns: [t.userId],
      foreignColumns: [usersTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "lesson_annotations_revision_fk",
      columns: [t.revisionId, t.lessonId],
      foreignColumns: [lessonRevisionsTable.id, lessonRevisionsTable.lessonId],
    }).onDelete("restrict"),
    index("lesson_annotations_owner_lesson_idx").on(
      t.userId,
      t.lessonId,
      t.revisionId,
      t.createdAt,
      t.id,
    ),
    index("lesson_annotations_owner_kind_idx").on(t.userId, t.kind, t.updatedAt, t.id),
    uniqueIndex("lesson_bookmark_once_idx")
      .on(t.userId, t.lessonId, t.revisionId)
      .where(sql`${t.kind}='BOOKMARK'::text AND ${t.anchor} IS NULL`),
    check("lesson_annotations_kind_ck", sql`${t.kind} IN ('NOTE','HIGHLIGHT','BOOKMARK')`),
    check("lesson_annotations_version_ck", sql`${t.version}>0`),
    check(
      "lesson_annotations_color_ck",
      sql`${t.color} IS NULL OR ${t.color} IN ('yellow','green','blue','pink')`,
    ),
    check(
      "lesson_annotations_body_ck",
      sql`length(${t.body})<=10000 AND length(${t.category})<=80 AND (${t.kind}<>'NOTE' OR length(btrim(${t.body}))>0)`,
    ),
    check(
      "lesson_annotations_anchor_ck",
      sql`${t.anchor} IS NULL OR (jsonb_typeof(${t.anchor})='object' AND ${t.anchor} ?& ARRAY['blockId','start','end','quote'] AND jsonb_typeof(${t.anchor}->'blockId')='string' AND (${t.anchor}->>'blockId') ~ '^[a-f0-9-]{36}$' AND jsonb_typeof(${t.anchor}->'quote')='string' AND length(${t.anchor}->>'quote')<=5000 AND jsonb_typeof(${t.anchor}->'start')='number' AND jsonb_typeof(${t.anchor}->'end')='number' AND (${t.anchor}->>'start') ~ '^[0-9]{1,6}$' AND (${t.anchor}->>'end') ~ '^[0-9]{1,6}$' AND (${t.anchor}->>'end')::integer >= (${t.anchor}->>'start')::integer)`,
    ),
    check(
      "lesson_annotations_highlight_ck",
      sql`${t.kind}<>'HIGHLIGHT' OR (${t.color} IS NOT NULL AND ${t.anchor} IS NOT NULL AND (${t.anchor}->>'end')::integer>(${t.anchor}->>'start')::integer AND length(${t.anchor}->>'quote')>0)`,
    ),
    pgPolicy("lesson_annotations_owner", {
      for: "all",
      to: "public",
      using: sql`${t.userId}=nullif(current_setting('app.study_user',true),'')::uuid`,
      withCheck: sql`${t.userId}=nullif(current_setting('app.study_user',true),'')::uuid`,
    }),
  ],
).enableRLS();
export const lessonProgressTable = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id").notNull(),
    lessonId: uuid("lesson_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    state: text("state").notNull(),
    blockId: uuid("block_id"),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "lesson_progress_pkey", columns: [t.userId, t.lessonId, t.revisionId] }),
    foreignKey({
      name: "lesson_progress_user_fk",
      columns: [t.userId],
      foreignColumns: [usersTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "lesson_progress_revision_fk",
      columns: [t.revisionId, t.lessonId],
      foreignColumns: [lessonRevisionsTable.id, lessonRevisionsTable.lessonId],
    }).onDelete("restrict"),
    index("lesson_progress_owner_state_idx").on(t.userId, t.state, t.lessonId, t.revisionId),
    check("lesson_progress_state_ck", sql`${t.state} IN ('IN_PROGRESS','COMPLETED')`),
    check("lesson_progress_version_ck", sql`${t.version}>0`),
    pgPolicy("lesson_progress_owner", {
      for: "all",
      to: "public",
      using: sql`${t.userId}=nullif(current_setting('app.study_user',true),'')::uuid`,
      withCheck: sql`${t.userId}=nullif(current_setting('app.study_user',true),'')::uuid`,
    }),
  ],
).enableRLS();
export const lessonMediaTable = pgTable(
  "lesson_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdBy: uuid("created_by").notNull(),
    storageKey: text("storage_key").notNull().unique("lesson_media_storage_key_uq"),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "lesson_media_creator_fk",
      columns: [t.createdBy],
      foreignColumns: [usersTable.id],
    }).onDelete("restrict"),
    index("lesson_media_creator_idx").on(t.createdBy, t.createdAt, t.id),
    check("lesson_media_size_ck", sql`${t.bytes} BETWEEN 1 AND 5242880`),
    check("lesson_media_mime_ck", sql`${t.mime} IN ('image/png','image/jpeg','image/webp')`),
    check("lesson_media_hash_ck", sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check("lesson_media_key_ck", sql`${t.storageKey} ~ '^[a-f0-9-]{36}\.(png|jpg|webp)$'`),
  ],
);
