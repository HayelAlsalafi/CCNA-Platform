import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  boolean,
  unique,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { questionRevisionsTable } from "./question-revisions";
import { questionDeletionAuditsTable } from "./question-deletion-audits";
export const examSessionsTable = pgTable(
  "exam_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    authSessionId: varchar("auth_session_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    config: jsonb("config").notNull(),
    questionCount: integer("question_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    result: jsonb("result"),
  },
  (t) => [
    unique("exam_sessions_request_uq").on(t.userId, t.requestId),
    unique("exam_sessions_owner_uq").on(t.id, t.userId),
    index("exam_sessions_history_idx").on(t.userId, t.startedAt.desc(), t.id),
    index("exam_sessions_deadline_idx").on(t.status, t.deadlineAt),
    check("exam_sessions_count_ck", sql`${t.questionCount} BETWEEN 1 AND 100`),
    check("exam_sessions_config_ck", sql`jsonb_typeof(${t.config})='object'`),
    check(
      "exam_sessions_deadline_ck",
      sql`${t.deadlineAt} BETWEEN ${t.startedAt}+interval '5 minutes' AND ${t.startedAt}+interval '180 minutes'`,
    ),
    check(
      "exam_sessions_state_ck",
      sql`(${t.status}='ACTIVE' AND ${t.finalizedAt} IS NULL AND ${t.result} IS NULL) OR (${t.status} IN ('SUBMITTED','EXPIRED') AND ${t.finalizedAt} IS NOT NULL AND ${t.result} IS NOT NULL AND ${t.finalizedAt}>=${t.startedAt} AND jsonb_typeof(${t.result})='object')`,
    ),
  ],
);
export const examSessionItemsTable = pgTable(
  "exam_session_items",
  {
    deliveryId: uuid("delivery_id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull(),
    userId: uuid("user_id").notNull(),
    position: integer("position").notNull(),
    questionId: uuid("question_id"),
    revisionId: uuid("revision_id"),
    mappingSnapshot: jsonb("mapping_snapshot").notNull(),
    selectedKeys: jsonb("selected_keys")
      .notNull()
      .default(sql`'[]'::jsonb`),
    flagged: boolean("flagged").notNull().default(false),
    answerVersion: integer("answer_version").notNull().default(0),
    gradedResult: jsonb("graded_result"),
    deletedQuestionCode: varchar("deleted_question_code", { length: 32 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletionAuditId: uuid("deletion_audit_id").references(() => questionDeletionAuditsTable.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    unique("exam_items_position_uq").on(t.sessionId, t.position),
    unique("exam_items_question_uq").on(t.sessionId, t.questionId),
    foreignKey({
      name: "exam_items_owner_fk",
      columns: [t.sessionId, t.userId],
      foreignColumns: [examSessionsTable.id, examSessionsTable.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "exam_items_revision_fk",
      columns: [t.revisionId, t.questionId],
      foreignColumns: [questionRevisionsTable.id, questionRevisionsTable.questionId],
    }).onDelete("restrict"),
    index("exam_items_question_idx").on(t.questionId, t.revisionId),
    index("exam_items_user_idx").on(t.userId, t.sessionId, t.position),
    check("exam_items_position_ck", sql`${t.position} BETWEEN 0 AND 99`),
    check("exam_items_version_ck", sql`${t.answerVersion}>=0`),
    check(
      "exam_items_json_ck",
      sql`jsonb_typeof(${t.mappingSnapshot})='object' AND jsonb_typeof(${t.selectedKeys})='array' AND jsonb_array_length(${t.selectedKeys})<=10`,
    ),
    check(
      "exam_items_tombstone_ck",
      sql`(${t.questionId} IS NOT NULL AND ${t.revisionId} IS NOT NULL AND ${t.deletedQuestionCode} IS NULL AND ${t.deletedAt} IS NULL AND ${t.deletionAuditId} IS NULL) OR (${t.questionId} IS NULL AND ${t.revisionId} IS NULL AND ${t.deletedQuestionCode} IS NOT NULL AND ${t.deletedAt} IS NOT NULL AND ${t.deletionAuditId} IS NOT NULL AND ${t.selectedKeys}='[]'::jsonb AND NOT ${t.flagged} AND ${t.gradedResult} IS NULL)`,
    ),
  ],
);
