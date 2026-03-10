# Hello Driver — Implementation Roadmap

> Priority: top-priority elements first. Scalability and performance designed in from the start.
> Every phase is independently testable before proceeding to the next.

---

## Phase 0 — Foundation
**Goal**: Everything deployed, CI running, team can ship

- [x] Turborepo + pnpm monorepo init (`apps/api`, `apps/web`, `apps/driver`, `apps/admin`, `packages/*`)
- [ ] Supabase project setup (PostgreSQL + PostGIS, eu-west-2 region, always-on compute enabled)
- [x] Full schema migration (`schema.sql` — 28 tables, PostGIS extensions, triggers, functions)
- [ ] Railway Redis (TCP, `maxmemory-policy: noeviction`)
- [x] Fastify API scaffold (health endpoint, env config, Zod plugin, global error handler)
- [x] Supabase Auth (phone OTP +241 Gabon, Google, Facebook)
- [ ] Fly.io `jnb` (Johannesburg) deployment
- [x] GitHub Actions CI/CD pipeline → Fly.io (API) + Cloudflare Pages (web/admin)
- [ ] Sentry + BetterStack monitoring setup

**Test gate**: Auth flows work. DB connected. API health returns 200. Deploy pipeline green.

---

## Phase 1 — Driver Core
**Goal**: Driver can register, upload documents, go online, and be found on the map

- [ ] Driver registration + profile API
- [ ] Vehicle registration API
- [ ] Document upload (Supabase Storage: license, national ID, insurance, vehicle photo)
- [ ] Expo bare workflow setup + Metro config for Turborepo monorepo
- [ ] `react-native-background-geolocation` (Transistor Software) integration
- [ ] `react-native-foreground-service` (persistent notification — keeps GPS alive on OEM devices)
- [ ] Battery optimization prompt (OEM-specific via `react-native-battery-optimization-check`)
- [ ] WebSocket server (Fastify + Socket.io, msgpack parser, WebSocket-only transport)
- [ ] Driver location pipeline: Redis GEOADD every 3s → PostgreSQL upsert every 10s
- [ ] `driver:<id>:heartbeat` Redis key with 10s TTL (stale driver detection)
- [ ] Driver availability toggle (online/offline) → Redis GEO add/remove
- [ ] Driver document verification workflow (admin: pending → approved/rejected)
- [ ] `v_expiring_documents` view wired to admin alerts (30-day warning)

**Test gate**: Driver goes online on Tecno/Infinix device. GPS persists 30+ min with screen off.
Driver appears in Redis GEO. Heartbeat removes offline driver within 15s.

---

## Phase 2 — Trip Matching Engine
**Goal**: Full trip lifecycle works end-to-end, including the bidding system

- [ ] Trip booking API (immediate + scheduled, exclusive/shared)
- [ ] PostGIS nearest-driver query (`ST_DWithin` + partial GIST index on available drivers)
- [ ] Synchronous matching handler: Redis GEOSEARCH → Socket.io fan-out to candidate drivers
- [ ] Bidding state machine:
  - Redis Hash `trip:<id>:bids` (driver offers with amount + ETA)
  - Sorted Set `trips:active` with expiry scores
  - BullMQ delayed job to expire uncollected bids at 60s
  - Redis `SET NX` for atomic driver claim (prevents double-assignment)
- [ ] Trip status state machine (13 states via PostgreSQL enum + trigger)
- [ ] Socket.io room strategy:
  - `trip:<id>` rooms for real-time GPS broadcast (driver + client only)
  - `zone:<hash>` rooms for trip request fan-out to nearby drivers
- [ ] `volatile.emit` for GPS updates (drop if congested — stale in 3s anyway)
- [ ] Zone assignment via `ST_Contains` on zones table (determines surge multiplier)
- [ ] No-driver-found flow (expand radius → suggest retry)
- [ ] Cancellation flow + `cancellation_policies` enforcement

**Test gate**: Book a trip → driver receives offer → accepts → real-time GPS tracked on client →
trip completes. Bidding window expires correctly. No double-assignment under concurrent load.

---

## Phase 3 — Payments
**Goal**: Real money flows. Drivers get paid after every trip.

- [ ] `PaymentService` interface (swap providers without touching business logic)
- [ ] pawaPay integration:
  - `POST /deposits` — collect from client (Airtel Money)
  - `POST /payouts` — disburse to driver
  - Webhook handler with HMAC signature verification
  - `POST /refunds`
