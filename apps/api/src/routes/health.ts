import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export async function healthRoutes(app: FastifyInstance) {
  // GET /health — used by Fly.io health checks + BetterStack uptime monitoring
  app.get('/health', async (_request, reply) => {
      const checks = await Promise.allSettled([
        // DB: simple query
        app.db.execute(sql`SELECT 1`),
        // Redis: ping
        app.redis.ping(),
      ]);

      const dbOk = checks[0]?.status === 'fulfilled';
      const redisOk = checks[1]?.status === 'fulfilled';
      const healthy = dbOk && redisOk;

      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? 'ok' : 'degraded',
        version: process.env['npm_package_version'] ?? '0.0.1',
        timestamp: new Date().toISOString(),
        services: {
          database: dbOk ? 'ok' : 'unreachable',
          redis: redisOk ? 'ok' : 'unreachable',
        },
      });
  });
}
