import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config.js';

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const redis = new Redis(config.REDIS_URL, {
    // TCP — never Upstash HTTP
    lazyConnect: false,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    // Reconnect strategy: exponential backoff, max 30s
    retryStrategy(times) {
      const delay = Math.min(times * 200, 30_000);
      app.log.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting…');
      return delay;
    },
  });

  redis.on('connect', () => app.log.info('Redis connected'));
  redis.on('error', (err) => app.log.error({ err }, 'Redis error'));

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    app.log.info('Closing Redis connection…');
    await redis.quit();
  });
});
