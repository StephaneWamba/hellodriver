# Phase 2 — Trip Matching Engine

**Goal**: Full trip lifecycle end-to-end. Driver receives offers, accepts, GPS tracked, trip completes.

**Critical Architecture**: Trip matching is SYNCHRONOUS (never use BullMQ). Redis GEOSEARCH + Socket.io fan-out.

---

## Phase 2 Step 1: Trip Booking API + Validators

### Deliverables
- **Validators** (`packages/validators/src/trip.ts`):
  - `createTripSchema`: full_name, pickup_lat, pickup_lon, dropoff_lat, dropoff_lon, is_scheduled, scheduled_time (optional), trip_type ('exclusive'|'shared'), vehicle_category
  - `updateTripStatusSchema`: status enum validation
  - `estimateFareSchema`: pickup, dropoff, vehicle_category

- **Routes** (`apps/api/src/routes/trips.ts`):
  - `POST /trips/estimate-fare`: Estimate fare based on distance + zone surge
  - `POST /trips`: Create trip (status='new', auto-assign unique trip_id)
  - `GET /trips/:tripId`: Get trip details (client can poll or use Socket.io)
  - `GET /trips`: List active trips (admin dashboard)

### Acceptance Criteria
- Trip created with correct status enum
- Fare estimation uses zone surge multiplier from `zones` table
- TypeScript compile succeeds
- All routes respond with proper 200/400/404 codes

---

## Phase 2 Step 2: PostGIS Nearest-Driver Query + Matching Handler

### Deliverables
- **Query Service** (`apps/api/src/services/matching.ts`):
  - `findNearestDrivers(lat, lon, radius, category)`:
    - Uses PostGIS `ST_DWithin` + GIST partial index
    - Filters: verified, available, online, heartbeat alive
    - Returns: driver_id, distance, zone_id (for surge pricing)
  - `computeZoneSurge(zone_id)`: Multiplier lookup from zones table

- **Matching Handler** (`apps/api/src/handlers/trip-matching.ts`):
  - Synchronous, in-process, NO queues
  - Flow:
    1. Client books trip → `POST /trips`
    2. Handler queries nearest drivers (3 candidates)
    3. Emits `trip:new` to zone:<zone_hash> room (where drivers listen)
    4. Returns trip_id immediately to client
  - No waiting for driver acceptance — async via Socket.io

### Acceptance Criteria
- Query returns drivers sorted by distance
- Zone surge correctly applied
- Handler fans out to Socket.io zone room within 50ms
- No BullMQ used (CRITICAL)

---

## Phase 2 Step 3: Trip Status State Machine

### Deliverables
- **Migration**: Update trips table trigger to enforce state transitions
- **Enum**: Ensure `trip_status` has all 13 states:
  1. `new` → client created, awaiting offers
  2. `bidding_open` → drivers can bid (60s window)
  3. `driver_assigned` → driver claimed trip (atomic via Redis SET NX)
  4. `accepted` → driver confirmed acceptance
  5. `driver_arriving` → driver en route
  6. `driver_arrived` → at pickup location
  7. `passenger_onboard` → trip started
  8. `en_route` → driving to dropoff
  9. `arrived_at_destination` → at dropoff
  10. `completed` → trip done, ready for payment
  11. `cancelled_by_client` → cancelled by client
  12. `cancelled_by_driver` → cancelled by driver
  13. `no_driver_found` → expired after 60s with no acceptance

- **State Transition Trigger** (`schema.sql`): Enforce valid transitions only
  - `new` → {`bidding_open`, `cancelled_by_client`}
  - `bidding_open` → {`driver_assigned`, `no_driver_found`, `cancelled_by_client`}
  - etc.

### Acceptance Criteria
- Trigger prevents invalid state transitions
- PostgreSQL logs reject on violation
- All 13 states reachable in happy path + edge cases

---

## Phase 2 Step 4: Bidding State Machine (Redis)

### Deliverables
- **Bidding Handler** (`apps/api/src/handlers/bidding.ts`):
  - Data structures:
    - `trip:<trip_id>:bids` (Redis Hash): {driver_id: {amount_xaf, eta_minutes, accepted_at}}
    - `trips:active` (Redis Sorted Set): {trip_id: expiry_timestamp} (60s window)

  - Socket.io `driver:bid:offer` event:
    - Payload: {trip_id, pickup_lat, pickup_lon, dropoff_lat, dropoff_lon, estimated_fare_xaf, estimated_time_min}
    - Emitted to drivers in zone (fan-out)

  - Socket.io `driver:bid:accept` event handler:
    - Try atomic claim: `SET NX trip:<trip_id>:claimed driver_id`
    - If success (NX returns OK): driver assigned, remove from bids hash
    - If fail (NX returns nil): driver was too slow, emit rejection

  - **BullMQ delayed job**: Expire uncollected bids at 60s
    - Job: Transition trip status `bidding_open` → `no_driver_found`
    - Backoff: {attempts: 3, delay: 1000}

### Acceptance Criteria
- Atomic driver claim prevents race conditions
- First driver to accept gets trip (Redis SET NX)
- Concurrent bids handled correctly (no double-assignment)
- 60s timeout triggers no-driver-found flow

---

## Phase 2 Step 5: Socket.io Room Strategy + GPS Broadcast

