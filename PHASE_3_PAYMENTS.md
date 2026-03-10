# Phase 3: Payments Architecture & Testing Strategy

> **Status**: Research Complete | Design In Progress
> **Date**: March 10, 2026
> **Context**: Phase 2 (Trip Matching) is complete. Phase 3 implements pawaPay integration, wallet system, and payment flows for Gabon (Airtel Money + Moov Money).

---

## Executive Summary

Phase 3 implements **application-layer Hello Monnaie wallet** (no COBAC licensing required) with pawaPay REST API aggregator. The system supports:

- **Inbound**: Users deposit XAF via Airtel Money or Moov Money (USSD or API)
- **Outbound**: Drivers withdraw earnings to mobile money (payouts via pawaPay)
- **Immutable Ledger**: All transactions stored in PostgreSQL via `post_wallet_transaction()` stored procedure
- **Idempotency**: Every pawaPay call stored in DB BEFORE API execution
- **Webhook Safety**: HMAC verification + timestamp + deduplication (Redis)
- **Testing from France**: Mock pawaPay + sandbox environment + fixtures

---

## Architecture Overview

### 1. Core Components

```
┌─────────────────────────────────────────┐
│      User / Driver (Mobile)             │
│  Deposits: Airtel Money USSD            │
│  Withdrawals: Mobile Money Account      │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│    Hello Driver Fastify API             │
│  POST /wallet/deposits                  │
│  POST /wallet/payouts                   │
│  POST /wallet/balance                   │
│  POST /webhooks/pawapay                 │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│  pawaPay REST API (Aggregator)          │
│  AIRTEL_GAB: Airtel Money Gabon         │
│  MOOV_GAB: Moov Money Gabon             │
│  Base URL: https://api.pawapay.io/v2    │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┐
    ↓                 ↓
[Airtel Money]   [Moov Money]
(USSD/API)       (USSD/API)
```

### 2. Data Flow: User Deposits XAF

```
1. User clicks "Add funds" in web app
2. App shows: "How much XAF?" (min: 1,000, max: 1,000,000 per txn)
3. User selects operator: Airtel Money OR Moov Money
4. API creates payment record (status: INITIATED)
5. pawaPay initiates deposit:
   - If USSD: returns USSD code for user to dial (*170# etc)
   - If API: returns approval link/reference
6. User completes USSD/SMS confirmation
7. pawaPay sends webhook: POST /webhooks/pawapay with HMAC
8. API verifies HMAC signature, deduplicates via webhook_id
9. API calls post_wallet_transaction() to credit user wallet
10. API emits Socket.io event: wallet:credited
11. Client displays "Funds added!"
```

### 3. Data Flow: Driver Withdraws Earnings

```
1. Driver (admin approval) initiates payout request
2. API creates payment record (status: INITIATED)
3. pawaPay initiates payout:
   - Deducts from Hello Monnaie balance
   - Sends to driver's Airtel/Moov account
4. Driver receives USSD confirmation (payment confirmed)
5. pawaPay sends webhook
6. API records transaction, updates driver balance
7. Driver can view history in driver app
```

---

## REST API Endpoints

### 1. **POST /wallet/deposits** — Initiate user deposit

**Request:**
```json
{
  "amount_xaf": 50000,
  "operator": "AIRTEL_GAB" | "MOOV_GAB",
  "phone_number": "24177112345"
}
```

**Response (200):**
```json
{
  "deposit_id": "uuid-v4-here",
  "status": "AWAITING_USER_CONFIRMATION",
  "operator": "AIRTEL_GAB",
  "amount_xaf": 50000,
  "ussd_code": "*170#1*1*50000#",
  "expires_at": "2026-03-10T12:15:00Z",
  "created_at": "2026-03-10T12:05:00Z"
}
```

**Errors:**
- `400` — Invalid amount (min 1,000 XAF, max 1,000,000)
- `400` — Daily limit exceeded (1,000,000 XAF/day)
- `429` — Rate limit (10 deposits per 5 minutes per user)
- `422` — User KYC tier insufficient for this amount

---

