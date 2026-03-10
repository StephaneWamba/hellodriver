import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  // GET /health — used by Fly.io health checks + BetterStack uptime monitoring
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const checks = await Promise.allSettled([
        // DB: simple query
        app.db.execute('SELECT 1' as unknown as any),
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
    },
  );
}
