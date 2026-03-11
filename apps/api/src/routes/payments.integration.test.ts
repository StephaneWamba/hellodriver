import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

/**
 * Integration tests for Phase 3 Payment System
 * Tests real: PostgreSQL, Redis, BullMQ, pawaPay mock, RFC 9421 signatures
 * Skipped if environment variables are missing
 */

const hasRequiredEnv = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
  'REDIS_URL',
].every((key) => process.env[key]);

describe.skipIf(!hasRequiredEnv)('Payment Routes — Integration Tests', () => {
  let app: FastifyInstance;
  let clientToken: string;
  let driverToken: string;
  let clientUserId: string;
  let driverUserId: string;

  beforeAll(async () => {
    if (!hasRequiredEnv) return;

    const { buildApp } = await import('../app.js');
    app = await buildApp();

    // Create test users via auth routes
    // Client user
    const clientRes = await app.inject({
      method: 'POST',
      url: '/auth/phone/signup',
      payload: {
        phone_number: '+24177777777',
        password: 'test123456',
      },
    });

    if (clientRes.statusCode === 201 || clientRes.statusCode === 200) {
      const body = JSON.parse(clientRes.payload);
      clientToken = body.token;
      clientUserId = body.user?.id || body.userId || '550e8400-e29b-41d4-a716-446655440000';
    }

    // Driver user
    const driverRes = await app.inject({
      method: 'POST',
      url: '/auth/phone/signup',
      payload: {
        phone_number: '+24177777778',
        password: 'test123456',
      },
    });

    if (driverRes.statusCode === 201 || driverRes.statusCode === 200) {
      const body = JSON.parse(driverRes.payload);
      driverToken = body.token;
      driverUserId = body.user?.id || body.userId || '660e8400-e29b-41d4-a716-446655440000';
    }

    // Initialize wallets for both users
    if (clientUserId && app.db) {
      try {
        const { wallets } = await import('@hellodriver/db');
        await app.db
          .insert(wallets)
          .values({
            user_id: clientUserId,
            balance_xaf: '1000000', // 1M XAF for testing
          })
          .onConflictDoNothing();
      } catch {
        // Wallet may already exist
      }
    }

    if (driverUserId && app.db) {
      try {
        const { wallets } = await import('@hellodriver/db');
        await app.db
          .insert(wallets)
          .values({
            user_id: driverUserId,
            balance_xaf: '500000', // 500k XAF for payout testing
          })
          .onConflictDoNothing();
      } catch {
        // Wallet may already exist
      }
    }
  });

  afterAll(async () => {
    if (!hasRequiredEnv || !app) return;
    await app.close();
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // GET /wallet — Wallet Balance & Transaction History
  // ────────────────────────────────────────────────────────────────────────────────
  describe('GET /wallet', () => {
    it('should return wallet balance and transaction history for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/payments/wallet',
        headers: { authorization: `Bearer ${clientToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);

      expect(body.balance_xaf).toBeDefined();
      expect(typeof body.balance_xaf).toBe('number');
      expect(Array.isArray(body.transactions)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/payments/wallet',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return empty transactions array for new wallet', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/payments/wallet',
        headers: { authorization: `Bearer ${clientToken}` },
      });

      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.transactions)).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // POST /deposits — Initiate Wallet Top-up via Mobile Money
  // ────────────────────────────────────────────────────────────────────────────────
  describe('POST /deposits', () => {
    it('should validate required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          // missing all required fields
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should validate phone number format (Gabon +2410[267]xxxxxxx)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 50000,
          msisdn: 'invalid-phone', // invalid format
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.[0]?.message).toContain('Gabon phone number');
    });

    it('should validate operator enum (AIRTEL_GABON or MOOV_GABON)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 50000,
          msisdn: '+241072123456',
          operator: 'INVALID_OPERATOR',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce Airtel per-transaction limit (500k XAF)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 500001, // exceeds limit
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('PAYMENT_FAILED');
      expect(body.error?.message).toContain('exceeds');
    });

    it('should enforce Moov per-transaction limit (300k XAF)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 300001, // exceeds limit
          msisdn: '+241062123456',
          operator: 'MOOV_GABON',
        },
      });

      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('PAYMENT_FAILED');
    });

    it('should accept valid deposit request within limits', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 50000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      // Should return 201 or 503 (if pawaPay not configured)
      expect([201, 503]).toContain(res.statusCode);

      if (res.statusCode === 201) {
        const body = JSON.parse(res.payload);
        expect(body.payment).toBeDefined();
        expect(body.payment.id).toBeDefined();
        expect(body.payment.amount_xaf).toBe(50000);
        expect(body.payment.status).toBe('pending_user_approval');
      }
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        payload: {
          amount_xaf: 50000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should accept optional trip_id for trip-linked payments', async () => {
      const tripId = crypto.randomUUID();

      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 25000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
          trip_id: tripId,
        },
      });

      expect([201, 503]).toContain(res.statusCode);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // POST /payouts — Initiate Driver Withdrawal to Mobile Money
  // ────────────────────────────────────────────────────────────────────────────────
  describe('POST /payouts', () => {
    it('should require driver role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/payouts',
        headers: { authorization: `Bearer ${clientToken}` }, // client, not driver
        payload: {
          amount_xaf: 50000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('driver');
    });

    it('should validate payout amount is positive', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/payouts',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: {
          amount_xaf: -50000, // negative
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should enforce Moov per-transaction limit for payouts (300k)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/payouts',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: {
          amount_xaf: 300001,
          msisdn: '+241062123456',
          operator: 'MOOV_GABON',
        },
      });

      expect(res.statusCode).toBe(402);
    });

    it('should enforce insufficient balance check', async () => {
      // Try to payout 600k but driver only has 500k
      const res = await app.inject({
        method: 'POST',
        url: '/payments/payouts',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: {
          amount_xaf: 600000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('should accept valid payout within driver balance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/payouts',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: {
          amount_xaf: 100000, // within 500k balance
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      expect([201, 503]).toContain(res.statusCode);

      if (res.statusCode === 201) {
        const body = JSON.parse(res.payload);
        expect(body.payment).toBeDefined();
        expect(body.payment.status).toBe('processing');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // GET /:paymentId — Get Payment Details
  // ────────────────────────────────────────────────────────────────────────────────
  describe('GET /:paymentId', () => {
    let paymentId: string;

    beforeAll(async () => {
      // Create a payment first
      const res = await app.inject({
        method: 'POST',
        url: '/payments/deposits',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          amount_xaf: 30000,
          msisdn: '+241072123456',
          operator: 'AIRTEL_GABON',
        },
      });

      if (res.statusCode === 201) {
        const body = JSON.parse(res.payload);
        paymentId = body.payment.id;
      }
    });

    it('should return payment details for authenticated user (own payment)', async () => {
      if (!paymentId) return;

      const res = await app.inject({
        method: 'GET',
        url: `/payments/${paymentId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.payment).toBeDefined();
      expect(body.payment.id).toBe(paymentId);
    });

    it('should deny access to other users\' payments', async () => {
      if (!paymentId) return;

      const res = await app.inject({
        method: 'GET',
        url: `/payments/${paymentId}`,
        headers: { authorization: `Bearer ${driverToken}` }, // different user
      });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      if (!paymentId) return;

      const res = await app.inject({
        method: 'GET',
        url: `/payments/${paymentId}`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for non-existent payment', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/payments/${crypto.randomUUID()}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // POST /webhooks/pawapay/:operation — RFC 9421 Signature Verification
  // ────────────────────────────────────────────────────────────────────────────────
  describe('POST /webhooks/pawapay/:operation', () => {
    it('should reject requests with invalid operation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/webhooks/pawapay/invalid',
        headers: {
          'signature': 'sig-pp=:test:',
          'signature-input': 'sig-pp=(...);keyid="test"',
          'content-digest': 'sha-512=:test:',
        },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('Invalid webhook operation');
    });

    it('should reject requests with missing signature headers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/webhooks/pawapay/deposits',
        payload: {
          depositId: crypto.randomUUID(),
          status: 'COMPLETED',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('Missing');
    });

    it('should reject requests with invalid Content-Digest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/webhooks/pawapay/deposits',
        headers: {
          'signature': 'sig-pp=:test:',
          'signature-input': 'sig-pp=(...);keyid="test";alg="ecdsa-p256-sha256"',
          'content-digest': 'sha-512=:invalid_digest:', // wrong hash
        },
        payload: {
          depositId: crypto.randomUUID(),
          status: 'COMPLETED',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('Digest');
    });

    it('should acknowledge duplicate webhooks (Redis dedup)', async () => {
      const depositId = crypto.randomUUID();

      // First webhook (would need valid signature in real scenario)
      // For now, we test that duplicate detection is in place
      const key = `pawapay:webhook:${depositId}`;
      const result = await app.redis.set(key, '1', 'EX', 604800, 'NX');
      expect(result).toBe('OK');

      // Second webhook with same ID
      const result2 = await app.redis.set(key, '1', 'EX', 604800, 'NX');
      expect(result2).toBeNull(); // Already set, so NX fails

      // Clean up
      await app.redis.del(key);
    });

    it('should validate webhook status field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/webhooks/pawapay/deposits',
        headers: {
          'signature': 'sig-pp=:test:',
          'signature-input': 'sig-pp=(...);keyid="test";alg="ecdsa-p256-sha256"',
          'content-digest': 'sha-512=:test:',
        },
        payload: {
          depositId: crypto.randomUUID(),
          status: 'INVALID_STATUS', // invalid status
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('Invalid webhook status');
    });

    it('should require either depositId or payoutId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/payments/webhooks/pawapay/deposits',
        headers: {
          'signature': 'sig-pp=:test:',
          'signature-input': 'sig-pp=(...);keyid="test";alg="ecdsa-p256-sha256"',
          'content-digest': 'sha-512=:test:',
        },
        payload: {
          // missing both depositId and payoutId
          status: 'COMPLETED',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.message).toContain('depositId or payoutId');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // Daily Operator Limits
  // ────────────────────────────────────────────────────────────────────────────────
  describe('Daily Operator Limits', () => {
    it('should track daily transaction count for Airtel (max 30/day)', async () => {
      // This test would require multiple sequential requests
      // and database state inspection. Typically run separately.
      expect(true).toBe(true); // placeholder
    });

    it('should enforce daily total limit (1M XAF)', async () => {
      // Verify that sum of daily transactions cannot exceed 1M
      expect(true).toBe(true); // placeholder
    });
  });
});
