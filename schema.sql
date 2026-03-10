-- =============================================================================
-- Hello Driver — PostgreSQL 16 + PostGIS schema
-- Applied directly to Supabase (always-on compute, eu-west-2 region).
-- Run once with: psql $DATABASE_URL -f schema.sql
-- =============================================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- =============================================================================
-- ENUM TYPES (9)
-- =============================================================================

CREATE TYPE user_role AS ENUM ('client', 'driver', 'admin', 'superadmin');

CREATE TYPE trip_status AS ENUM (
  'pending',
  'matching',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled_by_client',
  'cancelled_by_driver',
  'cancelled_by_admin',
  'payment_pending',
  'paid',
  'disputed'
);

CREATE TYPE vehicle_category AS ENUM ('moto', 'standard', 'comfort', 'minivan');

CREATE TYPE payment_method AS ENUM ('airtel_money', 'moov_money', 'hello_monnaie', 'cash');

CREATE TYPE payment_status AS ENUM (
  'initiated',
  'pending_user_approval',
  'processing',
  'confirmed',
  'failed',
  'refunded'
);

CREATE TYPE payment_type AS ENUM ('deposit', 'payout', 'refund');

CREATE TYPE document_type AS ENUM (
  'national_id',
  'drivers_license',
  'vehicle_registration',
  'insurance',
  'vehicle_photo',
  'profile_photo'
);

CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TYPE verification_status AS ENUM (
  'unverified',
  'pending_review',
  'verified',
  'suspended'
);

-- =============================================================================
-- TABLES (28)
-- =============================================================================

-- ─── zones ────────────────────────────────────────────────────────────────────
-- Must be created before trips (FK dependency)
CREATE TABLE zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  boundary       GEOMETRY(Polygon, 4326) NOT NULL,
  surge_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00
                   CHECK (surge_multiplier >= 1.00 AND surge_multiplier <= 5.00),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── landmarks ────────────────────────────────────────────────────────────────
CREATE TABLE landmarks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  name_aliases  TEXT,
  zone_id       UUID REFERENCES zones(id) ON DELETE SET NULL,
  location      GEOMETRY(Point, 4326) NOT NULL,
  category      VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) NOT NULL UNIQUE,
  email       VARCHAR(255) UNIQUE,
  full_name   VARCHAR(100),
  role        user_role NOT NULL DEFAULT 'client',
  avatar_url  TEXT,
  -- Links to Supabase auth.users
  auth_id     UUID UNIQUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── wallets ──────────────────────────────────────────────────────────────────
