import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });

  // Phase 1+ routes registered here as they are built:
  // await app.register(driverRoutes, { prefix: '/drivers' });
  // await app.register(tripRoutes, { prefix: '/trips' });
  // await app.register(paymentRoutes, { prefix: '/payments' });
  // await app.register(whatsappRoutes, { prefix: '/webhooks/whatsapp' });
  // await app.register(adminRoutes, { prefix: '/admin' });
}
