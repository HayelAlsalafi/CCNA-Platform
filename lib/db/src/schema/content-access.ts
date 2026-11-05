import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, jsonb, check, foreignKey, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { coursesTable, courseVersionsTable } from "./course-catalog";
import { lessonsTable, lessonRevisionsTable } from "./lessons";
import { usersTable } from "./users";

export const contentAccessPoliciesTable = pgTable("content_access_policies", {
  id: uuid("id").primaryKey(),
  kind: varchar("kind", { length: 10 }).notNull(),
  courseId: uuid("course_id").unique().references(() => coursesTable.id, { onDelete: "restrict" }),
  courseVersionId: uuid("course_version_id").unique().references(() => courseVersionsTable.id, { onDelete: "restrict" }),
  lessonId: uuid("lesson_id").unique().references((): AnyPgColumn => lessonsTable.id, { onDelete: "restrict" }),
  policy: varchar("policy", { length: 20 }).notNull().default("ENTITLED"),
  freeActions: jsonb("free_actions").$type<string[]>().notNull().default([]),
  previewActions: jsonb("preview_actions").$type<string[]>().notNull().default([]),
  previewRevisionId: uuid("preview_revision_id"),
}, t => [
  check("content_access_resource_ck", sql`(${t.kind}='COURSE' AND ${t.courseId} IS NOT NULL AND ${t.courseVersionId} IS NULL AND ${t.lessonId} IS NULL) OR (${t.kind}='VERSION' AND ${t.courseId} IS NULL AND ${t.courseVersionId} IS NOT NULL AND ${t.lessonId} IS NULL) OR (${t.kind}='LESSON' AND ${t.courseId} IS NULL AND ${t.courseVersionId} IS NULL AND ${t.lessonId} IS NOT NULL)`),
  check("content_access_policy_ck", sql`${t.policy} IN ('FREE_OPEN','FREE_PREVIEW','ENTITLED')`),
  check("content_access_actions_ck", sql`jsonb_typeof(${t.freeActions})='array' AND jsonb_typeof(${t.previewActions})='array' AND ${t.freeActions} <@ '["metadata.read","lesson.read","media.read","practice.start","exam.start"]'::jsonb AND ${t.previewActions} <@ '["metadata.read","lesson.read","media.read"]'::jsonb`),
  check("content_access_preview_ck", sql`(${t.previewRevisionId} IS NULL OR (${t.kind}='LESSON' AND ${t.policy}='FREE_PREVIEW')) AND (${t.policy}='FREE_OPEN' OR ${t.freeActions}='[]'::jsonb) AND (${t.policy}='FREE_PREVIEW' OR ${t.previewActions}='[]'::jsonb)`),
  foreignKey({ name: "content_access_preview_revision_fk", columns: [t.previewRevisionId,t.lessonId], foreignColumns: [lessonRevisionsTable.id,lessonRevisionsTable.lessonId] }).onDelete("restrict"),
]);
export const manualEntitlementsTable = pgTable("manual_entitlements", {
  id: uuid("id").primaryKey(),
  resourceId: uuid("resource_id").notNull().references(() => contentAccessPoliciesTable.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  actions: jsonb("actions").$type<string[]>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  grantedBy: uuid("granted_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  requestId: uuid("request_id").notNull().unique(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by").references(() => usersTable.id, { onDelete: "restrict" }),
  revokeReason: text("revoke_reason"),
}, t => [
  index("manual_entitlements_user_resource_idx").on(t.userId,t.resourceId),
  check("manual_entitlements_window_ck", sql`${t.endsAt} IS NULL OR ${t.endsAt}>${t.startsAt}`),
  check("manual_entitlements_actions_ck", sql`jsonb_typeof(${t.actions})='array' AND jsonb_array_length(${t.actions}) BETWEEN 1 AND 5 AND ${t.actions} <@ '["metadata.read","lesson.read","media.read","practice.start","exam.start"]'::jsonb`),
  check("manual_entitlements_reason_ck", sql`length(trim(${t.reason})) BETWEEN 5 AND 500`),
  check("manual_entitlements_revocation_ck", sql`(${t.revokedAt} IS NULL AND ${t.revokedBy} IS NULL AND ${t.revokeReason} IS NULL) OR (${t.revokedAt} IS NOT NULL AND ${t.revokedBy} IS NOT NULL AND ${t.revokeReason} IS NOT NULL AND length(trim(${t.revokeReason})) BETWEEN 5 AND 500)`),
]);
