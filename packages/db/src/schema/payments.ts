import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  jsonb,
} from 'drizzle-orm/pg-core';
import { paymentMethodEnum, paymentStatusEnum, paymentTypeEnum } from './enums.js';
import { users } from './users.js';
import { trips } from './trips.js';

// ─── payments ─────────────────────────────────────────────────────────────────
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  trip_id: uuid('trip_id').references(() => trips.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  amount_xaf: numeric('amount_xaf', { precision: 14, scale: 2 }).notNull(),
  payment_method: paymentMethodEnum('payment_method').notNull(),
  payment_type: paymentTypeEnum('payment_type').notNull(),
  status: paymentStatusEnum('status').notNull().default('initiated'),
  // Stored in PostgreSQL BEFORE every pawaPay API call — mandatory
  idempotency_key: varchar('idempotency_key', { length: 100 }).notNull().unique(),
  // pawaPay reference IDs
  pawapay_deposit_id: varchar('pawapay_deposit_id', { length: 100 }),
  pawapay_payout_id: varchar('pawapay_payout_id', { length: 100 }),
  // MSISDN used for this transaction (Airtel/Moov number)
  msisdn: varchar('msisdn', { length: 20 }),
  // Raw pawaPay webhook payload for audit
  webhook_payload: jsonb('webhook_payload'),
  failure_reason: text('failure_reason'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