### 2. **POST /wallet/payouts** — Initiate driver payout

**Request:**
```json
{
  "driver_id": "uuid",
  "amount_xaf": 25000,
  "operator": "AIRTEL_GAB" | "MOOV_GAB",
  "phone_number": "24177112345"
}
```

**Response (200):**
```json
{
  "payout_id": "uuid-v4-here",
  "status": "PROCESSING",
  "amount_xaf": 25000,
  "operator": "AIRTEL_GAB",
  "phone_number": "24177112345",
  "processing_until": "2026-03-10T12:35:00Z",
  "created_at": "2026-03-10T12:05:00Z"
}
```

**Errors:**
- `400` — Insufficient balance
- `400` — Daily payout limit exceeded
- `403` — Not a driver, or driver not verified
- `422` — Driver not eligible for payouts (new account <7 days)

---

### 3. **GET /wallet/balance** — Get wallet balance & history

**Response:**
```json
{
  "balance_xaf": 125000,
  "held_xaf": 5000,
  "available_xaf": 120000,
  "recent_transactions": [
    {
      "transaction_id": "uuid",
      "type": "DEPOSIT",
      "amount_xaf": 50000,
      "status": "CONFIRMED",
      "created_at": "2026-03-09T14:00:00Z"
    }
  ]
}
```

---

### 4. **POST /webhooks/pawapay** — Receive pawaPay callbacks

**Headers:**
```
Authorization: Bearer pawapay-webhook-signature-header
X-Pawapay-Timestamp: 1710079500
X-Pawapay-Signature: sha256=hmac_base64_here
```

**Payload (example: deposit completed):**
```json
{
  "webhook_id": "webhook-uuid-idempotency-key",
  "event_type": "deposit.completed",
  "deposit_id": "deposit-uuid-from-hello-driver",
  "status": "CONFIRMED",
  "amount_xaf": 50000,
  "operator": "AIRTEL_GAB",
  "payer_phone": "24177112345",
  "timestamp": "2026-03-10T12:10:00Z",
  "metadata": {}
}
```

**Processing:**
1. Verify HMAC signature (constant-time comparison)
2. Check timestamp (reject if >5 min old)
3. Lookup webhook_id in Redis (`pawapay:webhook:{webhook_id}`, TTL 7 days)
4. If exists → return 200 (already processed)
5. If new → store in Redis, process payment, call `post_wallet_transaction()`
6. Return 200 immediately (async pattern)

**Response (200):**
```json
{
  "status": "acknowledged"
}
```

---

## Database Schema Changes

### 1. **wallet_transactions** (already exists, immutable)

```sql
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- DEPOSIT, WITHDRAWAL, ADJUSTMENT, COMMISSION, REFUND
  amount_xaf NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL, -- PENDING, CONFIRMED, FAILED, REFUNDED
  pawapay_deposit_id UUID,
  pawapay_payout_id UUID,
  reference_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- No UPDATE allowed; insert-only ledger
```

### 2. **New: payments** (payment request tracking)

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- DEPOSIT, PAYOUT
  operator TEXT NOT NULL, -- AIRTEL_GAB, MOOV_GAB
  amount_xaf NUMERIC(14,2) NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  status TEXT NOT NULL, -- INITIATED, AWAITING_USER_CONFIRMATION, PROCESSING, CONFIRMED, FAILED, EXPIRED
  pawapay_id VARCHAR(100) UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. **New: payment_idempotency** (prevent duplicate pawaPay calls)

```sql
CREATE TABLE payment_idempotency (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  status TEXT NOT NULL, -- PENDING, COMPLETED, FAILED
  pawapay_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
-- Cleaned up every 24h (old rows deleted)
```

### 4. **New: webhook_logs** (audit trail)

```sql
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY,
  webhook_id VARCHAR(255) UNIQUE NOT NULL,
  provider TEXT NOT NULL, -- PAWAPAY
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- TTL: 30 days
```

### 5. **Stored Procedure: post_wallet_transaction()**

Already exists (Phase 2), validates overdraft guard:

