import type { FastifyInstance } from 'fastify';
import { Worker, UnrecoverableError } from 'bullmq';
import {
  processDepositWebhook,
  processPayoutWebhook,
  initiateDeposit,
} from '../services/payment.js';
import { eq, sql } from 'drizzle-orm';
import { payments } from '@hellodriver/db';
import { config } from '../config.js';

export interface PaymentPollJob {
  payment_id: string;
  deposit_id: string;
  attempt: number;
}

export interface PaymentWebhookJob {
  deposit_id?: string;
  payout_id?: string;
  status: 'COMPLETED' | 'FAILED' | 'EXPIRED';
  webhook_payload: unknown;
}

export interface PaymentInitiateDepositJob {
  trip_id: string;
  user_id: string;
  amount_xaf: number;
  msisdn: string;
  operator: 'AIRTEL_GABON' | 'MOOV_GABON';
}

export interface PayoutPollJob {
  payment_id: string;
  payout_id: string;
  attempt: number;
}

export interface PayoutWebhookJob {
  payout_id: string;
  status: 'COMPLETED' | 'FAILED' | 'EXPIRED';
  webhook_payload: unknown;
}

/**
 * Start BullMQ worker for payment jobs (deposits + async webhooks)
 * Handles:
 *   'payment:poll' — check deposit status, call webhook processor if completed/failed
 *   'payment:process_webhook' — process deposit webhook (credit wallet)
 *   'payment:initiate_deposit' — initiate deposit for async trip payment flows
 */
export function startPaymentWorker(app: FastifyInstance): Worker {
  const worker = new Worker<PaymentPollJob | PaymentWebhookJob | PaymentInitiateDepositJob>(
    'payments',
    async (job) => {
      if (job.name === 'payment:poll') {
        const jobData = job.data as PaymentPollJob;
        app.log.debug({ jobData }, 'payment:poll job started');

        // Check deposit status from pawaPay
        const status = await app.pawapay!.getDepositStatus(jobData.deposit_id);

        if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'EXPIRED') {
          // Terminal state — process webhook
          await processDepositWebhook(app, jobData.deposit_id, status.status, status);
        } else if (status.status === 'SUBMITTED') {
          // Still pending — job will be retried automatically by BullMQ
          app.log.debug({ depositId: jobData.deposit_id }, 'Deposit still SUBMITTED, will retry');
        }
        // If ACCEPTED, still waiting for user confirmation — will retry
      } else if (job.name === 'payment:process_webhook') {
        const jobData = job.data as PaymentWebhookJob;
        app.log.debug({ jobData }, 'payment:process_webhook job started');

        if (jobData.deposit_id) {
          await processDepositWebhook(
            app,
            jobData.deposit_id,
            jobData.status,
            jobData.webhook_payload
          );
        } else if (jobData.payout_id) {
          // This shouldn't happen (payout webhooks use payout worker), but guard anyway
          app.log.warn({ jobData }, 'Received payout webhook in payment worker');
        }
      } else if (job.name === 'payment:initiate_deposit') {
        const jobData = job.data as PaymentInitiateDepositJob;
        app.log.debug({ jobData }, 'payment:initiate_deposit job started');

        // Look up user's phone number from database
        const users = await app.db.execute(sql`SELECT phone FROM users WHERE id = ${jobData.user_id}`);
        const user = users.rows[0] as any;

        if (!user) {
          throw new UnrecoverableError(`User ${jobData.user_id} not found`);
        }

        // Initiate deposit (will enqueue polling job)
        await initiateDeposit(
          app,
          jobData.user_id,
          jobData.amount_xaf,
          user.phone as string,
          jobData.operator,
          jobData.trip_id
        );
      }
    },
    {
      connection: config.REDIS_URL,
      concurrency: 5, // Process up to 5 jobs in parallel
    }
  );

  // Error handling
  worker.on('failed', (job, err) => {
    app.log.error(
      { jobId: job?.id, jobName: job?.name, err: err.message, attempt: job?.attemptsMade },
      'payment job failed'
    );
  });

  worker.on('error', (err) => {
    app.log.error({ err }, 'payment worker error');
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await worker.close();
  });

  return worker;
}

/**
 * Start BullMQ worker for payout jobs
 * Handles:
 *   'payout:poll' — check payout status, call webhook processor if terminal
 *   'payout:process_webhook' — process payout webhook (confirm or reverse)
 */
export function startPayoutWorker(app: FastifyInstance): Worker {
  const worker = new Worker<PayoutPollJob | PayoutWebhookJob>(
    'payouts',
    async (job) => {
      if (job.name === 'payout:poll') {
        const jobData = job.data as PayoutPollJob;
        app.log.debug({ jobData }, 'payout:poll job started');

        // Check payout status from pawaPay
        const status = await app.pawapay!.getPayoutStatus(jobData.payout_id);

        if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'EXPIRED') {
          // Terminal state — enqueue webhook job
          await app.queues.payouts.add(
            'payout:process_webhook',
            {
              payout_id: jobData.payout_id,
              status: status.status,
              webhook_payload: status,
            },
            { attempts: 3, removeOnFail: false }
          );
        } else {
          // Still pending — job will retry automatically
          app.log.debug({ payoutId: jobData.payout_id }, 'Payout still SUBMITTED, will retry');
        }
      } else if (job.name === 'payout:process_webhook') {
        const jobData = job.data as PayoutWebhookJob;
        app.log.debug({ jobData }, 'payout:process_webhook job started');

        // Import here to avoid circular dependency
        const { processPayoutWebhook } = await import('../services/payment.js');

        await processPayoutWebhook(
          app,
          jobData.payout_id,
          jobData.status,
          jobData.webhook_payload
        );
      }
    },
    {
      connection: config.REDIS_URL,
      concurrency: 5,
    }
  );

  // Error handling
  worker.on('failed', (job, err) => {
    app.log.error(
      { jobId: job?.id, jobName: job?.name, err: err.message, attempt: job?.attemptsMade },
      'payout job failed'
    );
  });

  worker.on('error', (err) => {
    app.log.error({ err }, 'payout worker error');
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await worker.close();
  });

  return worker;
}
