import {sql} from "drizzle-orm";
import {pgTable,uuid,varchar,timestamp,boolean,jsonb,check,index} from "drizzle-orm/pg-core";
/** Operator-restricted immutable recovery/audit record; never a learner DTO. */
export const questionDeletionAuditsTable=pgTable("question_deletion_audits",{
 id:uuid("id").defaultRandom().primaryKey(),questionId:uuid("question_id").notNull(),questionCode:varchar("question_code",{length:32}).notNull(),adminActor:uuid("admin_actor").notNull(),deletedAt:timestamp("deleted_at",{withTimezone:true}).default(sql`clock_timestamp()`).notNull(),historyAuthorized:boolean("history_authorized").notNull(),recoveryPayload:jsonb("recovery_payload").notNull(),payloadHash:varchar("payload_hash",{length:64}).notNull(),
},t=>[index("question_deletion_audits_question_idx").on(t.questionId,t.deletedAt),check("question_deletion_audits_payload_ck",sql`jsonb_typeof(${t.recoveryPayload})='object' AND ${t.payloadHash}=encode(sha256(convert_to(${t.recoveryPayload}::text,'UTF8')),'hex')`)]);
