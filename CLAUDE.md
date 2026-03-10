# Hello Driver — CLAUDE.md

You are the CTO and senior engineer of Hello Driver. You have full ownership of this codebase.
Read this file completely before taking any action in this project.

---

## What is Hello Driver

A ride-hailing platform built for Gabon (Libreville), Africa.
- Clients book rides via mobile web app or WhatsApp
- Drivers accept rides via React Native mobile app
- Platform takes commission per trip, pays drivers via Mobile Money
- Currency: XAF (Central African Franc)
- Primary language: French

---

## Monorepo Structure

```
apps/
  api/        Node.js 22 + Fastify — core API
  web/        Vite + React PWA — client booking app
  driver/     React Native + Expo (BARE workflow) — driver mobile app
  admin/      Vite + React — operations dashboard

packages/
  db/         Drizzle ORM + schema (single source of truth)
  validators/ Zod schemas shared across all apps
  ui/         shadcn/ui + Radix shared components
  config/     tsconfig, eslint, shared config
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript everywhere |
| Monorepo | Turborepo + pnpm |
| API | Node.js 22 + Fastify |
| Real-time | Socket.io + @socket.io/redis-streams-adapter (TCP) |
| Queue | BullMQ on Redis TCP |
| Database | PostgreSQL 16 + PostGIS (Supabase, always-on compute) |
| Cache | Redis TCP — Railway or Redis Cloud |
| ORM | Drizzle ORM |
| Auth | Supabase Auth (phone OTP, Google, Facebook) |
| Driver app | Expo BARE workflow (not managed) |
| GPS library | react-native-background-geolocation (Transistor Software) |
| Client app | Vite + React PWA |
| Maps | Mapbox |
| Mobile Money | pawaPay (Airtel Money + Moov Money, Gabon) |
| Cards | Gabonese acquiring bank — Phase 2 only |
| WhatsApp | Meta Cloud API |
| WhatsApp AI agent | Claude claude-haiku-4-5 via Anthropic SDK (conversational booking) |
| SMS fallback | Africa's Talking |
| Push notifications | Expo Push Notifications |
| Hosting | Fly.io jnb (Johannesburg) for API, Cloudflare Pages for web |
| Monitoring | Sentry + BetterStack |
| Testing | Vitest + Supertest, Playwright, Detox, k6 |

---

## Critical Architecture Rules

### 1. Trip Matching is SYNCHRONOUS — never use a queue for it
```
Client books → Fastify handler (sync)
  → Redis GEOSEARCH (nearby available drivers, sub-5ms)
  → Socket.io emit to each candidate driver
  → First driver to accept → Redis SET NX (atomic claim, prevents double-assignment)
  → Confirm to client
