import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { trips } from './trips.js';

// ─── disputes ─────────────────────────────────────────────────────────────────
export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  raised_by: uuid('raised_by')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'investigating' | 'resolved' | 'closed'
  resolved_by: uuid('resolved_by').references(() => users.id),
  resolution_note: text('resolution_note'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── admin_actions ────────────────────────────────────────────────────────────
export const adminActions = pgTable('admin_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  admin_id: uuid('admin_id')
    .notNull()
    .references(() => users.id),
  action_type: varchar('action_type', { length: 50 }).notNull(),
  target_type: varchar('target_type', { length: 50 }).notNull(), // 'user' | 'trip' | 'payment' etc.
  target_id: uuid('target_id').notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── audit_logs ───────────────────────────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  table_name: varchar('table_name', { length: 60 }).notNull(),
  record_id: uuid('record_id').notNull(),
  action: text('action').notNull(), // 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: jsonb('old_data'),
  new_data: jsonb('new_data'),
  performed_by: uuid('performed_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── feature_flags ────────────────────────────────────────────────────────────
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull().default('false'),
  description: text('description'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── platform_settings ────────────────────────────────────────────────────────
export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updated_by: uuid('updated_by').references(() => users.id),
});