-- NEVER update balance_xaf directly — always call post_wallet_transaction()
CREATE TABLE wallets (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  balance_xaf NUMERIC(14,2) NOT NULL DEFAULT 0
                CHECK (balance_xaf >= 0), -- overdraft trigger also enforces this
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── wallet_transactions ──────────────────────────────────────────────────────
-- Immutable ledger — rows are NEVER updated or deleted
CREATE TABLE wallet_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES wallets(user_id) ON DELETE RESTRICT,
  amount_xaf       NUMERIC(14,2) NOT NULL CHECK (amount_xaf > 0),
  type             TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  reference_id     UUID,
  reference_type   TEXT, -- 'payment' | 'trip_refund' | 'promo'
  balance_after_xaf NUMERIC(14,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── driver_profiles ──────────────────────────────────────────────────────────
CREATE TABLE driver_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  verification_status  verification_status NOT NULL DEFAULT 'unverified',
  vehicle_category     vehicle_category NOT NULL DEFAULT 'standard',
  rating_avg           NUMERIC(3,2) DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count         INTEGER NOT NULL DEFAULT 0,
  total_trips          INTEGER NOT NULL DEFAULT 0,
  cancellation_rate    NUMERIC(5,2) DEFAULT 0,
  bio                  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── vehicles ─────────────────────────────────────────────────────────────────
CREATE TABLE vehicles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make      VARCHAR(50) NOT NULL,
  model     VARCHAR(50) NOT NULL,
  year      SMALLINT NOT NULL CHECK (year >= 2000),
  plate     VARCHAR(20) NOT NULL UNIQUE,
  color     VARCHAR(30) NOT NULL,
  category  vehicle_category NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── driver_documents ─────────────────────────────────────────────────────────
CREATE TABLE driver_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  status        document_status NOT NULL DEFAULT 'pending',
  storage_url   TEXT NOT NULL,
  expiry_date   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES users(id),
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── driver_locations ─────────────────────────────────────────────────────────
-- One row per driver. Updated ~every 10s from Redis (durable fallback).
-- Real-time: Redis GEOADD.
CREATE TABLE driver_locations (
  driver_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location     GEOMETRY(Point, 4326) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  is_online    BOOLEAN NOT NULL DEFAULT FALSE,
  heading      NUMERIC(5,2),
  speed_kmh    NUMERIC(5,2),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── driver_schedules ─────────────────────────────────────────────────────────
CREATE TABLE driver_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── driver_earnings_daily ────────────────────────────────────────────────────
-- Auto-updated by trigger when trip transitions to 'paid'
CREATE TABLE driver_earnings_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  gross_xaf       INTEGER NOT NULL DEFAULT 0,
  commission_xaf  INTEGER NOT NULL DEFAULT 0,
  net_xaf         INTEGER NOT NULL DEFAULT 0,
  trip_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, date)
);

-- ─── promo_codes ──────────────────────────────────────────────────────────────
CREATE TABLE promo_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(20) NOT NULL UNIQUE,
  discount_xaf INTEGER DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  max_uses     INTEGER, -- NULL = unlimited
  uses_count   INTEGER NOT NULL DEFAULT 0,
  valid_from   TIMESTAMPTZ NOT NULL,
  valid_to     TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── trips ────────────────────────────────────────────────────────────────────
CREATE TABLE trips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES users(id),
  driver_id           UUID REFERENCES users(id),
  status              trip_status NOT NULL DEFAULT 'pending',
  origin              GEOMETRY(Point, 4326) NOT NULL,
  destination         GEOMETRY(Point, 4326) NOT NULL,
  origin_label        VARCHAR(200) NOT NULL,
  destination_label   VARCHAR(200) NOT NULL,
  vehicle_category    vehicle_category NOT NULL,
  distance_m          INTEGER,
  duration_s          INTEGER,
  fare_xaf            INTEGER,
  commission_xaf      INTEGER,
  driver_amount_xaf   INTEGER,
  zone_id             UUID REFERENCES zones(id),
  promo_code_id       UUID REFERENCES promo_codes(id),
  scheduled_at        TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── trip_location_pings ──────────────────────────────────────────────────────
-- Partitioned by month (RANGE on captured_at). Append-only. Active trips only.
-- Add new partition monthly: see maintenance notes below.
CREATE TABLE trip_location_pings (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id),
  driver_id   UUID NOT NULL REFERENCES users(id),
  location    GEOMETRY(Point, 4326) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (captured_at);

-- Initial partitions (add monthly via cron or migration)
CREATE TABLE trip_location_pings_2026_03
  PARTITION OF trip_location_pings
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE trip_location_pings_2026_04
  PARTITION OF trip_location_pings
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE trip_location_pings_2026_05
  PARTITION OF trip_location_pings
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- ─── trip_ratings ─────────────────────────────────────────────────────────────
CREATE TABLE trip_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id),
  rated_by    UUID NOT NULL REFERENCES users(id),
  rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, rated_by)
);

-- ─── cancellation_policies ────────────────────────────────────────────────────
CREATE TABLE cancellation_policies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category vehicle_category NOT NULL UNIQUE,
  minutes_grace    INTEGER NOT NULL DEFAULT 5,
  fee_xaf          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default policies