```
BullMQ is for: pawaPay webhook retries, SMS/WhatsApp notifications, scheduled driver payouts.
BullMQ is NOT for: matching, trip creation, any latency-sensitive operation.

### 2. GPS never writes to PostgreSQL on every ping
- Driver sends GPS every 3 seconds → Redis GEOADD only
- PostgreSQL upsert: every ~10 seconds (durable fallback, analytics)
- `trip_location_pings`: append-only partitioned table, written during active trips only
- Never do 167 writes/second to PostgreSQL

### 3. Expo BARE workflow is mandatory
- Managed Expo cannot keep background GPS alive on Tecno/Infinix/Samsung (dominant in Gabon)
- Always use `react-native-background-geolocation` from Transistor Software
- Always use `react-native-foreground-service` (persistent notification keeps GPS alive)
- Always prompt drivers to disable battery optimization (OEM-specific intent)

### 4. Redis must be TCP — never HTTP
- Upstash HTTP-based Redis breaks BullMQ and Socket.io adapter
- Always use Railway Redis or Redis Cloud with native TCP endpoint
- Set `maxmemory-policy: noeviction` (payment jobs must never be silently evicted)

### 5. Socket.io GPS rules
- Use `volatile.emit` for GPS position updates (drop if congested — stale in 3s anyway)
- Use `transports: ['websocket']` — disable polling fallback
- Use `socket.io-msgpack-parser` for binary encoding
- GPS rooms: `trip:<trip_id>` (2 members max: driver + client)
- Matching rooms: `zone:<grid_hash>` (drivers auto-join their zone on connect)

### 6. Wallet is immutable — always use the stored function
- Never write directly to `wallets.balance_xaf` or `wallet_transactions`
- Always call `post_wallet_transaction()` inside an explicit `BEGIN/COMMIT`
- The overdraft guard trigger will raise an exception on negative balance
- `wallet_transactions` rows are never updated or deleted

### 7. Payment idempotency is mandatory
- Always store `idempotency_key` in PostgreSQL BEFORE calling pawaPay API
- Always poll for stuck payments every 30s (never rely solely on webhooks)
- Verify HMAC signature on every pawaPay webhook

### 8. Neon/Supabase cold starts — prevent them
- Always-on compute must be enabled (never scale to zero in production)
- Use `-pooler` endpoint with `max: 20, min: 2, idleTimeoutMillis: 10000`
- `min: 2` keeps connections alive and prevents compute from sleeping

### 9. Hello Monnaie wallet — regulatory constraint
- Users can only spend credits on rides
- NEVER allow direct cash withdrawal to a bank account
- That would trigger COBAC e-money licensing requirements (~$830k minimum capital)
- Credits are funded via pawaPay inbound deposits only

### 10. Stale driver detection
- Every GPS ping must refresh `driver:<id>:heartbeat` key with 10s TTL
- Always filter Redis GEOSEARCH results against this heartbeat key
- Drivers missing heartbeat for >15s are removed from matching pool

### 11. WhatsApp bot is an LLM agent — not a state machine
- The WhatsApp bot is a Claude-powered AI agent that speaks naturally in French
- It is NOT a menu-driven bot with quick-reply buttons and rigid state transitions
- Use `claude-haiku-4-5` (fast, cheap, multilingual French, tool use capable)
- Architecture:
  1. Incoming WhatsApp message → Fastify webhook
  2. Load conversation history from Redis (`whatsapp:<phone>:history`, last 30 messages, 24h TTL)
  3. Call Claude API with: system prompt + conversation history + current message
  4. Claude responds with text or `tool_use` blocks
  5. Execute tool, feed result back to Claude, get final response
  6. Send response via Meta Cloud API, append both turns to Redis history
- Agent tools: `geocode_location`, `estimate_fare`, `create_trip`, `get_trip_status`, `cancel_trip`, `get_wallet_balance`, `initiate_payment`, `get_user_by_phone`
- System prompt: French persona, warm tone, booking context, tool guidance — no rigid script
- Token budget: max 4000 input tokens per turn — trim old history if needed
- Rate limit: 50 Claude API calls per WhatsApp number per hour (tracked in Redis)
- Error fallback: if LLM call fails/times out, send a polite French error message, do not crash
- Location messages (GPS pin from WhatsApp) must be handled — extract lat/lon from WhatsApp payload and pass directly to `geocode_location` or `estimate_fare` tools
- Never build a state machine for this — the LLM holds the conversational state

---

## Gabon-Specific Facts (Do Not Get Wrong)

| Topic | Fact |
|---|---|
| Mobile Money operators | **Airtel Money + Moov Money only**. MTN does not operate in Gabon. |
| Payment gateway | **pawaPay** — only confirmed aggregator live in Gabon with deposit + payout |
| Bizao | DEFUNCT — liquidated by French court May 2025. Never use. |
| Notchpay | Not confirmed for Gabon. Primary market is Cameroon. |
| CinetPay | Not confirmed for Gabon. Primarily West Africa. |
| Stripe | Not supported in Gabon. |
| Cards | Via Gabonese acquiring bank (BGFI Bank or Ecobank Gabon) — Phase 2 |
| Regulatory | Using pawaPay means no COBAC license needed at launch |
| Fly.io region | `jnb` (Johannesburg). No Lagos region exists in Fly.io. |
| Device market | Tecno, Infinix, Itel dominate. Android 90%+. Test on low-end devices. |
| Connectivity | 2G/3G is common outside Libreville center. Design for intermittent connections. |

---

## Database Schema

Full schema: `schema.sql` in the project root.
- 28 tables, 9 enum types, 7 triggers, 5 functions, 3 views, ~40 indexes (9 GIST)
- All monetary values in XAF, stored as `NUMERIC(14,2)`
- Soft deletes on `users` table (`deleted_at`)
- All tables have `created_at`, most have `updated_at` via trigger
- `trip_location_pings` is partitioned by month — add new partition monthly

**Key PostGIS query** (nearest available driver):
```sql
SELECT dl.driver_id, ST_Distance(dl.location::geography,
  ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography)::INT AS distance_m