```sql
SELECT post_wallet_transaction(
  user_id => $1,
  type => 'DEPOSIT',
  amount_xaf => $2,
  reference => $3,
  metadata => $4
);
```

Raises exception if resulting balance < 0 (guard trigger).

---

## Payment State Machine

```
INITIATED
  ├─ USSD flow: → AWAITING_USER_CONFIRMATION → CONFIRMED → (webhook) → COMPLETED
  └─ API flow: → PROCESSING → CONFIRMED → (webhook) → COMPLETED
        ├─ Failed at any stage → FAILED
        └─ Timeout (no webhook after 5 min) → EXPIRED → AUTO_REFUND (pending)
```

**Timeout Handling (Critical for unreliable networks):**
- Every payment has `expires_at = created_at + 5 minutes`
- BullMQ job every 30 seconds: find `status=PROCESSING AND expires_at < NOW()`
  - Call pawaPay status check API
  - If still pending → wait
  - If confirmed → update via webhook
  - If failed → mark FAILED, refund user
  - If no response → call status check every 30s for 24 hours, then REFUND

---

## Payment Constraints & Limits

### Operator Limits (Gabon)

| Constraint | Airtel Money | Moov Money | Hello Driver |
|---|---|---|---|
| **Max/transaction** | 500,000 XAF | 300,000 XAF | 1,000,000 (capped to operator max) |
| **Max/day** | 1,000,000 XAF | 1,000,000 XAF | 1,000,000 XAF (per operator) |
| **Max tx/day** | 30 transactions | 25 transactions | 30 (per operator) |
| **KYC tiers** | Basic, Verified | Basic, Verified | Same as operator |
| **Minimum amount** | 100 XAF | 100 XAF | 1,000 XAF |
| **USSD timeout** | 60 seconds | 60 seconds | Retry every 30s for 5 min |

### Hello Driver Enforcement

```typescript
// services/payment-validation.ts
const validateDepositAmount = async (
  userId: string,
  amountXaf: number,
  operator: 'AIRTEL_GAB' | 'MOOV_GAB'
): Promise<{ valid: boolean; reason?: string }> => {
  // 1. Single transaction max (operator constraint)
  if (operator === 'AIRTEL_GAB' && amountXaf > 500_000) {
    return { valid: false, reason: 'Airtel max per transaction: 500k XAF' };
  }

  // 2. Daily limit per operator
  const todayTotal = await getTodayDepositTotal(userId, operator);
  if (todayTotal + amountXaf > 1_000_000) {
    return { valid: false, reason: 'Daily limit exceeded' };
  }

  // 3. Daily transaction count
  const txCount = await getTodayTransactionCount(userId, operator);
  if (txCount >= 30) {
    return { valid: false, reason: 'Daily transaction limit (30) exceeded' };
  }

  // 4. User KYC tier
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (amountXaf > 500_000 && user.kyc_tier !== 'VERIFIED') {
    return { valid: false, reason: 'Need verified KYC for amounts > 500k' };
  }

  return { valid: true };
};
```

---

## pawaPay Integration Details

### API Base URLs

| Environment | URL | Use |
|---|---|---|
| **Sandbox** | `https://staging-api.pawapay.io` | Development, testing |
| **Production** | `https://api.pawapay.io` | Live Gabon traffic |

### Authentication

**Every request includes:**
```
Authorization: Bearer {PAWAPAY_API_KEY}
Content-Type: application/json
```

### Idempotency

**Every request includes:**
```json
{
  "depositId": "uuid-v4-generated-by-hello-driver",
  // or
  "payoutId": "uuid-v4-generated-by-hello-driver"
}
```

pawaPay will return same response if called twice with same ID.

### Key Request Examples

**1. Initiate Deposit (Airtel Money)**

```
POST https://api.pawapay.io/v2/deposits
Authorization: Bearer {KEY}
Content-Type: application/json

{
  "depositId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": {
    "value": "50000",
    "currency": "XAF"
  },
  "payer": {
    "type": "MSISDN",
    "address": "+24177112345"
  },
  "operator": "AIRTEL_GAB",
  "metadata": {
    "user_id": "user-uuid-here",
    "trip_id": "optional"
  }
}
```

