import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  timestamp,
  boolean,
  unique,
  primaryKey,
  foreignKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import {questionDeletionAuditsTable} from "./question-deletion-audits";
import { usersTable } from "./users";
import { practiceDeliveriesTable } from "./question-revisions";
/** Proposed additive tracking. No current learner records are backfilled. */
export const learningSessionsTable = pgTable(
  "learning_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    authSessionId: varchar("auth_session_id", { length: 255 }).notNull(),
    requestId: uuid("request_id").notNull(),
    mode: varchar("mode", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
    config: jsonb("config").notNull(),
    questionCount: integer("question_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("learning_sessions_request_uq").on(t.userId, t.requestId),
    unique("learning_sessions_owner_uq").on(t.id, t.userId),
    index("learning_sessions_user_history_idx").on(t.userId, t.createdAt.desc(), t.id),
    check("learning_sessions_mode_ck", sql`${t.mode} IN ('LEARN','PRACTICE','REVIEW_MISTAKES')`),
    check("learning_sessions_status_ck", sql`${t.status} IN ('ACTIVE','COMPLETED','ABANDONED')`),
    check("learning_sessions_config_ck", sql`jsonb_typeof(${t.config})='object'`),
    check("learning_sessions_count_ck", sql`${t.questionCount} BETWEEN 1 AND 100`),
    check(
      "learning_sessions_completion_ck",
      sql`(${t.status}='ACTIVE' AND ${t.completedAt} IS NULL) OR (${t.status}<>'ACTIVE' AND ${t.completedAt} IS NOT NULL AND ${t.completedAt}>=${t.createdAt})`,
    ),
  ],
);
export const learningSessionItemsTable = pgTable(
  "learning_session_items",
  {
    sessionId: uuid("session_id").notNull(),
    userId: uuid("user_id").notNull(),
    position: integer("position").notNull(),
    questionId: uuid("question_id"),
    revisionId: uuid("revision_id"),
    deliveryId: uuid("delivery_id").unique(),
    deletedQuestionCode:varchar("deleted_question_code",{length:32}),
    deletedAt:timestamp("deleted_at",{withTimezone:true}),
    deletionAuditId:uuid("deletion_audit_id"),
    selectedOptionKey: varchar("selected_option_key", { length: 128 }),
    flagged: boolean("flagged").default(false).notNull(),
    domainSnapshot: jsonb("domain_snapshot")
      .default(sql`'[]'::jsonb`)
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    unique("learning_session_items_question_uq").on(t.sessionId, t.questionId),
    foreignKey({
      name: "learning_session_items_owner_fk",
      columns: [t.sessionId, t.userId],
      foreignColumns: [learningSessionsTable.id, learningSessionsTable.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "learning_session_items_delivery_fk",
      columns: [t.deliveryId, t.userId, t.questionId, t.revisionId],
      foreignColumns: [
        practiceDeliveriesTable.id,
        practiceDeliveriesTable.userId,
        practiceDeliveriesTable.questionId,
        practiceDeliveriesTable.revisionId,
      ],
    }).onDelete("restrict"),
    foreignKey({name:"learning_session_items_deletion_audit_fk",columns:[t.deletionAuditId],foreignColumns:[questionDeletionAuditsTable.id]}).onDelete("restrict"),
    check("learning_session_items_tombstone_ck",sql`(${t.questionId} IS NOT NULL AND ${t.revisionId} IS NOT NULL AND ${t.deliveryId} IS NOT NULL AND ${t.deletedQuestionCode} IS NULL AND ${t.deletedAt} IS NULL AND ${t.deletionAuditId} IS NULL) OR (${t.questionId} IS NULL AND ${t.revisionId} IS NULL AND ${t.deliveryId} IS NULL AND ${t.deletedQuestionCode} IS NOT NULL AND ${t.deletedAt} IS NOT NULL AND ${t.deletionAuditId} IS NOT NULL AND ${t.selectedOptionKey} IS NULL AND ${t.flagged}=false AND ${t.domainSnapshot}='[]'::jsonb)`),
    index("learning_session_items_user_idx").on(t.userId, t.sessionId),
    check("learning_session_items_position_ck", sql`${t.position} BETWEEN 0 AND 99`),
    check("learning_session_items_domains_ck", sql`jsonb_typeof(${t.domainSnapshot})='array'`),
  ],
);