FROM driver_locations dl
JOIN driver_profiles dp ON dp.user_id = dl.driver_id
WHERE dl.is_available = TRUE AND dl.is_online = TRUE
  AND dp.verification_status = 'verified'
  AND dp.vehicle_category = $category
  AND ST_DWithin(dl.location::geography,
    ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography, $radius_meters)
ORDER BY distance_m ASC LIMIT $limit;
```
Uses the partial GIST index `idx_driver_locations_available_geom` — always include
`is_available = TRUE AND is_online = TRUE` in WHERE to hit this index.

---

## Implementation Roadmap (Current)

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: monorepo, schema, auth, CI/CD | Not started |
| 1 | Driver core: registration, GPS, foreground service | Not started |
| 2 | Trip matching engine: booking, Redis matching, bidding | Not started |
| 3 | Payments: pawaPay, wallet, idempotency | Not started |
| 4 | Client + driver apps: full UX, Mapbox, push notifications | Not started |
| 5 | WhatsApp bot: Meta Cloud API, Redis state machine | Not started |
| 6 | Admin panel: doc verification, live map, disputes | Not started |
| 7 | Analytics: driver earnings dashboard, zone breakdown | Not started |
| 8 | Production hardening: k6 load tests, security audit | Not started |

---

## Code Conventions

- All API routes use Zod schemas for input validation (fastify-type-provider-zod)
- All PostGIS queries use `sql` tagged template literal in Drizzle — never string concatenation
- All financial calculations in integers (XAF has no decimals in practice) or NUMERIC — never float
- All background jobs must have: `attempts: 5`, exponential backoff, `removeOnFail: false`
- All pawaPay calls must have an idempotency key stored in DB before the call
- Error responses follow `{ error: { code: string, message: string } }` shape
- Dates stored as `TIMESTAMPTZ` (UTC), displayed in Africa/Libreville timezone (WAT, UTC+1)

## Testing Requirements

- Every API route must have an integration test (Vitest + Supertest)
- PostGIS queries must be tested against a local Docker PostGIS instance
- Background GPS must be manually tested on a physical Tecno or Infinix device
- Load tests run with African network simulation: 200ms latency + 5% packet loss
- Payment flows tested in pawaPay sandbox before any production use

---

## Do Not

- Do not use Upstash Redis (HTTP-based, incompatible with BullMQ and Socket.io adapter)
- Do not use Neon with auto-suspend enabled in production (cold starts = broken ride requests)
- Do not use Expo managed workflow for the driver app (background GPS will die)
- Do not write GPS pings directly to PostgreSQL (167 writes/sec will overwhelm the DB)
- Do not use BullMQ for trip matching (wrong primitive, adds 1-3s latency)
- Do not allow Hello Monnaie withdrawals to bank accounts (COBAC regulatory trigger)
- Do not reference MTN as a Gabon operator (MTN does not operate in Gabon)
- Do not use Bizao (company is defunct)
- Do not use Stripe for Gabon payments (not supported)
- Do not use Next.js App Router for the client app (overhead not justified, use Vite PWA)
- Do not update `wallet_transactions` rows after insert (immutable ledger)
- Do not write to `wallets.balance_xaf` directly (use `post_wallet_transaction()` only)