- [ ] Payment state machine: `initiated → pending_user_approval → webhook_received → confirmed`
- [ ] BullMQ polling job: re-check stuck payments every 30s (not webhook-only)
- [ ] Idempotency key stored in PostgreSQL **before** every pawaPay API call
- [ ] Hello Monnaie wallet via `post_wallet_transaction()` function (always in explicit transaction):
  - Overdraft guard trigger
  - Immutable `wallet_transactions` ledger
  - Credit on ride payment, debit on trip spend
  - No cash withdrawal to bank account (COBAC regulatory constraint)
- [ ] Commission split logic (`driver_amount = gross_fare − commission_xaf`)
- [ ] Cancellation fee charging
- [ ] Promo code validation + discount application
- [ ] `driver_earnings_daily` trigger (auto-updates when trip transitions to `paid`)

**Test gate**: Real pawaPay sandbox — client pays via Airtel Money → driver receives payout.
Wallet credits/debits balance correctly. Idempotency prevents double charge on retry.
Earnings dashboard matches payment records exactly.

---

## Phase 4 — Client App + Driver App
**Goal**: Full product UX working on real physical devices

### Client Web App (Vite + React PWA)
- [ ] Booking flow: share GPS or type landmark → destination → trip type → price quote
- [ ] Mapbox map with live driver location (Socket.io `trip:<id>` room)
- [ ] Payment method selection (Airtel Money, Moov Money, Hello Monnaie wallet)
- [ ] USSD async payment flow (pending screen while user approves on phone)
- [ ] Trip status screen: searching → driver en route → arrived → in progress → complete
- [ ] Post-trip: rating (1–5 stars) + optional comment
- [ ] Trip history
- [ ] Wallet balance + transaction history
- [ ] Promo code entry
- [ ] PWA install prompt

### Driver App (React Native Expo Bare)
- [ ] Availability toggle (online/offline)
- [ ] Weekly schedule planner
- [ ] Trip request cards (origin, destination, offered price, ETA to pickup, countdown timer)
- [ ] Accept/reject flow
- [ ] Mapbox navigation: directions to pickup then dropoff
- [ ] Status buttons: Arrived / Trip Started / Trip Completed
- [ ] Payment confirmation screen
- [ ] Earnings dashboard (today, this week, this month, by commune/zone)
- [ ] Trip history
- [ ] Profile + document status
- [ ] Settings: notifications, location, dark mode
- [ ] Push notifications (Expo Push → FCM)

**Test gate**: Full end-to-end on physical devices. Client books → driver receives on Tecno device →
GPS tracked live on client map → trip completes → both rate → earnings updated correctly.

---

## Phase 5 — WhatsApp AI Agent
**Goal**: Full trip bookable entirely via WhatsApp — conversational, natural French, no menus

The WhatsApp bot is a Claude-powered AI agent. Users type naturally ("je veux aller à l'aéroport"),
share a GPS pin, ask questions, or say anything — the agent understands and responds humanly.
There is NO state machine, NO rigid menu, NO quick-reply button navigation.

### Infrastructure
- [ ] Meta Cloud API webhook setup (Fastify endpoint + HMAC signature verification)
- [ ] Redis conversation store: `whatsapp:<phone>:history` (JSON array, LPUSH + LTRIM to 30, 24h TTL)
- [ ] Anthropic SDK integration (`claude-haiku-4-5` — fast, cheap, French-capable, tool use)
- [ ] Rate limiter: 50 Claude calls/hour per phone number (Redis counter + BullMQ if needed)
- [ ] Graceful error fallback: French error message on LLM timeout or API failure

### Agent Tools (Fastify executes these when Claude calls them)
- [ ] `geocode_location(query)` — Mapbox Geocoding API → `{lat, lon, label}` (handles text landmarks)
- [ ] `estimate_fare(origin, destination, vehicle_category)` → fare in XAF + ETA
- [ ] `create_trip(user_id, origin, destination, vehicle_category, payment_method)` → trip_id
- [ ] `get_trip_status(trip_id)` → current state + driver ETA if matched
- [ ] `cancel_trip(trip_id)` → cancels + applies cancellation policy
- [ ] `get_wallet_balance(user_id)` → balance in XAF
- [ ] `initiate_payment(trip_id, amount, msisdn, operator)` → triggers pawaPay deposit
- [ ] `get_user_by_phone(phone)` → user record or null (bot prompts registration if null)

### System Prompt
- [ ] French persona: warm, professional, concise ("Tu es l'assistant Hello Driver à Libreville")
- [ ] Context: available vehicle categories, payment methods, service area (Libreville)
- [ ] Tool guidance: when to geocode vs ask for clarification, how to handle ambiguous locations
- [ ] Constraints: never discuss fares not in the system, never impersonate a human if directly asked

