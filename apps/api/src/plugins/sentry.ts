import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export const sentryPlugin = fp(async (app: FastifyInstance) => {
  if (!config.SENTRY_DSN || config.NODE_ENV === 'test') return;

  const Sentry = await import('@sentry/node');

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  app.addHook('onError', async (_request, _reply, error) => {
    // Only capture 5xx errors — business logic errors are intentional
    if (!('statusCode' in error) || (error as { statusCode: number }).statusCode >= 500) {
      Sentry.captureException(error);
    }
  });

  app.addHook('onClose', async () => {
    await Sentry.close(2_000);
  });

  app.log.info('Sentry initialized');
});
