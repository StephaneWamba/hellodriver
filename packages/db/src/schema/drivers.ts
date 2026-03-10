import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  integer,
  smallint,
  date,
  time,
} from 'drizzle-orm/pg-core';
import { vehicleCategoryEnum, documentTypeEnum, documentStatusEnum, verificationStatusEnum } from './enums.js';
import { users } from './users.js';
import { point } from './types.js';

// ─── driver_profiles ──────────────────────────────────────────────────────────
export const driverProfiles = pgTable('driver_profiles', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  verification_status: verificationStatusEnum('verification_status')
    .notNull()
    .default('unverified'),
  vehicle_category: vehicleCategoryEnum('vehicle_category').notNull().default('standard'),
  rating_avg: numeric('rating_avg', { precision: 3, scale: 2 }).default('0'),
  rating_count: integer('rating_count').notNull().default(0),
  total_trips: integer('total_trips').notNull().default(0),
  cancellation_rate: numeric('cancellation_rate', { precision: 5, scale: 2 }).default('0'),
  bio: text('bio'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── vehicles ─────────────────────────────────────────────────────────────────
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  make: varchar('make', { length: 50 }).notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  year: smallint('year').notNull(),
  plate: varchar('plate', { length: 20 }).notNull().unique(),
  color: varchar('color', { length: 30 }).notNull(),
  category: vehicleCategoryEnum('category').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── driver_documents ─────────────────────────────────────────────────────────
export const driverDocuments = pgTable('driver_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  document_type: documentTypeEnum('document_type').notNull(),
  status: documentStatusEnum('status').notNull().default('pending'),
  // Supabase Storage path
  storage_url: text('storage_url').notNull(),
  expiry_date: timestamp('expiry_date', { withTimezone: true }),
  reviewed_by: uuid('reviewed_by').references(() => users.id),
  review_note: text('review_note'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── driver_locations ─────────────────────────────────────────────────────────
// One row per driver. Updated every ~10s from Redis.
// Real-time position is in Redis GEOADD — this is the durable fallback.
export const driverLocations = pgTable('driver_locations', {
  driver_id: uuid('driver_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // PostGIS Point — use sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` on insert
  location: point('location').notNull(),
  is_available: boolean('is_available').notNull().default(false),
  is_online: boolean('is_online').notNull().default(false),
  heading: numeric('heading', { precision: 5, scale: 2 }),
  speed_kmh: numeric('speed_kmh', { precision: 5, scale: 2 }),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── driver_schedules ─────────────────────────────────────────────────────────
export const driverSchedules = pgTable('driver_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 0=Sunday ... 6=Saturday (ISO: 1=Monday)
  day_of_week: smallint('day_of_week').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  is_active: boolean('is_active').notNull().default(true),
});

// ─── driver_earnings_daily ────────────────────────────────────────────────────
// Auto-populated by trigger when trip transitions to 'paid'
export const driverEarningsDaily = pgTable('driver_earnings_daily', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  gross_xaf: integer('gross_xaf').notNull().default(0),
  commission_xaf: integer('commission_xaf').notNull().default(0),
  net_xaf: integer('net_xaf').notNull().default(0),
  trip_count: integer('trip_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
