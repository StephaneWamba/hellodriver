import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { config } from '../config.js';

// BullMQ queues. NOT used for trip matching (sync) — only for:
//   - notifications: push, SMS, WhatsApp outbound
//   - payments: pawaPay deposit/payout retry logic
//   - payouts: scheduled driver payouts
//   - trips: bid expiry (60s timeout)

const CONNECTION = { url: config.REDIS_URL };

const QUEUE_DEFAULTS = {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2_000 },
    removeOnComplete: { age: 86_400 }, // keep 24h for audit
    removeOnFail: false, // NEVER remove failed payment jobs
  },
};

export const bullmqPlugin = fp(async (app: FastifyInstance) => {
  const notificationsQueue = new Queue('notifications', {
    connection: CONNECTION,
    ...QUEUE_DEFAULTS,
  });

  const paymentsQueue = new Queue('payments', {
    connection: CONNECTION,
    ...QUEUE_DEFAULTS,
    defaultJobOptions: {
      ...QUEUE_DEFAULTS.defaultJobOptions,
      // Payments need longer retry window
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });

  const payoutsQueue = new Queue('payouts', {
    connection: CONNECTION,
    ...QUEUE_DEFAULTS,
  });

  const tripsQueue = new Queue('trips', {
    connection: CONNECTION,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1_000 },
      removeOnComplete: { age: 86_400 }, // keep 24h for audit
      removeOnFail: false,
    },
  });

  app.decorate('queues', {
    notifications: notificationsQueue,
    payments: paymentsQueue,
    payouts: payoutsQueue,
    trips: tripsQueue,
  });

  app.addHook('onClose', async () => {
    app.log.info('Closing BullMQ queues…');
    await Promise.all([
      notificationsQueue.close(),
      paymentsQueue.close(),
      payoutsQueue.close(),
      tripsQueue.close(),
    ]);
  });
});
