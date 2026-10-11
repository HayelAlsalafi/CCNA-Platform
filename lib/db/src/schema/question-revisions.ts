import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { questionsTable } from "./questions";
import { usersTable } from "./users";

export type QuestionSnapshot = {
  questionCode: string;
  topic: { id: string; slug: string; name: string };
  text: string;
  type: "MULTIPLE_CHOICE_SINGLE";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  explanation: string;
  imageKey: string | null;
  referenceNotes: string | null;
  options: { optionKey: string; text: string; isCorrect: boolean }[];
};

/** Immutable observed content. No inferred snapshot is attached to legacy attempts. */
export const questionRevisionsTable = pgTable("question_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id").notNull().references(() => questionsTable.id, { onDelete: "restrict" }),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  snapshot: jsonb("snapshot").$type<QuestionSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique("question_revisions_content_uq").on(t.questionId, t.contentHash),
  unique("question_revisions_binding_uq").on(t.id, t.questionId),
  check("question_revisions_hash_ck", sql`${t.contentHash} = encode(sha256(convert_to(${t.snapshot}::text, 'UTF8')), 'hex')`),
]);

/** One unguessable, user/session-bound delivery; one successful attempt per delivery. */
export const practiceDeliveriesTable = pgTable("practice_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  sessionId: varchar("session_id", { length: 255 }),
  questionId: uuid("question_id").notNull(),
  revisionId: uuid("revision_id").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
}, t => [
  foreignKey({ name: "practice_deliveries_revision_fk", columns: [t.revisionId, t.questionId], foreignColumns: [questionRevisionsTable.id, questionRevisionsTable.questionId] }).onDelete("restrict"),
  unique("practice_deliveries_binding_uq").on(t.id, t.userId, t.questionId, t.revisionId),
  index("practice_deliveries_user_idx").on(t.userId, t.deliveredAt),
  index("practice_deliveries_revision_idx").on(t.revisionId, t.questionId),
  check("practice_deliveries_expiry_ck", sql`${t.expiresAt} > ${t.deliveredAt} AND ${t.expiresAt} <= ${t.deliveredAt} + interval '24 hours'`),
]);
