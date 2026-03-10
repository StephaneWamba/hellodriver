import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { config } from './config.js';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './errors.js';

export async function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV !== 'test'
        ? {
            level: 'info',
            ...(config.NODE_ENV === 'development'
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true, translateTime: 'HH:MM:ss' },
                  },
                }
              : {}),
          }
        : false,
    // Use crypto.randomUUID for request IDs (Node 22 — no polyfill needed)
    genReqId: () => crypto.randomUUID(),
    trustProxy: true, // Fly.io sits behind a proxy
  });

  // ── Zod type provider ────────────────────────────────────────────────────
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Sensible defaults ────────────────────────────────────────────────────
  await app.register(sensible);

  // ── App plugins (db, redis, bullmq, auth, sentry) ─────────────────────────
  await registerPlugins(app);

  // ── Global error handler ─────────────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ── Routes ───────────────────────────────────────────────────────────────
  await registerRoutes(app);

  return app;
}