### Deliverables
- **Room Management** (update existing `apps/api/src/plugins/socket.ts`):
  - Zone rooms already exist: `zone:<lat_grid>_<lon_grid>`
  - Add trip rooms: `trip:<trip_id>` (max 2 members: driver + client)

  - On `driver:bid:accept`:
    - Driver joins: `socket.join('trip:<trip_id>')`
    - Client joins: Client app joins same trip room

  - GPS updates (existing):
    - Driver sends `gps:update` event (every 3s)
    - Emit `volatile.to('trip:<trip_id>').emit('driver:location', {...})`
    - Drop if congested (stale in 3s anyway)

- **Client Subscription** (web/admin):
  - Listen to `trip:<trip_id>` for real-time GPS breadcrumb
  - Update map marker as driver moves

### Acceptance Criteria
- Zone rooms receive trip offers instantly
- Trip room receives GPS updates at 3s frequency
- Client map updates in real-time
- No congestion = 100% delivery of updates

---

## Phase 2 Step 6: Zone Assignment + Surge Pricing

### Deliverables
- **Zone Lookup Service** (`apps/api/src/services/zones.ts`):
  - `getZoneForLocation(lat, lon)`:
    - PostGIS `ST_Contains(zone_geometry, point)`
    - Returns: zone_id, surge_multiplier (e.g., 1.0x baseline, 1.5x peak)

  - Called during fare estimation and trip assignment

- **Fare Calc** (`apps/api/src/services/fare.ts`):
  - `calculateFare(pickup, dropoff, vehicle_category, is_scheduled)`:
    - Base fare = distance_km × rate_per_km[category] + base_amount
    - Apply zone surge multiplier
    - If scheduled: apply time-based multiplier (e.g., 1.2x for early morning)
    - Result in XAF (integer, no decimals)

### Acceptance Criteria
- Zone query returns correct surge for location
- Fare reflects surge multiplier
- All calculations in integers (no float rounding errors)

---

## Phase 2 Step 7: No-Driver-Found + Retry Flow

### Deliverables
- **No-Driver Handler** (`apps/api/src/handlers/no-driver.ts`):
  - Triggered when 60s bidding window expires with no acceptance
  - Status transitions: `bidding_open` → `no_driver_found`
  - Client notification via Socket.io: `trip:no_driver_found` event
  - Client can:
    - Retry: Expand search radius (e.g., 5km → 8km) → `POST /trips/:tripId/retry`
    - Cancel: `PATCH /trips/:tripId/cancel`

- **Retry Logic**:
  - Max 3 retries with expanding radius
  - Each retry resets 60s bidding window
  - Increased surge multiplier per retry (incentivize drivers)

### Acceptance Criteria
- Trip transitions to `no_driver_found` at 60s
- Client receives notification
- Retry expands search radius correctly
- Surge increases per retry

---

## Phase 2 Step 8: Cancellation Flow + Policies

### Deliverables
- **Cancellation Routes** (`apps/api/src/routes/trips.ts`):
  - `PATCH /trips/:tripId/cancel` (client)
  - `PATCH /trips/:tripId/cancel` (driver) — different preHandler (requireDriver)

- **Cancellation Logic**:
  - If status `new` or `bidding_open`: Free cancellation
  - If status `driver_assigned` or `accepted`: Cancellation fee (lookup `cancellation_policies` table)
  - If status `passenger_onboard` or later: Driver can't cancel (trip started)
  - Client can always cancel (fee applies after driver acceptance)

- **Admin View** (`GET /admin/trips/cancellations`):
  - List recent cancellations with reason + fee

### Acceptance Criteria
- Cancellation fee applied correctly per policy
- Status restrictions enforced
- Admin can see cancellation history
- No double-cancellation possible (idempotent)

---

## Testing Gate

**Scenario**: Book a trip → 2 drivers receive offer → 1st driver accepts → Real-time GPS tracked → Trip completes

**Checks**:
1. Trip created in `new` status ✓
2. Drivers in zone receive Socket.io offer within 100ms ✓
3. First driver to bid:accept gets trip (second driver gets rejection) ✓
4. Trip status → `driver_assigned` ✓
5. GPS updates stream to client in real-time ✓
6. No race conditions under concurrent bids ✓
7. Expiry at 60s if no driver accepts ✓

---

## Estimated Effort
- Step 1: 2h (validators + basic routes)
- Step 2: 3h (PostGIS query + matching handler, hardest part)
- Step 3: 1h (state machine triggers)
- Step 4: 3h (Redis bidding + atomicity)
- Step 5: 1h (Socket.io rooms, mostly reuse)
- Step 6: 2h (zone lookup + fare calc)
- Step 7: 1h (no-driver flow)
- Step 8: 2h (cancellation policies)
- **Total**: ~15h

---

## Critical Gotchas (from CLAUDE.md)
1. **NO BullMQ for matching** — must be sync + in-process
2. **Atomic driver claim** via Redis `SET NX` (prevents double-assignment)
3. **PostGIS query must use partial GIST index** on available drivers
4. **Volatile.emit for GPS** (drop if congested, stale anyway)
5. **All fares in XAF integers** (no decimals, no floats)
6. **Idempotency keys for future payments** (Phase 3, but design now)

---

**Start with Step 1 when ready. Clear architecture, low risk.**
