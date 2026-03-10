import { buildApp } from './app.js';
import { config } from './config.js';
import { startTripWorker } from './workers/trips.js';
import { startPaymentWorker, startPayoutWorker } from './workers/payments.js';

const app = await buildApp();
startTripWorker(app);
startPaymentWorker(app);
startPayoutWorker(app);

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(
    `Hello Driver API running on ${config.HOST}:${config.PORT} [${config.NODE_ENV}]`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`${signal} received — shutting down gracefully`);
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
