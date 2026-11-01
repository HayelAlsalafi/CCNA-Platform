import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  unique,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const achievementDefinitionsTable = pgTable(
  "achievement_definitions",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull(),
    ruleKey: varchar("rule_key", { length: 80 }).notNull(),
    ruleVersion: integer("rule_version").notNull().default(1),
    criteria: jsonb("criteria").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "achievement_definitions_identity_ck",
      sql`${t.id} ~ '^[a-z][a-z0-9-]*[.]v[1-9][0-9]*$' AND btrim(${t.name})<>'' AND btrim(${t.description})<>'' AND ${t.ruleVersion}>0`,
    ),
    check("achievement_definitions_criteria_ck", sql`jsonb_typeof(${t.criteria})='object'`),
  ],
);
export const learnerAchievementsTable = pgTable(
  "learner_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    achievementId: varchar("achievement_id", { length: 80 }).notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    evidence: jsonb("evidence").notNull(),
  },
  (t) => [
    foreignKey({
      name: "learner_achievements_definition_fk",
      columns: [t.achievementId],
      foreignColumns: [achievementDefinitionsTable.id],
    }).onDelete("restrict"),
    unique("learner_achievements_user_badge_uq").on(t.userId, t.achievementId),
    index("learner_achievements_user_date_idx").on(t.userId, t.awardedAt.desc()),
    check("learner_achievements_evidence_ck", sql`jsonb_typeof(${t.evidence})='object'`),
  ],
);