**Response (200):**
```json
{
  "depositId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ACCEPTED",
  "createdAt": "2026-03-10T12:05:00Z"
}
```

**2. Check Deposit Status**

```
GET https://api.pawapay.io/v2/deposits/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer {KEY}
```

**Response:**
```json
{
  "depositId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "amount": { "value": "50000", "currency": "XAF" },
  "completedAt": "2026-03-10T12:10:00Z"
}
```

**3. Initiate Payout (Airtel Money)**

```
POST https://api.pawapay.io/v2/payouts
Authorization: Bearer {KEY}
Content-Type: application/json

{
  "payoutId": "payout-uuid-v4",
  "amount": {
    "value": "25000",
    "currency": "XAF"
  },
  "recipient": {
    "type": "MSISDN",
    "address": "+24177112345"
  },
  "operator": "AIRTEL_GAB",
  "metadata": {
    "driver_id": "driver-uuid",
    "reason": "EARNINGS"
  }
}
```

**4. Webhook Payload (Deposit Completed)**

```json
{
  "type": "Deposit.Completed",
  "data": {
    "depositId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "amount": { "value": "50000", "currency": "XAF" },
    "payer": { "type": "MSISDN", "address": "+24177112345" },
    "operator": "AIRTEL_GAB",
    "completedAt": "2026-03-10T12:10:00Z"
  }
}
```

---

## HMAC Webhook Verification

**Every webhook from pawaPay includes:**

```
X-Pawapay-Signature: sha256=base64_encoded_hmac
```

**Verification (Node.js):**

```typescript
import crypto from 'crypto';

const verifyPawapaySignature = (
  payload: string, // raw request body as string
  signature: string, // X-Pawapay-Signature header
  secret: string // PAWAPAY_WEBHOOK_SECRET
): boolean => {
  const [algorithm, signatureValue] = signature.split('=');
  if (algorithm !== 'sha256') {
    return false;
  }

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  // Constant-time comparison (prevents timing attacks)
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(signatureValue)
  );
};
```

**Fastify handler:**

```typescript
fastify.post<{ Body: PawapayWebhook }>('/webhooks/pawapay', async (req, reply) => {
  const signature = req.headers['x-pawapay-signature'] as string;

  if (!verifyPawapaySignature(req.rawBody, signature, env.PAWAPAY_WEBHOOK_SECRET)) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }

  const webhook = req.body;

  // Idempotency: check if already processed
  const processed = await redis.get(`pawapay:webhook:${webhook.id}`);
  if (processed) {
    return reply.code(200).send({ status: 'acknowledged' });
  }

  // Mark as seen (prevent reprocessing)
  await redis.setex(`pawapay:webhook:${webhook.id}`, 86400 * 7, '1'); // 7 day TTL

  // Queue for async processing (return 200 immediately)
  await queues.payments.add('process-webhook', webhook, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 }
  });

  return reply.code(200).send({ status: 'acknowledged' });
});
```

---

## Testing Strategy for France-Based Development

### Problem
- Cannot test live Airtel Money or Moov Money from France (operator locks to Gabon)
- No real mobile money account in France
- Need to verify payment flows without live operators

### Solution Stack

#### 1. **Local Development: Mock pawaPay**

**File: `apps/api/src/services/__mocks__/pawapay-client.ts`**

```typescript
export interface MockPaywapayClient {
  initiateDeposit(req: InitiateDepositRequest): Promise<InitiateDepositResponse>;
  checkStatus(depositId: string): Promise<DepositStatus>;
  initiatePayouts(req: InitiatePayoutRequest): Promise<InitiatePayoutResponse>;
}

export const createMockPawapayClient = (): MockPawapayClient => ({
  initiateDeposit: async (req) => {
    // Simulate successful deposit
    if (req.amount.value === '50000') {
      return {
        depositId: req.depositId,
        status: 'ACCEPTED',
        createdAt: new Date().toISOString()
      };
    }
    // Simulate operator error
    throw new Error('INSUFFICIENT_BALANCE');
  },

  checkStatus: async (depositId) => {
    // Deterministic test: deposit IDs ending in '999' are stuck
    if (depositId.endsWith('999')) {
      return { status: 'SUBMITTED', completedAt: null };
    }
    return { status: 'COMPLETED', completedAt: new Date().toISOString() };
  },

  initiatePayouts: async (req) => {
    return {
      payoutId: req.payoutId,
      status: 'ACCEPTED',
      createdAt: new Date().toISOString()
    };
  }
});
```

