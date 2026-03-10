import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  initiateDepositSchema,
  initiatePayoutSchema,
  pawapayWebhookSchema,
  type InitiateDepositBody,
  type InitiatePayoutBody,
} from '@hellodriver/validators';
import { payments, walletTransactions, wallets } from '@hellodriver/db';
import { AppError } from '../errors.js';
import { initiateDeposit, initiatePayout } from '../services/payment.js';
import { processDepositWebhook, processPayoutWebhook } from '../services/payment.js';
import crypto from 'crypto';

export async function paymentRoutes(app: FastifyInstance) {
  // Store raw body for webhook HMAC verification
  app.addContentTypeParser('application/json', (request, payload, done) => {
    let body = '';
    payload.on('data', (chunk) => {
      body += chunk.toString();
    });
    payload.on('end', () => {
      (request as any).rawBody = body;
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error);
      }
    });
    payload.on('error', done);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /deposits — Initiate wallet top-up or trip payment via mobile money
  // ─────────────────────────────────────────────────────────────────────────────
  app.post<{ Body: InitiateDepositBody }>(
    '/deposits',
    {
      preHandler: [app.authenticate],
      schema: {
        body: initiateDepositSchema,
      },
    },
    async (req, reply) => {
      const { amount_xaf, msisdn, operator, trip_id }: InitiateDepositBody = req.body;

      if (!app.pawapay) {
        return reply.status(503).send({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Payment service is not configured' },
        });
      }

      try {
        const payment = await initiateDeposit(
          app,
          req.userId,
          amount_xaf,
          msisdn,
          operator,
          trip_id
        );

        return reply.status(201).send({
          payment: {
            id: payment.id,
            amount_xaf: parseFloat(payment.amount_xaf),
            status: payment.status,
            created_at: payment.created_at,
          },
        });
      } catch (err) {
        throw err;
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /payouts — Initiate driver withdrawal to mobile money
  // ─────────────────────────────────────────────────────────────────────────────
  app.post<{ Body: InitiatePayoutBody }>(
    '/payouts',
    {
      preHandler: [app.authenticate],
      schema: {
        body: initiatePayoutSchema,
      },
    },
    async (req, reply) => {
      if (req.userRole !== 'driver') {
        throw AppError.forbidden('Only drivers can initiate payouts');
      }

      if (!app.pawapay) {
        return reply.status(503).send({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Payment service is not configured' },
        });
      }

      const { amount_xaf, msisdn, operator }: InitiatePayoutBody = req.body;

      try {
        const payment = await initiatePayout(app, req.userId, amount_xaf, msisdn, operator);

        return reply.status(201).send({
          payment: {
            id: payment.id,
            amount_xaf: parseFloat(payment.amount_xaf),
            status: payment.status,
            created_at: payment.created_at,
          },
        });
      } catch (err) {
        throw err;
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /wallet — Get wallet balance and recent transactions
  // ─────────────────────────────────────────────────────────────────────────────
  app.get(
    '/wallet',
    {
      preHandler: [app.authenticate],
    },
    async (req, reply) => {
      const [wallet] = await app.db
        .select()
        .from(wallets)
        .where(eq(wallets.user_id, req.userId));

      if (!wallet) {
        throw AppError.notFound('Wallet not found');
      }

      const recentTransactions = await app.db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.wallet_id, req.userId))
        .orderBy(walletTransactions.created_at)
        .limit(20);

      return reply.send({
        balance_xaf: parseFloat(wallet.balance_xaf.toString()),
        transactions: recentTransactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount_xaf: parseFloat(tx.amount_xaf.toString()),
          balance_after_xaf: parseFloat(tx.balance_after_xaf.toString()),
          reference_type: tx.reference_type,
          created_at: tx.created_at,
        })),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /:paymentId — Get payment details
  // ─────────────────────────────────────────────────────────────────────────────
  app.get(
    '/:paymentId',
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({
          paymentId: z.string().uuid(),
        }),
      },
    },
    async (req, reply) => {
      const { paymentId } = req.params as { paymentId: string };

      const [payment] = await app.db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId));

      if (!payment) {
        throw AppError.notFound('Payment not found');
      }

      // Access control: user can see own payments, admin can see all
      if (req.userRole !== 'admin' && payment.user_id !== req.userId) {
        throw AppError.forbidden('Cannot access this payment');
      }

      return reply.send({ payment });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /webhooks/pawapay — Receive and process pawaPay webhooks
  // ─────────────────────────────────────────────────────────────────────────────
  app.post(
    '/webhooks/pawapay',
    {},
    async (req, reply) => {
      // Get raw body for HMAC verification
      const rawBody = (req as any).rawBody as string;
      if (!rawBody) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Missing request body' },
        });
      }

      // Verify HMAC signature
      const signature = req.headers['x-pawapay-signature'] as string | undefined;
      if (!signature) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Missing signature header' },
        });
      }

      const [, sigValue] = signature.split('=');
      if (!sigValue) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid signature format' },
        });
      }

      const expected = crypto
        .createHmac('sha256', process.env.PAWAPAY_WEBHOOK_SECRET || '')
        .update(rawBody)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      let isValid = false;
      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(sigValue, 'hex')
        );
      } catch {
        isValid = false;
      }

      if (!isValid) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid signature' },
        });
      }

      // Parse webhook payload
      let webhook: any;
      try {
        webhook = JSON.parse(rawBody);
      } catch {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Invalid JSON' },
        });
      }

      // Determine if deposit or payout webhook
      const depositId = webhook.depositId;
      const payoutId = webhook.payoutId;
      const status = webhook.status as 'COMPLETED' | 'FAILED' | 'EXPIRED' | undefined;

      if (!status || !['COMPLETED', 'FAILED', 'EXPIRED'].includes(status)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Invalid webhook status' },
        });
      }

      // Redis deduplication: ensure we process each webhook only once
      const webhookId = depositId || payoutId;
      if (!webhookId) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Missing depositId or payoutId' },
        });
      }

      const seen = await app.redis.set(
        `pawapay:webhook:${webhookId}`,
        '1',
        'EX',
        604800, // 7 days
        'NX',
      );

      if (!seen) {
        // Webhook already processed
        app.log.debug({ webhookId }, 'Duplicate webhook, skipping');
        return reply.status(200).send({ status: 'acknowledged' });
      }

      // Enqueue job for async processing
      try {
        if (depositId) {
          await app.queues.payments.add(
            'payment:process_webhook',
            {
              deposit_id: depositId,
              status,
              webhook_payload: webhook,
            },
            { attempts: 3, removeOnFail: false }
          );
        } else if (payoutId) {
          await app.queues.payouts.add(
            'payout:process_webhook',
            {
              payout_id: payoutId,
              status,
              webhook_payload: webhook,
            },
            { attempts: 3, removeOnFail: false }
          );
        }
      } catch (err) {
        app.log.error({ webhookId, err }, 'Failed to enqueue webhook job');
        // Still return 200 to acknowledge receipt to pawaPay
      }

      // Always return 200 immediately to pawaPay
      return reply.status(200).send({ status: 'acknowledged' });
    }
  );
}