### Message Types
- [ ] Text messages in French (+ informal abbreviations, mixed French/local slang)
- [ ] WhatsApp Location pin → extract `{lat, lon}` from webhook payload, pass to `estimate_fare`
- [ ] WhatsApp interactive buttons — used ONLY for binary confirmation (confirm booking: oui/non)
  - Never use buttons for navigation or flow control — that's the LLM's job

### Notifications (outbound — require Meta-approved templates)
- [ ] Trip matched: "Votre chauffeur [name] arrive dans [X] min — [vehicle]"
- [ ] Driver arrived: "Votre chauffeur est arrivé"
- [ ] Trip complete + rating prompt
- [ ] Payment confirmation

### Auth / OTP
- [ ] OTP delivery waterfall: WhatsApp first → SMS via Africa's Talking at 15s if no delivery receipt
- [ ] Phone number from WhatsApp message is the identity — no separate login

**Test gate**: User sends "je veux aller à l'aéroprt de Libreville" (typo included) — agent geocodes,
asks for pickup location, quotes fare, confirms, creates trip, sends driver notification.
Entire conversation in natural French with no menus. GPS pin also works as pickup input.
OTP fallback to SMS confirmed working. Rate limiter prevents runaway LLM cost.

---

## Phase 6 — Admin Panel
**Goal**: Operations team can run the business without engineering help

- [ ] Driver document review queue (pending → approve/reject with note)
- [ ] Live trip map (all active trips + driver positions)
- [ ] Trip management (override status, force cancel, manual driver assignment)
- [ ] Payment management (confirm cash deposit, manual reconciliation)
- [ ] Dispute resolution flow
- [ ] Document expiry dashboard (`v_expiring_documents` → 30-day alerts + driver notification)
- [ ] Driver suspension / ban
- [ ] Promo code management (create, edit, deactivate)
- [ ] Zone surge multiplier editor
- [ ] Basic analytics (daily trips, revenue, active drivers, cancellation rate)

**Test gate**: Admin can verify a driver, monitor live trips, resolve a payment dispute,
and action expiring documents — all without touching the database directly.

---

## Phase 7 — Analytics & Earnings Dashboard
**Goal**: Drivers have full financial visibility. Platform has operational data.

- [ ] Driver earnings by day (`driver_earnings_daily` table)
- [ ] Driver earnings by commune/zone (zone breakdown with map)
- [ ] Best performing hours and days (heatmap)
- [ ] Monthly earnings summary with downloadable invoice
- [ ] Cancellation rate metric per driver
- [ ] Platform analytics: total revenue, commission, trip volume, DAU
- [ ] Referral tracking and reward status

**Test gate**: Earnings figures reconcile exactly against `payments` table.
Zone data correctly assigned via PostGIS `ST_Contains` zone lookup.

---

## Phase 8 — Production Hardening
**Goal**: System is ready for public launch under real-world load and conditions

- [ ] k6 load test: 500 concurrent drivers sending GPS every 3s
- [ ] k6 trip booking: 50 concurrent bookings with matching under load
- [ ] African network simulation: 200ms added latency + 5% packet loss via `tc netem`
- [ ] Background GPS 6-hour stress test on Tecno POVA 3 with screen off
- [ ] Payment reconciliation: pawaPay dashboard vs PostgreSQL `payments` table
- [ ] Sentry alert rules (payment failures, matching timeouts >3s, GPS loss rate >5%)
- [ ] BetterStack uptime checks (API, Socket.io, Redis, pawaPay webhook endpoint)
- [ ] Rate limiting (OTP: 5/hour per MSISDN, booking: 10/min per user)
- [ ] pg.Pool production config tuning (`max`, `min`, `idleTimeoutMillis`)
- [ ] Security audit: HMAC webhook verification, JWT rotation, Zod input coverage

**Test gate**: Load tests pass. GPS stable for 6h on low-end Android. Payment success rate >98%.
Zero phantom drivers in matching pool. P99 trip booking latency <500ms. Zero wallet overdrafts.

---

## Post-Launch — V2 Backlog

- Subscription model (weekly/monthly commuter packages)
- Shared rides (multi-passenger trip matching)
- Card payments via Gabonese acquiring bank (BGFI or Ecobank Gabon)
- FCM direct integration (bypass Expo Push for time-critical driver notifications)
- Automated driver document pre-screening (AI → human second pass)
- Hello Monnaie COBAC licensing if wallet reaches regulated scale
- MapLibre GL + self-hosted Protomaps tiles (cost optimisation at scale vs Mapbox)
- Cross-border expansion: Cameroon, Congo-Brazzaville
- In-app advertising and promotions
- Driver referral programme
- Lottery / gamification features