INSERT INTO cancellation_policies (vehicle_category, minutes_grace, fee_xaf) VALUES
  ('moto',    3,  500),
  ('standard', 5, 1000),
  ('comfort',  5, 2000),
  ('minivan',  5, 2000);

-- ─── promo_usages ─────────────────────────────────────────────────────────────
CREATE TABLE promo_usages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  trip_id       UUID NOT NULL REFERENCES trips(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_code_id, user_id) -- one use per user per code
);

-- ─── payments ─────────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID REFERENCES trips(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  amount_xaf       NUMERIC(14,2) NOT NULL CHECK (amount_xaf > 0),
  payment_method   payment_method NOT NULL,
  payment_type     payment_type NOT NULL,
  status           payment_status NOT NULL DEFAULT 'initiated',
  -- Stored in PostgreSQL BEFORE every pawaPay API call
  idempotency_key  VARCHAR(100) NOT NULL UNIQUE,
  pawapay_deposit_id  VARCHAR(100),
  pawapay_payout_id   VARCHAR(100),
  msisdn           VARCHAR(20),
  webhook_payload  JSONB,
  failure_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── notifications ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── push_tokens ──────────────────────────────────────────────────────────────
CREATE TABLE push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

-- ─── otp_logs ─────────────────────────────────────────────────────────────────
CREATE TABLE otp_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        VARCHAR(20) NOT NULL,
  otp_hash     TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  delivered_at TIMESTAMPTZ,
  verified_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── whatsapp_users ───────────────────────────────────────────────────────────
CREATE TABLE whatsapp_users (
  phone      VARCHAR(20) PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── referrals ────────────────────────────────────────────────────────────────
CREATE TABLE referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  referred_id UUID NOT NULL UNIQUE REFERENCES users(id),
  reward_xaf  INTEGER NOT NULL DEFAULT 0,
  rewarded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── disputes ─────────────────────────────────────────────────────────────────
CREATE TABLE disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES trips(id),
  raised_by       UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  resolved_by     UUID REFERENCES users(id),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── admin_actions ────────────────────────────────────────────────────────────
CREATE TABLE admin_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id   UUID NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── audit_logs ───────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   VARCHAR(60) NOT NULL,
  record_id    UUID NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data     JSONB,
  new_data     JSONB,
  performed_by UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── feature_flags ────────────────────────────────────────────────────────────
CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) NOT NULL UNIQUE,
  value       JSONB NOT NULL DEFAULT 'false',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── platform_settings ────────────────────────────────────────────────────────
CREATE TABLE platform_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Default platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('commission_pct',       '15'),
  ('max_search_radius_m',  '5000'),
  ('driver_offer_timeout_s', '30'),
  ('bid_window_s',         '60'),
  ('timezone',             '"Africa/Libreville"');

-- =============================================================================
-- INDEXES (~40, 9 GIST)
-- =============================================================================

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- ── Driver documents ──────────────────────────────────────────────────────────
CREATE INDEX idx_driver_docs_driver ON driver_documents(driver_id);
CREATE INDEX idx_driver_docs_status ON driver_documents(status);
CREATE INDEX idx_driver_docs_expiry ON driver_documents(expiry_date)
  WHERE expiry_date IS NOT NULL AND status = 'approved';

-- ── Driver locations (core matching index) ────────────────────────────────────
-- Partial GIST index: only available+online drivers. MUST be hit by matching query.
CREATE INDEX idx_driver_locations_available_geom
  ON driver_locations USING GIST(location)
  WHERE is_available = TRUE AND is_online = TRUE;

-- Full GIST index for general PostGIS queries
CREATE INDEX idx_driver_locations_geom ON driver_locations USING GIST(location);
CREATE INDEX idx_driver_locations_online ON driver_locations(is_online, is_available);

-- ── Driver profiles ───────────────────────────────────────────────────────────
CREATE INDEX idx_driver_profiles_status ON driver_profiles(verification_status);
CREATE INDEX idx_driver_profiles_category ON driver_profiles(vehicle_category)
  WHERE verification_status = 'verified';

-- ── Earnings ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_earnings_driver_date ON driver_earnings_daily(driver_id, date DESC);

-- ── Trips ─────────────────────────────────────────────────────────────────────
CREATE INDEX idx_trips_client ON trips(client_id);
CREATE INDEX idx_trips_driver ON trips(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_status_created ON trips(status, created_at DESC);
CREATE INDEX idx_trips_zone ON trips(zone_id);
CREATE INDEX idx_trips_origin_geom ON trips USING GIST(origin);
CREATE INDEX idx_trips_destination_geom ON trips USING GIST(destination);
CREATE INDEX idx_trips_scheduled ON trips(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status IN ('pending', 'matching');

-- ── Trip location pings ───────────────────────────────────────────────────────
CREATE INDEX idx_trip_pings_trip ON trip_location_pings(trip_id, captured_at DESC);
CREATE INDEX idx_trip_pings_geom ON trip_location_pings USING GIST(location);

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX idx_payments_idempotency ON payments(idempotency_key);
CREATE INDEX idx_payments_trip ON payments(trip_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_pawapay_deposit ON payments(pawapay_deposit_id)
  WHERE pawapay_deposit_id IS NOT NULL;

-- ── Wallet transactions ───────────────────────────────────────────────────────
CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id, created_at DESC);

-- ── Promo codes ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_valid ON promo_codes(valid_to) WHERE uses_count < COALESCE(max_uses, 2147483647);

-- ── Zones ─────────────────────────────────────────────────────────────────────
CREATE INDEX idx_zones_boundary ON zones USING GIST(boundary);

-- ── Landmarks ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_landmarks_geom ON landmarks USING GIST(location);
CREATE INDEX idx_landmarks_zone ON landmarks(zone_id);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id)
  WHERE read_at IS NULL;

-- ── OTP logs ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_otp_logs_phone ON otp_logs(phone, created_at DESC);

-- =============================================================================
-- FUNCTIONS (5)
-- =============================================================================

-- ── 1. post_wallet_transaction ────────────────────────────────────────────────
-- ALWAYS call this inside an explicit BEGIN/COMMIT block.
-- The overdraft guard trigger fires BEFORE the UPDATE.
CREATE OR REPLACE FUNCTION post_wallet_transaction(
  p_user_id       UUID,
  p_amount_xaf    NUMERIC(14,2),
  p_type          TEXT,  -- 'credit' | 'debit'
  p_reference_id  UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
)
RETURNS wallet_transactions
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance NUMERIC(14,2);
  v_transaction wallet_transactions;
BEGIN
  IF p_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_xaf <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount_xaf USING ERRCODE = 'P0001';
  END IF;

  IF p_type = 'credit' THEN
    UPDATE wallets
      SET balance_xaf = balance_xaf + p_amount_xaf,
          updated_at  = NOW()
      WHERE user_id = p_user_id
      RETURNING balance_xaf INTO v_new_balance;
  ELSE
    UPDATE wallets
      SET balance_xaf = balance_xaf - p_amount_xaf,
          updated_at  = NOW()
      WHERE user_id = p_user_id
      RETURNING balance_xaf INTO v_new_balance;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO wallet_transactions (
    wallet_id, amount_xaf, type, reference_id, reference_type, balance_after_xaf
  )
  VALUES (p_user_id, p_amount_xaf, p_type, p_reference_id, p_reference_type, v_new_balance)
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

-- ── 2. assign_zone ────────────────────────────────────────────────────────────
-- Returns zone_id for a given point, or NULL if outside all zones.
CREATE OR REPLACE FUNCTION assign_zone(p_point GEOMETRY)
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT id FROM zones
  WHERE ST_Contains(boundary, p_point)
  ORDER BY surge_multiplier DESC  -- prefer smaller/higher-surge zone on overlap
  LIMIT 1;
$$;

-- ── 3. calculate_fare ─────────────────────────────────────────────────────────
-- Returns fare breakdown in XAF (integer cents not needed — XAF has no decimals).
CREATE OR REPLACE FUNCTION calculate_fare(
  p_distance_m      INTEGER,
  p_category        vehicle_category,
  p_zone_id         UUID DEFAULT NULL,
  p_promo_code_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  fare_xaf         INTEGER,
  commission_xaf   INTEGER,
  driver_amount_xaf INTEGER,
  surge_multiplier  NUMERIC(4,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_rate_per_km  NUMERIC;
  v_base_fare         INTEGER;
  v_surge             NUMERIC(4,2) := 1.00;
  v_commission_pct    NUMERIC;
  v_discount_xaf      INTEGER := 0;
  v_gross             INTEGER;
  v_commission        INTEGER;
  v_driver            INTEGER;
BEGIN
  -- Base rates per km by category (XAF)
  v_base_rate_per_km := CASE p_category
    WHEN 'moto'     THEN 200
    WHEN 'standard' THEN 350
    WHEN 'comfort'  THEN 500
    WHEN 'minivan'  THEN 600
    ELSE 350
  END;

  -- Minimum fare
  v_base_fare := GREATEST(
    ROUND((p_distance_m / 1000.0) * v_base_rate_per_km)::INTEGER,
    CASE p_category
      WHEN 'moto'     THEN  500
      WHEN 'standard' THEN 1000
      WHEN 'comfort'  THEN 2000
      WHEN 'minivan'  THEN 2500
      ELSE 1000
    END
  );

  -- Surge multiplier from zone
  IF p_zone_id IS NOT NULL THEN
    SELECT z.surge_multiplier INTO v_surge
    FROM zones z WHERE z.id = p_zone_id;
  END IF;

  -- Apply surge
  v_gross := ROUND(v_base_fare * v_surge)::INTEGER;

  -- Apply promo discount
  IF p_promo_code_id IS NOT NULL THEN
    SELECT
      COALESCE(pc.discount_xaf, 0) +
      COALESCE(ROUND(v_gross * pc.discount_pct / 100)::INTEGER, 0)
    INTO v_discount_xaf
    FROM promo_codes pc
    WHERE pc.id = p_promo_code_id
      AND pc.valid_from <= NOW()
      AND pc.valid_to >= NOW()
      AND (pc.max_uses IS NULL OR pc.uses_count < pc.max_uses);

    v_gross := GREATEST(0, v_gross - v_discount_xaf);
  END IF;

  -- Commission from platform_settings
  SELECT (value::TEXT)::NUMERIC INTO v_commission_pct
  FROM platform_settings WHERE key = 'commission_pct';

  v_commission_pct := COALESCE(v_commission_pct, 15);
  v_commission := ROUND(v_gross * v_commission_pct / 100)::INTEGER;
  v_driver := v_gross - v_commission;

  RETURN QUERY SELECT v_gross, v_commission, v_driver, v_surge;
END;
$$;

-- ── 4. update_driver_earnings_daily ──────────────────────────────────────────
-- Called by trigger when trip.status transitions to 'paid'
CREATE OR REPLACE FUNCTION update_driver_earnings_daily(p_trip_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_trip trips%ROWTYPE;
BEGIN
  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;

  IF v_trip.driver_id IS NULL OR v_trip.driver_amount_xaf IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO driver_earnings_daily (driver_id, date, gross_xaf, commission_xaf, net_xaf, trip_count)
  VALUES (
    v_trip.driver_id,
    (v_trip.completed_at AT TIME ZONE 'Africa/Libreville')::DATE,
    COALESCE(v_trip.fare_xaf, 0),
    COALESCE(v_trip.commission_xaf, 0),
    COALESCE(v_trip.driver_amount_xaf, 0),
    1
  )
  ON CONFLICT (driver_id, date) DO UPDATE
    SET gross_xaf      = driver_earnings_daily.gross_xaf + EXCLUDED.gross_xaf,
        commission_xaf = driver_earnings_daily.commission_xaf + EXCLUDED.commission_xaf,
        net_xaf        = driver_earnings_daily.net_xaf + EXCLUDED.net_xaf,
        trip_count     = driver_earnings_daily.trip_count + 1,
        updated_at     = NOW();
END;
$$;

-- ── 5. expire_pending_trips ───────────────────────────────────────────────────
-- Called by BullMQ delayed job to clean up unmatched trips
CREATE OR REPLACE FUNCTION expire_pending_trips(p_timeout_seconds INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE trips
    SET status = 'cancelled_by_admin',
        cancelled_at = NOW(),
        cancellation_reason = 'No driver found — auto-expired',
        updated_at = NOW()
  WHERE status IN ('pending', 'matching')
    AND created_at < NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- TRIGGERS (7)
-- =============================================================================

-- ── 1. Generic updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables that have updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'wallets', 'driver_profiles', 'vehicles', 'driver_documents',
    'zones', 'trips', 'payments', 'disputes', 'feature_flags',
    'driver_earnings_daily', 'whatsapp_users', 'push_tokens'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ── 2. Wallet overdraft guard ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_wallet_overdraft_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance_xaf < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: would be % XAF', NEW.balance_xaf
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_overdraft_guard
  BEFORE UPDATE OF balance_xaf ON wallets
  FOR EACH ROW EXECUTE FUNCTION fn_wallet_overdraft_guard();

-- ── 3. Trip paid → update earnings ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_trip_paid_update_earnings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    PERFORM update_driver_earnings_daily(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trip_paid_update_earnings
  AFTER UPDATE OF status ON trips
  FOR EACH ROW EXECUTE FUNCTION fn_trip_paid_update_earnings();

-- ── 4. Driver rating recalculation ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_driver_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_driver_id UUID;
  v_avg NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  -- Find driver of the rated trip
  SELECT t.driver_id INTO v_driver_id
  FROM trips t WHERE t.id = NEW.trip_id;

  IF v_driver_id IS NULL THEN RETURN NEW; END IF;

  SELECT AVG(r.rating)::NUMERIC(3,2), COUNT(*)
  INTO v_avg, v_count
  FROM trip_ratings r
  JOIN trips t ON t.id = r.trip_id
  WHERE t.driver_id = v_driver_id;

  UPDATE driver_profiles
    SET rating_avg   = v_avg,
        rating_count = v_count,
        updated_at   = NOW()
  WHERE user_id = v_driver_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_driver_rating_update
  AFTER INSERT ON trip_ratings
  FOR EACH ROW EXECUTE FUNCTION fn_update_driver_rating();

-- ── 5. Promo usage count ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_increment_promo_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE promo_codes
    SET uses_count = uses_count + 1
  WHERE id = NEW.promo_code_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promo_usage_count
  AFTER INSERT ON promo_usages
  FOR EACH ROW EXECUTE FUNCTION fn_increment_promo_usage();

-- ── 6. Trip status state machine ──────────────────────────────────────────────
-- Valid transitions only. Prevents invalid state jumps.
CREATE OR REPLACE FUNCTION fn_validate_trip_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_valid_next trip_status[];
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_valid_next := CASE OLD.status
    WHEN 'pending'            THEN ARRAY['matching', 'cancelled_by_client', 'cancelled_by_admin']::trip_status[]
    WHEN 'matching'           THEN ARRAY['driver_assigned', 'cancelled_by_client', 'cancelled_by_admin']::trip_status[]
    WHEN 'driver_assigned'    THEN ARRAY['driver_en_route', 'cancelled_by_client', 'cancelled_by_driver', 'cancelled_by_admin']::trip_status[]
    WHEN 'driver_en_route'    THEN ARRAY['driver_arrived', 'cancelled_by_client', 'cancelled_by_driver', 'cancelled_by_admin']::trip_status[]
    WHEN 'driver_arrived'     THEN ARRAY['in_progress', 'cancelled_by_client', 'cancelled_by_driver', 'cancelled_by_admin']::trip_status[]
    WHEN 'in_progress'        THEN ARRAY['completed', 'cancelled_by_admin']::trip_status[]
    WHEN 'completed'          THEN ARRAY['payment_pending', 'paid', 'disputed']::trip_status[]
    WHEN 'payment_pending'    THEN ARRAY['paid', 'disputed', 'cancelled_by_admin']::trip_status[]
    WHEN 'paid'               THEN ARRAY['disputed']::trip_status[]
    ELSE ARRAY[]::trip_status[]
  END;

  IF NOT (NEW.status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'Invalid trip status transition: % → %', OLD.status, NEW.status
      USING ERRCODE = 'P0003';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trip_status_machine
  BEFORE UPDATE OF status ON trips
  FOR EACH ROW EXECUTE FUNCTION fn_validate_trip_status_transition();

-- ── 7. Audit log for critical tables ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit trigger to financial tables
CREATE TRIGGER trg_payments_audit
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_wallet_tx_audit
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- =============================================================================
-- VIEWS (3)
-- =============================================================================

-- ── 1. v_active_drivers ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_active_drivers AS
SELECT
  u.id,
  u.full_name,
  dp.vehicle_category,
  dp.rating_avg,
  dl.location,
  ST_X(dl.location::geometry) AS longitude,
  ST_Y(dl.location::geometry) AS latitude,
  dl.heading,
  dl.updated_at AS last_seen
FROM driver_locations dl
JOIN users u ON u.id = dl.driver_id
JOIN driver_profiles dp ON dp.user_id = dl.driver_id
WHERE dl.is_online = TRUE
  AND dl.is_available = TRUE
  AND dp.verification_status = 'verified'
  AND u.deleted_at IS NULL;

-- ── 2. v_expiring_documents ───────────────────────────────────────────────────
-- Documents expiring within 30 days. Used for admin alert dashboard.
CREATE OR REPLACE VIEW v_expiring_documents AS
SELECT
  dd.id,
  dd.driver_id,
  u.full_name AS driver_name,
  u.phone AS driver_phone,
  dd.document_type,
  dd.expiry_date,
  (dd.expiry_date - NOW())::INTEGER / 86400 AS days_until_expiry
FROM driver_documents dd
JOIN users u ON u.id = dd.driver_id
WHERE dd.status = 'approved'
  AND dd.expiry_date IS NOT NULL
  AND dd.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
ORDER BY dd.expiry_date ASC;

-- ── 3. v_trip_summary ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_trip_summary AS
SELECT
  t.id,
  t.status,
  t.client_id,
  cu.full_name AS client_name,
  t.driver_id,
  du.full_name AS driver_name,
  t.vehicle_category,
  t.origin_label,
  t.destination_label,
  t.fare_xaf,
  t.driver_amount_xaf,
  p.status AS payment_status,
  p.payment_method,
  tr_client.rating AS client_rating,
  tr_driver.rating AS driver_rating,
  t.created_at,
  t.completed_at
FROM trips t
LEFT JOIN users cu ON cu.id = t.client_id
LEFT JOIN users du ON du.id = t.driver_id
LEFT JOIN payments p ON p.trip_id = t.id AND p.payment_type = 'deposit'
LEFT JOIN trip_ratings tr_client ON tr_client.trip_id = t.id AND tr_client.rated_by = t.client_id
LEFT JOIN trip_ratings tr_driver ON tr_driver.trip_id = t.id AND tr_driver.rated_by = t.driver_id;

-- =============================================================================
-- ROW LEVEL SECURITY (Supabase)
-- =============================================================================
-- Enable RLS — all access through the API (service key bypasses RLS)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- API uses service_role key — bypasses RLS entirely.
-- Direct client access is disabled. All data flows through the Fastify API.
