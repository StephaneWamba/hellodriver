# Phase 3 Payment System — Testing & Verification Plan

## Current Status
- ✅ **Implementation**: All payment routes, workers, schemas deployed to production
- ✅ **Validation**: Request schema validation working correctly
- ✅ **Auth**: JWT verification enforced on all protected endpoints
- ✅ **Infrastructure**: Supabase, Railway Redis, Fly.io all healthy
- ⏳ **Auth Testing**: Need valid Supabase JWT for end-to-end testing

## Test Scenarios

### 1. Setup: Create Test User in Supabase

Execute in Supabase SQL Editor:
```sql
-- Create test user with phone number
INSERT INTO users (id, auth_id, phone, first_name, last_name, role, created_at)
VALUES (
  'test-user-' || gen_random_uuid()::text,
  'auth-test-' || gen_random_uuid()::text,
  '+24107654321',
  'Test',
  'User',
  'user',
  now()
)
ON CONFLICT (auth_id) DO NOTHING
RETURNING id, auth_id;

-- Create wallet with initial balance (0)
INSERT INTO wallets (user_id, balance_xaf, created_at)
SELECT id, 0, now()
FROM users WHERE phone = '+24107654321'
ON CONFLICT (user_id) DO NOTHING
RETURNING user_id, balance_xaf;
```

### 2. Get Valid JWT

**Option A: Use Supabase Auth API (Production)**
```bash
curl -X POST "https://qfuaqpzxgcfaupwxusvx.supabase.co/auth/v1/token" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "password",
    "email": "test-user@example.com",
    "password": "TestPassword123!"
  }'
```

**Option B: Generate JWT Manually (Testing)**
```bash
# Use the SUPABASE_JWT_SECRET to sign a JWT
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  sub: 'USER_ID_FROM_DATABASE',
  aud: 'authenticated',
  role: 'authenticated',
  phone: '+24107654321'
}, 'YOUR_SUPABASE_JWT_SECRET', { algorithm: 'HS256' });
console.log(token);
"
```

### 3. Test Deposit Endpoint

```bash
curl -X POST "https://hellodriver-api.fly.dev/payments/deposits" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 10000,
    "msisdn": "+24107654321",
    "operator": "AIRTEL_GABON"
  }'
```

**Expected Response**:
```json
{
  "data": {
    "payment_id": "uuid",
    "status": "INITIATED",
    "amount_xaf": 10000,
    "operator": "AIRTEL_GABON",
    "wallet_transaction_id": "uuid"
  }
}
```

### 4. Test Payout Endpoint

```bash
curl -X POST "https://hellodriver-api.fly.dev/payments/payouts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 5000,
    "msisdn": "+24102654321",
    "operator": "MOOV_GABON"
  }'
```

### 5. Test Webhook Verification

```bash
# Create a test webhook payload
PAYLOAD='{
  "id":"deposit-123",
  "status":"COMPLETED",
  "amount":10000
}'

# Generate HMAC signature
TIMESTAMP=$(date +%s)
MSG="${PAYLOAD}${TIMESTAMP}"
HMAC=$(echo -n "$MSG" | openssl dgst -sha256 -hmac "$PAWAPAY_WEBHOOK_SECRET" | cut -d' ' -f2)

# Send webhook
curl -X POST "https://hellodriver-api.fly.dev/payments/webhooks/pawapay" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $HMAC" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

### 6. Verify BullMQ Job Processing

Check if jobs are being processed:
```bash
# Connect to Railway Redis
redis-cli -u "redis://default:PASSWORD@caboose.proxy.rlwy.net:22632"

# List active jobs
KEYS "bull:payments:*"
HGETALL "bull:payments:completed"
HGETALL "bull:payments:failed"
```

### 7. Test Operator Limits

**Airtel (500k/tx, 1M/day limit)**:
```bash
# This should succeed
curl -X POST "https://hellodriver-api.fly.dev/payments/deposits" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 500000,
    "msisdn": "+24107654321",
    "operator": "AIRTEL_GABON"
  }'

# This should fail (exceeds limit)
curl -X POST "https://hellodriver-api.fly.dev/payments/deposits" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 600000,
    "msisdn": "+24107654321",
    "operator": "AIRTEL_GABON"
  }'
```

## Validation Checklist

- [ ] Request validation catches missing fields
- [ ] Phone number format validation enforces +2410[267]XXXXXX
- [ ] Amount validation enforces positive integers
- [ ] Operator limit enforcement (Airtel: 500k, Moov: 300k)
- [ ] Auth middleware rejects invalid tokens
- [ ] Auth middleware requires user to exist in database
- [ ] Deposits create wallet transactions (immutable)
- [ ] Payouts enforce sufficient wallet balance
- [ ] HMAC verification prevents spoofed webhooks
- [ ] Redis deduplication prevents duplicate webhook processing
- [ ] BullMQ jobs are enqueued and processed
- [ ] Health endpoint shows both database and redis healthy

## Load Testing

Use k6 for load testing (10 concurrent users, 100 requests):

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({
    amount_xaf: 10000,
    msisdn: '+24107654321',
    operator: 'AIRTEL_GABON',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.JWT_TOKEN}`,
    },
  };

  const response = http.post(
    'https://hellodriver-api.fly.dev/payments/deposits',
    payload,
    params
  );

  check(response, {
    'status is 200 or 400': (r) => r.status === 200 || r.status === 400,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

## Notes

- All monetary values in XAF (no decimals)
- Phone numbers must start with +241 (Gabon country code)
- Payment state machine: INITIATED → PROCESSING → CONFIRMED/FAILED
- Wallet transactions are immutable (no updates/deletes)
- Operator limits reset daily (00:00 UTC)
- Webhook payloads must be signed with HMAC SHA256

