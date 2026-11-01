// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./topics";
export * from "./curriculum-chapters";
export * from "./users";
export * from "./questions";
export * from "./practice-attempts";

export * from "./question-revisions";
export * from "./exam-blueprints";
export * from "./exam-taxonomy-validation";
export * from "./ccna-200-301-v1-1";
export * from './nexus-sessions';
export * from './learning-achievements';

export * from "./question-deletion-audits";
export * from "./exam-sessions";
export * from "./lessons";
export * from "./lesson-study";