#### 2. **Sandbox Testing: pawaPay Staging**

Register for https://docs.pawapay.io/testing_the_api

**Test credentials:**
```
API Base URL: https://staging-api.pawapay.io
API Key: [request from pawaPay]
Test phone numbers:
  - Success: +242771XXXXX789 (deposits complete immediately)
  - Timeout: +242771XXXXX129 (stuck in SUBMITTED for 5 min, tests retry logic)
  - Fail: +242771XXXXX000 (returns error for insufficient balance)
```

**Test Data Generator:**

```typescript
export const generateTestPhone = (outcome: 'success' | 'timeout' | 'failure'): string => {
  const base = '+242771000';
  const suffix = {
    success: '789',
    timeout: '129',
    failure: '000'
  }[outcome];

  return base + suffix;
};
```

#### 3. **Integration Tests: Vitest + Supertest + Redis**

**File: `apps/api/src/routes/wallet.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../server';
import redis from 'redis';

describe('Wallet Routes - Payment Integration', () => {
  let app: FastifyInstance;
  let redisClient: redis.RedisClient;

  beforeAll(async () => {
    app = await createServer({
      // Use mock pawaPay for integration tests
      pawapayClient: createMockPawapayClient()
    });
    redisClient = redis.createClient();
    await redisClient.connect();
  });

  afterAll(async () => {
    await app.close();
    await redisClient.quit();
  });

  it('should initiate deposit and update wallet on webhook', async () => {
    // 1. User deposits 50k XAF via Airtel
    const depositRes = await app.inject({
      method: 'POST',
      url: '/wallet/deposits',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        amount_xaf: 50000,
        operator: 'AIRTEL_GAB',
        phone_number: '+24177112345'
      }
    });

    expect(depositRes.statusCode).toBe(200);
    const depositId = depositRes.json().deposit_id;

    // 2. Simulate pawaPay webhook (HMAC verified)
    const webhookPayload = {
      webhook_id: 'webhook-uuid-here',
      event_type: 'deposit.completed',
      deposit_id: depositId,
      status: 'CONFIRMED',
      amount_xaf: 50000
    };

    const signature = generateHmacSignature(webhookPayload, PAWAPAY_WEBHOOK_SECRET);

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/webhooks/pawapay',
      headers: { 'x-pawapay-signature': signature },
      payload: webhookPayload
    });

    expect(webhookRes.statusCode).toBe(200);

    // 3. Wait for async job to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. Verify wallet was credited
    const balanceRes = await app.inject({
      method: 'GET',
      url: '/wallet/balance',
      headers: { authorization: `Bearer ${userToken}` }
    });

    expect(balanceRes.json().balance_xaf).toBe(50000);
  });

  it('should retry payment on 30s timeout job', async () => {
    // Create payment with stuck status
    const depositRes = await app.inject({
      method: 'POST',
      url: '/wallet/deposits',
      payload: {
        amount_xaf: 25000,
        operator: 'AIRTEL_GAB',
        phone_number: '+242771000129' // Timeout test number
      }
    });

    const depositId = depositRes.json().deposit_id;

    // Manually trigger retry job (normally runs every 30s)
    await queues.payments.add('retry-stuck-payments');

    // Mock pawaPay to return COMPLETED on second check
    mockPawapay.checkStatus.mockResolvedValueOnce({
      status: 'COMPLETED'
    });

    // Let job process
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify payment now shows as completed
    const payment = await db.query.payments.findFirst({
      where: eq(payments.pawapay_id, depositId)
    });

    expect(payment.status).toBe('CONFIRMED');
  });

  it('should handle daily limit enforcement', async () => {
    // Make 30 deposits (at limit)
    for (let i = 0; i < 30; i++) {
      await app.inject({
        method: 'POST',
        url: '/wallet/deposits',
        payload: {
          amount_xaf: 30000,
          operator: 'AIRTEL_GAB',
          phone_number: '+24177112345'
        }
      });
    }

    // 31st should fail
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/deposits',
      payload: {
        amount_xaf: 1000,
        operator: 'AIRTEL_GAB',
        phone_number: '+24177112345'
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Daily transaction limit');
  });
});
```

