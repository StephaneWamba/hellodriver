# Payment System E2E Testing Guide

## Current Status ✓

### Infrastructure Ready
- ✅ PostgreSQL 16 with PostGIS (Supabase eu-north-1)
- ✅ Redis TCP (Railway)
- ✅ Fastify API (Fly.io jnb)
- ✅ BullMQ workers (payments + payouts)

### Deployment Status
- ✅ API deployed to hellodriver-api.fly.dev (v8)
- ✅ Health check passing
- ✅ Payment routes registered and responding
- ✅ Authentication middleware enforcing JWT validation

---

## Quick Validation Tests (No Auth Required)

### Test 1: Health Check
```bash
curl https://hellodriver-api.fly.dev/health | jq .
```

Expected response:
```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2026-03-10T22:34:56.730Z",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Test 2: Fare Estimation (Public)
```bash
curl -X POST https://hellodriver-api.fly.dev/trips/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": -0.628, "lon": 13.234},
    "destination": {"lat": -0.638, "lon": 13.244},
    "vehicle_category": "standard"
  }' | jq .
```

### Test 3: Auth Validation (Expected 401)
```bash
curl -X GET https://hellodriver-api.fly.dev/payments/wallet \
  -H "Authorization: Bearer invalid-token" | jq .
```

Expected response (confirms auth middleware is working):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

---

## Full Payment Testing (Requires JWT Token)

### Step 1: Get JWT Secret
You have **three** options:

#### Option A: Use Fly.io CLI (Recommended)
```bash
# List secrets
flyctl secrets list -a hellodriver-api

# The SUPABASE_JWT_SECRET is deployed but encrypted
# You need access to the project to decrypt it
# Ask the project owner or check GitHub Actions logs
```

#### Option B: GitHub Actions Secrets
Go to: https://github.com/StephaneWamba/hellodriver/settings/secrets/actions
- Look for `SUPABASE_JWT_SECRET`
- This is the value deployed to Fly.io

#### Option C: Supabase Dashboard
1. Go to: https://app.supabase.com
2. Project: hellodriver
3. Settings → API → JWT Secret
4. Copy the secret value

### Step 2: Generate Test JWT Token
```bash
# Once you have the JWT secret:
export SUPABASE_JWT_SECRET="your-secret-from-above"

# Generate a test JWT (valid for 24 hours)
node scripts/gen-jwt.js

# Output will show the token and example curl command
```

### Step 3: Create Test User in Database
```sql
-- Create a test payer user
INSERT INTO users (id, auth_id, phone, full_name, role, created_at)
VALUES (
  gen_random_uuid(),
  '8d908cc2-6767-41a7-8ac2-2883006668ed',  -- matches JWT sub
  '+24107654321',
  'Test Payer',
  'client',
  now()
)
ON CONFLICT (auth_id) DO NOTHING;

-- View wallet
SELECT balance_xaf FROM wallets WHERE user_id = (
  SELECT id FROM users WHERE auth_id = '8d908cc2-6767-41a7-8ac2-2883006668ed'
);
```

### Test 4: Get Wallet (Auth Required)
```bash
JWT="your-token-from-gen-jwt.js"

curl -X GET https://hellodriver-api.fly.dev/payments/wallet \
  -H "Authorization: Bearer $JWT" | jq .
```

Expected response:
```json
{
  "user_id": "...",
  "balance_xaf": 0,
  "wallet_transactions": []
}
```

### Test 5: Initiate Deposit (Airtel Money)
```bash
JWT="your-token"

curl -X POST https://hellodriver-api.fly.dev/payments/deposits \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 50000,
    "msisdn": "+24177112345",
    "operator": "AIRTEL_GABON"
  }' | jq .
```

Expected response:
```json
{
  "id": "payment-uuid",
  "status": "pending_user_approval",
  "amount_xaf": 50000,
  "pawapay_deposit_id": "deposit-uuid",
  "created_at": "2026-03-10T22:45:00Z"
}
```

### Test 6: Webhook HMAC Verification
```bash
# Simulate a pawaPay webhook callback
PAYLOAD='{"depositId":"deposit-uuid","status":"COMPLETED","amount":"50000","currency":"XAF"}'

# Create HMAC signature (requires PAWAPAY_WEBHOOK_SECRET)
# See: pawapay-webhook-test.sh

curl -X POST https://hellodriver-api.fly.dev/payments/webhooks/pawapay \
  -H "Content-Type: application/json" \
  -H "x-pawapay-signature: sha256=<signature>" \
  -d "$PAYLOAD"
```

---

## Testing Checklist

- [ ] Test 1: Health check returns 200 with all services OK
- [ ] Test 2: Fare estimation returns correct fare structure
- [ ] Test 3: Invalid JWT returns 401 UNAUTHORIZED
- [ ] Test 4: Valid JWT allows access to /payments/wallet
- [ ] Test 5: Deposit initiation creates payment record with status pending_user_approval
- [ ] Test 6: Webhook HMAC validation rejects tampered payloads
- [ ] Test 7: Operator limits enforced (Airtel 500k/tx, Moov 300k/tx)
- [ ] Test 8: Insufficient wallet balance returns 402 error
- [ ] Test 9: Redis job queue is processing deposit/payout jobs
- [ ] Test 10: BullMQ workers logging no errors

---

## Debugging

### Check Redis Queue Status
```bash
# Connect to Railway Redis and inspect queue
redis-cli -u $REDIS_URL

# View pending jobs
> LRANGE bull:payments:wait 0 -1
> LRANGE bull:payouts:wait 0 -1

# View failed jobs
> LRANGE bull:payments:failed 0 -1
```

### Check PostgreSQL Payment Records
```bash
# View all payment records
SELECT id, user_id, amount_xaf, status, pawapay_deposit_id, created_at
FROM payments
ORDER BY created_at DESC
LIMIT 10;

# View wallet balance
SELECT user_id, balance_xaf FROM wallets
WHERE user_id IN (SELECT id FROM users WHERE phone = '+24107654321');

# View wallet transaction history
SELECT * FROM wallet_transactions
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;
```

### View API Logs
```bash
# Stream live logs from Fly.io
flyctl logs -a hellodriver-api --follow

# View specific time range
flyctl logs -a hellodriver-api --since 30m
```

### Test BullMQ Workers
```bash
# Check if workers are running
pnpm -F @hellodriver/api run test:workers

# View worker logs
flyctl logs -a hellodriver-api | grep -i "worker\|payment\|payout"
```

---

## Next Steps

1. **Get JWT Secret**: Follow Step 1 above
2. **Generate Token**: Run `node scripts/gen-jwt.js`
3. **Run Quick Tests**: Execute Tests 1-3 to verify deployment
4. **Create Test User**: Run the SQL from Step 3
5. **Full Payment Tests**: Execute Tests 4-6 with valid JWT
6. **Monitor**: Watch logs with `flyctl logs -a hellodriver-api --follow`

---

## Known Limitations

- Email signup rate limited by Supabase (use phone OTP in production)
- pawaPay sandbox requires test phone numbers (+242771XXXXX789 for success)
- Webhook testing requires PAWAPAY_WEBHOOK_SECRET (available in Fly.io secrets)
- Load testing should simulate 200ms latency + 5% packet loss (African network)
