# Phase 3 Payment Testing — Next Steps (Manual)

## Current Status
✅ **API is deployed and operational**
- All payment routes working correctly
- Request validation functioning (catches invalid phone, amounts, operators)
- Auth middleware enforcing JWT verification
- Both Supabase and Redis are healthy

⏳ **Awaiting Test User Setup**
- Need to create test user in Supabase
- Need to generate valid JWT token
- Then can test complete payment flows

## Manual Actions Required

### 1. Create Test User in Supabase (5 minutes)

**Step 1a: Open Supabase SQL Editor**
- Go to: https://supabase.com/dashboard/project/qfuaqpzxgcfaupwxusvx/sql
- Copy and execute this SQL:

```sql
-- Create test user
INSERT INTO users (id, auth_id, phone, first_name, last_name, role, created_at)
VALUES (
  'test-user-' || gen_random_uuid()::text,
  'auth-test-' || gen_random_uuid()::text,
  '+24107654321',
  'Test',
  'Payer',
  'user',
  now()
)
RETURNING id, auth_id;
```

**Step 1b: Copy the returned `auth_id` (looks like: `auth-test-UUID`)**

**Step 1c: Create wallet for the user**

```sql
INSERT INTO wallets (user_id, balance_xaf, created_at)
SELECT id, 0, now()
FROM users WHERE phone = '+24107654321'
ON CONFLICT (user_id) DO NOTHING
RETURNING user_id, balance_xaf;
```

### 2. Generate Valid JWT Token (2 minutes)

**Using Node.js locally:**

```bash
node -e "
const jwt = require('jsonwebtoken');
const secret = 'YOUR_SUPABASE_JWT_SECRET_FROM_ENV';
const authId = 'AUTH_ID_FROM_STEP_1B';

const token = jwt.sign({
  sub: authId,
  aud: 'authenticated',
  role: 'authenticated',
  phone: '+24107654321'
}, secret, { algorithm: 'HS256', expiresIn: '1h' });

console.log('JWT Token:');
console.log(token);
"
```

**Using Python:**

```python
import jwt
import json

secret = "YOUR_SUPABASE_JWT_SECRET"
auth_id = "AUTH_ID_FROM_STEP_1B"

payload = {
    "sub": auth_id,
    "aud": "authenticated",
    "role": "authenticated",
    "phone": "+24107654321"
}

token = jwt.encode(payload, secret, algorithm="HS256")
print(f"JWT Token:\n{token}")
```

### 3. Test Deposit Flow (2 minutes)

Replace `$JWT_TOKEN` with the token from step 2:

```bash
curl -X POST "https://hellodriver-api.fly.dev/payments/deposits" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 10000,
    "msisdn": "+24107654321",
    "operator": "AIRTEL_GABON"
  }' | jq '.'
```

**Expected Response:**
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

### 4. Test Payout Flow (2 minutes)

```bash
curl -X POST "https://hellodriver-api.fly.dev/payments/payouts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xaf": 5000,
    "msisdn": "+24102654321",
    "operator": "MOOV_GABON"
  }' | jq '.'
```

### 5. Verify Job Processing (3 minutes)

Check if BullMQ jobs are being queued:

```bash
# Connect to Railway Redis
redis-cli -u "redis://default:PASSWORD@caboose.proxy.rlwy.net:22632"

# List payment jobs
KEYS "bull:payments:*"

# Check pending jobs
HGETALL "bull:payments:*:jobs"

# Check completed jobs
HGETALL "bull:payments:*:completed"
```

## Testing Validation Checklist

### ✅ Already Verified
- [x] Request validation works (invalid phone numbers rejected)
- [x] Amount validation works (negative amounts rejected)
- [x] Operator enum validation works
- [x] Auth middleware rejects invalid tokens
- [x] Health endpoint shows database + redis healthy
- [x] Routes are all registered and accessible

### ⏳ Awaiting Test User Setup
- [ ] Deposit with valid JWT creates wallet transaction
- [ ] Payout with valid JWT enforces balance check
- [ ] Operator daily limits are enforced
- [ ] BullMQ jobs are queued and processed
- [ ] Redis deduplication prevents duplicate processing
- [ ] Webhook HMAC signature verification works

## Quick Reference: Valid Gabon Phone Numbers

- **Airtel**: `+24107XXXXXX` (where X = 0-9, min 6 digits)
- **Moov**: `+24102XXXXXX` or `+24106XXXXXX`

Examples:
- `+24107654321` ✅ Valid Airtel
- `+24102654321` ✅ Valid Moov
- `+24106654321` ✅ Valid Moov
- `+242771234567` ❌ Invalid format
- `+24101234567` ❌ Invalid operator digit (1)

## Troubleshooting

**"Invalid or expired token" error:**
- JWT may have expired (check `expiresIn` in token generation)
- `sub` in token doesn't match database `auth_id`
- Token secret doesn't match `SUPABASE_JWT_SECRET`

**"User not found" error:**
- User with `auth_id` doesn't exist in database
- Check SQL output to confirm user was created

**"Invalid Gabon phone number" error:**
- Phone must match regex: `^\+2410[267]\d{6,7}$`
- Must have +241, digit 0, then [267], then 6-7 more digits

## Files Reference

- API: https://hellodriver-api.fly.dev
- Supabase SQL Editor: https://supabase.com/dashboard/project/qfuaqpzxgcfaupwxusvx/sql
- Testing Plan: [PHASE_3_TESTING.md](PHASE_3_TESTING.md)
- Payment Design: [PHASE_3_PAYMENTS.md](PHASE_3_PAYMENTS.md)

## Environment Variables Needed

For token generation, you'll need:
- `SUPABASE_JWT_SECRET` — From Supabase project settings
- `AUTH_ID` — From SQL query result in step 1b

These are already configured in Fly.io but you need them locally for token generation.

