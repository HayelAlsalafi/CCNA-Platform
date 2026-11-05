import { sql } from "drizzle-orm";
import { pgTable,uuid,text,integer,timestamp,jsonb,unique,check,index,pgPolicy } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { courseVersionsTable } from "./course-catalog";

/** Enrollment is learning intent, never payment, access, role or certification. */
export const courseEnrollmentsTable=pgTable("course_enrollments",{
  id:uuid("id").primaryKey().defaultRandom(),
  userId:uuid("user_id").notNull().references(()=>usersTable.id,{onDelete:"restrict"}),
  courseVersionId:uuid("course_version_id").notNull().references(()=>courseVersionsTable.id,{onDelete:"restrict"}),
  status:text("status").notNull().default("ACTIVE"),
  version:integer("version").notNull().default(1),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("course_enrollments_owner_version_uq").on(t.userId,t.courseVersionId),
  index("course_enrollments_owner_idx").on(t.userId,t.id),
  check("course_enrollments_state_ck",sql`${t.status} IN ('ACTIVE','PAUSED','WITHDRAWN') AND ${t.version}>0`),
  pgPolicy("course_enrollments_owner_read",{for:"select",to:"ccna_phase6a_app",using:sql`${t.userId}=nullif(current_setting('app.study_user',true),'')::uuid`})]).enableRLS();
export const courseEnrollmentEventsTable=pgTable("course_enrollment_events",{
  id:uuid("id").primaryKey().defaultRandom(),
  enrollmentId:uuid("enrollment_id").notNull().references(()=>courseEnrollmentsTable.id,{onDelete:"restrict"}),
  userId:uuid("user_id").notNull().references(()=>usersTable.id,{onDelete:"restrict"}),
  requestId:uuid("request_id").notNull(),
  requestHash:text("request_hash").notNull(),
  beforeStatus:text("before_status"),afterStatus:text("after_status").notNull(),
  result:jsonb("result").notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("course_enrollment_events_request_uq").on(t.userId,t.requestId),
  check("course_enrollment_events_shape_ck",sql`${t.requestHash} ~ '^[a-f0-9]{64}$' AND (${t.beforeStatus} IS NULL OR ${t.beforeStatus} IN ('ACTIVE','PAUSED','WITHDRAWN')) AND ${t.afterStatus} IN ('ACTIVE','PAUSED','WITHDRAWN') AND jsonb_typeof(${t.result})='object'`)]);

/** Empty on installation. An approved operator must establish the exact scope
 * epoch; past rows are not silently reattributed through today's catalog join.
 */
export const courseAttributionEpochsTable=pgTable("course_attribution_epochs",{
  courseVersionId:uuid("course_version_id").primaryKey().references(()=>courseVersionsTable.id,{onDelete:"restrict"}),
  validFrom:timestamp("valid_from",{withTimezone:true}).notNull().defaultNow(),
  bindingHash:text("binding_hash").notNull(),
  approvalRef:text("approval_ref").notNull(),
},t=>[check("course_attribution_epoch_shape_ck",sql`${t.bindingHash} ~ '^[a-f0-9]{64}$' AND length(trim(${t.approvalRef})) BETWEEN 5 AND 200`)]);
