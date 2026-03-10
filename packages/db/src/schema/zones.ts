import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';
import { polygon, point } from './types.js';

// ─── zones ────────────────────────────────────────────────────────────────────
// Administrative zones of Libreville used for surge pricing.
// Zone assignment via ST_Contains(zone.boundary, trip.origin).
export const zones = pgTable('zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  // PostGIS Polygon — used in ST_Contains queries
  boundary: polygon('boundary').notNull(),
  // Surge multiplier: 1.0 = normal, 1.5 = 50% surge
  surge_multiplier: numeric('surge_multiplier', { precision: 4, scale: 2 })
    .notNull()
    .default('1.00'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── landmarks ────────────────────────────────────────────────────────────────
// Libreville landmark database for geocoding disambiguation.
// e.g. "Aéroport", "Palais du Président", "Marché Mont-Bouët"
export const landmarks = pgTable('landmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  name_aliases: text('name_aliases'), // comma-separated alternate names
  zone_id: uuid('zone_id').references(() => zones.id),
  location: point('location').notNull(),
  category: varchar('category', { length: 50 }), // 'airport', 'hospital', 'market', etc.
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
