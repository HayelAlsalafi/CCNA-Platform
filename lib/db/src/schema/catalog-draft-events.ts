import {sql} from 'drizzle-orm';
import {pgTable,uuid,text,jsonb,timestamp,unique,check} from 'drizzle-orm/pg-core';
import {usersTable} from './users';
/** Immutable operation receipts, not a new content or permission registry. */
export const catalogDraftEventsTable=pgTable('catalog_draft_events',{
  id:uuid('id').primaryKey().defaultRandom(),
  actorId:uuid('actor_id').notNull().references(()=>usersTable.id,{onDelete:'restrict'}),
  requestId:uuid('request_id').notNull(),requestHash:text('request_hash').notNull(),
  kind:text('kind').notNull(),targetId:uuid('target_id').notNull(),reason:text('reason').notNull(),
  beforeState:jsonb('before_state'),result:jsonb('result').notNull(),
  occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[unique('catalog_draft_events_request_uq').on(t.actorId,t.requestId),
  check('catalog_draft_events_shape_ck',sql`${t.kind} IN ('tracks','courses','versions') AND ${t.requestHash} ~ '^[a-f0-9]{64}$' AND length(trim(${t.reason})) BETWEEN 5 AND 500 AND (${t.beforeState} IS NULL OR jsonb_typeof(${t.beforeState})='object') AND jsonb_typeof(${t.result})='object'`)]);
