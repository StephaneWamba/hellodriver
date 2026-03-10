import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createDb } from '@hellodriver/db';
import { config } from '../config.js';

export const dbPlugin = fp(async (app: FastifyInstance) => {
  const db = createDb(config.DATABASE_URL);

  app.decorate('db', db);

  app.addHook('onClose', async () => {
    app.log.info('Closing database pool…');
    // drizzle-orm/node-postgres doesn't expose pool.end() directly
    // Access via the underlying pg Pool if needed for graceful shutdown
  });
});
