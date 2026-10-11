import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { questionsTable } from "./questions";
import { topicsTable } from "./topics";
import { practiceDeliveriesTable, questionRevisionsTable } from "./question-revisions";
import { usersTable } from "./users";

/**
 * Append-only submission records. Topic and grading values reflect submission
 * time; disabling or editing a question must not rewrite its attempt history.
 * Legacy rows retain NULL revision/delivery IDs. New submissions require a delivery;
 * retries of the same delivery do not create additional attempts.
 */
export const practiceAttemptsTable = pgTable(
  "practice_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questionsTable.id, { onDelete: "restrict" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topicsTable.id, { onDelete: "restrict" }),
    revisionId: uuid("revision_id"),
    deliveryId: uuid("delivery_id"),
    selectedOptionKey: varchar("selected_option_key", { length: 8 }).notNull(),
    isCorrect: boolean("is_correct").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("practice_attempts_user_history_idx").on(table.userId, table.submittedAt, table.id),
    index("practice_attempts_user_topic_idx").on(table.userId, table.topicId, table.submittedAt, table.id),
    index("practice_attempts_chronological_idx").on(table.submittedAt, table.id),
    index("practice_attempts_question_idx").on(table.questionId),
    unique("practice_attempts_delivery_uq").on(table.deliveryId),
    index("practice_attempts_revision_idx").on(table.revisionId, table.questionId),
    foreignKey({ name: "practice_attempts_revision_fk", columns: [table.revisionId, table.questionId], foreignColumns: [questionRevisionsTable.id, questionRevisionsTable.questionId] }).onDelete("restrict"),
    foreignKey({ name: "practice_attempts_delivery_fk", columns: [table.deliveryId, table.userId, table.questionId, table.revisionId], foreignColumns: [practiceDeliveriesTable.id, practiceDeliveriesTable.userId, practiceDeliveriesTable.questionId, practiceDeliveriesTable.revisionId] }).onDelete("restrict"),
    check("practice_attempts_revision_pair_ck", sql`(${table.revisionId} IS NULL) = (${table.deliveryId} IS NULL)`),
  ],
);

export type PracticeAttempt = typeof practiceAttemptsTable.$inferSelect;
export type InsertPracticeAttempt = typeof practiceAttemptsTable.$inferInsert;
