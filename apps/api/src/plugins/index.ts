import type { FastifyInstance } from 'fastify';
import { sentryPlugin } from './sentry.js';
import { dbPlugin } from './db.js';
import { redisPlugin } from './redis.js';
import { bullmqPlugin } from './bullmq.js';
import { authPlugin } from './auth.js';

export async function registerPlugins(app: FastifyInstance) {
  // Sentry first — so it can capture errors from subsequent plugin initialization
  await app.register(sentryPlugin);

  // Infrastructure
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(bullmqPlugin);

  // Auth (depends on db for user lookup)
  await app.register(authPlugin);
}
