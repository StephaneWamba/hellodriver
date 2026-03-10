import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  numeric,
  integer,
} from 'drizzle-orm/pg-core';
import { tripStatusEnum, vehicleCategoryEnum, tripTypeEnum, paymentMethodEnum } from './enums.js';
import { users } from './users.js';
import { point } from './types.js';

// ─── zones ────────────────────────────────────────────────────────────────────
// Defined here because trips reference zones via zone_id
import { zones } from './zones.js';

// ─── promo_codes ──────────────────────────────────────────────────────────────
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  discount_xaf: integer('discount_xaf').default(0),
  discount_pct: numeric('discount_pct', { precision: 5, scale: 2 }).default('0'),
  max_uses: integer('max_uses'), // null = unlimited
  uses_count: integer('uses_count').notNull().default(0),
  valid_from: timestamp('valid_from', { withTimezone: true }).notNull(),
  valid_to: timestamp('valid_to', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── trips ────────────────────────────────────────────────────────────────────
export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  client_id: uuid('client_id')
    .notNull()
    .references(() => users.id),
  driver_id: uuid('driver_id').references(() => users.id),
  status: tripStatusEnum('status').notNull().default('pending'),
  // PostGIS Points — use sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` on insert
  origin: point('origin').notNull(),
  destination: point('destination').notNull(),
  origin_label: varchar('origin_label', { length: 200 }).notNull(),
  destination_label: varchar('destination_label', { length: 200 }).notNull(),
  vehicle_category: vehicleCategoryEnum('vehicle_category').notNull(),
  trip_type: tripTypeEnum('trip_type').notNull().default('immediate'),
  payment_method: paymentMethodEnum('payment_method').notNull().default('airtel_money'),
  distance_m: integer('distance_m'), // calculated on booking
  duration_s: integer('duration_s'),
  fare_xaf: integer('fare_xaf'), // gross fare including surge
  commission_xaf: integer('commission_xaf'),
  driver_amount_xaf: integer('driver_amount_xaf'),
  zone_id: uuid('zone_id').references(() => zones.id),
  promo_code_id: uuid('promo_code_id').references(() => promoCodes.id),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
  cancellation_reason: text('cancellation_reason'),
  cancellation_fee_xaf: integer('cancellation_fee_xaf').default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── trip_location_pings ──────────────────────────────────────────────────────
// PARTITIONED by month (LIST on year-month). Add new partition every month.
// Append-only. Written ONLY during active trips.
// In schema.sql this is created as a partitioned table — Drizzle sees it as regular.
export const tripLocationPings = pgTable('trip_location_pings', {
  id: uuid('id').primaryKey().defaultRandom(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => users.id),
  location: point('location').notNull(),
  captured_at: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── trip_ratings ─────────────────────────────────────────────────────────────
export const tripRatings = pgTable('trip_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  rated_by: uuid('rated_by')
    .notNull()
    .references(() => users.id),
  rating: integer('rating').notNull(), // 1–5
  comment: text('comment'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── cancellation_policies ────────────────────────────────────────────────────
export const cancellationPolicies = pgTable('cancellation_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicle_category: vehicleCategoryEnum('vehicle_category').notNull(),
  // How many minutes before pickup cancellation becomes chargeable
  minutes_grace: integer('minutes_grace').notNull().default(5),
  fee_xaf: integer('fee_xaf').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── promo_usages ─────────────────────────────────────────────────────────────
export const promoUsages = pgTable('promo_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  promo_code_id: uuid('promo_code_id')
    .notNull()
    .references(() => promoCodes.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
