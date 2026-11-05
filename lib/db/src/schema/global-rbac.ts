// Proposed only: no current user enum/default or applied migration is changed.
import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, check, index, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const globalRbacGuardTable = pgTable("global_rbac_guard", {
  singleton: boolean("singleton").primaryKey(),
  revision: integer("revision").notNull().default(0),
}, t => [check("global_rbac_guard_singleton_ck", sql`${t.singleton} AND ${t.revision}>=0`)]);
export const globalRoleAssignmentsTable = pgTable("global_role_assignments", {
  userId: uuid("user_id").primaryKey().references(() => usersTable.id, { onDelete: "restrict" }),
  scope: text("scope").notNull().default("GLOBAL"),
  role: text("role").notNull(),
  version: integer("version").notNull().default(1),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("global_roles_scope_ck", sql`${t.scope}='GLOBAL'`),
  check("global_roles_role_ck", sql`${t.role} IN ('OWNER','ADMIN','CONTENT_MANAGER','STUDENT')`),
  check("global_roles_version_ck", sql`${t.version}>0`),
  index("global_roles_active_idx").on(t.role, t.revokedAt, t.userId),
]);
export const adminAuditEventsTable = pgTable("admin_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  actorId: uuid("actor_id").references(() => usersTable.id, { onDelete: "restrict" }),
  targetId: uuid("target_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  scope: text("scope").notNull().default("GLOBAL"),
  reason: text("reason").notNull(),
  approvalRef: text("approval_ref"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state").notNull(),
  requestHash: text("request_hash").notNull(),
  result: jsonb("result").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique("admin_audit_request_uq").on(t.requestId),
  index("admin_audit_time_idx").on(t.occurredAt, t.id),
  check("admin_audit_shape_ck", sql`${t.scope}='GLOBAL' AND length(${t.reason}) BETWEEN 5 AND 500 AND ${t.requestHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.afterState})='object' AND jsonb_typeof(${t.result})='object' AND (${t.beforeState} IS NULL OR jsonb_typeof(${t.beforeState})='object') AND ((${t.action}='ROLE_CHANGE' AND ${t.actorId} IS NOT NULL AND ${t.approvalRef} IS NULL) OR (${t.action}='OWNER_BOOTSTRAP' AND ${t.actorId} IS NULL AND ${t.approvalRef} IS NOT NULL AND length(${t.approvalRef}) BETWEEN 5 AND 200))`),
]);