#### 4. **E2E Tests: Trip Booking to Payment**

**File: `apps/api/src/e2e/booking-to-payment.test.ts`**

```typescript
describe('E2E: Booking → Trip Complete → Driver Payout', () => {
  it('should complete trip and credit both client and driver wallets', async () => {
    // 1. Client books ride (deposit 100k first)
    const clientDeposit = await depositMoney(clientId, 100000);

    // 2. Driver accepts trip (matching phase 2)
    const tripId = await bookTrip({
      client_id: clientId,
      pickup: [3.8480, 11.5021],
      dropoff: [3.8600, 11.5100]
    });

    await acceptTrip(driverId, tripId);

    // 3. Client completes trip
    await completeTrip(tripId);

    // 4. Verify:
    //   - Client charged ride + 15% commission = 15k + 2.25k
    //   - Driver receives 15k (no commission on earnings)
    //   - Admin receives 2.25k commission

    const clientBalance = await getWalletBalance(clientId);
    expect(clientBalance).toBe(100000 - 15000 - 2250); // 82,750

    const driverBalance = await getWalletBalance(driverId);
    expect(driverBalance).toBe(15000); // Full fare

    const adminBalance = await getAdminCommission();
    expect(adminBalance).toBe(2250);
  });
});
```

#### 5. **Local Docker Setup (CI/CD Ready)**

**File: `docker-compose.test.yml`**

```yaml
version: '3.9'
services:
  postgres:
    image: postgis/postgis:16-3.3
    environment:
      POSTGRES_DB: hellodriver_test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
    volumes:
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  # Mock pawaPay server (optional, for webhook testing)
  mock-pawapay:
    image: mockserver/mockserver:latest
    ports:
      - "1080:1080"
    environment:
      MOCKSERVER_INITIALIZATION_JSON_PATH: /config/mockserver-init.json
    volumes:
      - ./test/fixtures/mock-pawapay.json:/config/mockserver-init.json
```

**Run tests locally:**

```bash
docker-compose -f docker-compose.test.yml up -d
npm run test:integration -- wallet.integration.test.ts
```

---

## Key Implementation Checklist

- [ ] Schema migrations (payments, webhook_logs, payment_idempotency)
- [ ] Services: pawapay-client (with mock), payment-validation, webhook-processor
- [ ] Routes: POST /wallet/deposits, POST /wallet/payouts, GET /wallet/balance, POST /webhooks/pawapay
- [ ] BullMQ worker: retry-stuck-payments (every 30s polling)
- [ ] Socket.io events: wallet:credited, wallet:debited, payout:status
- [ ] HMAC verification (constant-time)
- [ ] Idempotency enforcement (pre-store keys)
- [ ] Constraint validation (daily limits, operator limits, KYC)
- [ ] Integration tests (mock pawaPay, sandbox tests, E2E)
- [ ] Documentation: API specs, testing guide, deployment checklist

---

## Sources

- [pawaPay API Documentation - Testing](https://docs.pawapay.io/testing_the_api)
- [pawaPay - Live in Gabon](https://www.pawapay.io/blog/pawapay-live-in-gabon)
- [Webhook Best Practices - Payment Idempotency](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5)
- [Airtel Africa Developer Portal](https://developers.airtel.africa/)
- [Moov Documentation](https://docs.moov.io/)
- [Payment Webhook Security Patterns](https://www.pentesttesting.com/webhook-security-best-practices/)

