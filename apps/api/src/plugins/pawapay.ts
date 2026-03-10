import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createPawapayClient } from '../services/pawapay.js';
import { config } from '../config.js';

export const pawapayPlugin = fp(async (app: FastifyInstance) => {
  if (!config.PAWAPAY_API_KEY) {
    app.log.warn('PAWAPAY_API_KEY not set — payment features disabled');
    app.decorate('pawapay', null);
    return;
  }

  const client = createPawapayClient(config.PAWAPAY_API_KEY, config.PAWAPAY_BASE_URL, {
    debug: (msg: string, data?: unknown) => app.log.debug({ msg, data }),
    error: (msg: string, err?: unknown) => app.log.error({ msg, err }),
  });

  app.decorate('pawapay', client);
});
