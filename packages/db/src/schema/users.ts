import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums.js';

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  full_name: varchar('full_name', { length: 100 }),
  role: userRoleEnum('role').notNull().default('client'),
  avatar_url: text('avatar_url'),
  // Supabase Auth UID — links our users table to auth.users
  auth_id: uuid('auth_id').unique(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── wallets ──────────────────────────────────────────────────────────────────
// One wallet per user. Balance MUST only be updated via post_wallet_transaction().
export const wallets = pgTable('wallets', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  // XAF has no decimal places in practice — stored as NUMERIC for precision
  balance_xaf: numeric('balance_xaf', { precision: 14, scale: 2 }).notNull().default('0'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── wallet_transactions ──────────────────────────────────────────────────────
// Immutable ledger. Rows are NEVER updated or deleted.
export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  wallet_id: uuid('wallet_id')
    .notNull()
    .references(() => wallets.user_id, { onDelete: 'restrict' }),
  amount_xaf: numeric('amount_xaf', { precision: 14, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'credit' | 'debit'
  reference_id: uuid('reference_id'), // payment.id or trip.id
  reference_type: text('reference_type'), // 'payment' | 'trip_refund' | 'promo'
  balance_after_xaf: numeric('balance_after_xaf', { precision: 14, scale: 2 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  data: jsonb('data'),
  read_at: timestamp('read_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── push_tokens ──────────────────────────────────────────────────────────────
export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: text('platform').notNull(), // 'ios' | 'android'
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── otp_logs ─────────────────────────────────────────────────────────────────
export const otpLogs = pgTable('otp_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 20 }).notNull(),
  otp_hash: text('otp_hash').notNull(), // bcrypt hash — never store plaintext
  channel: text('channel').notNull(), // 'whatsapp' | 'sms'
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── whatsapp_users ───────────────────────────────────────────────────────────
export const whatsappUsers = pgTable('whatsapp_users', {
  phone: varchar('phone', { length: 20 }).primaryKey(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── referrals ────────────────────────────────────────────────────────────────
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrer_id: uuid('referrer_id')
    .notNull()
    .references(() => users.id),
  referred_id: uuid('referred_id')
    .notNull()
    .unique()
    .references(() => users.id),
  reward_xaf: integer('reward_xaf').notNull().default(0),
  rewarded_at: timestamp('rewarded_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
