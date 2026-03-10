import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { driverRoutes } from './drivers.js';
import { locationRoutes } from './locations.js';
import { adminDriverRoutes } from './admin/drivers.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(driverRoutes, { prefix: '/drivers' });
  await app.register(locationRoutes, { prefix: '/locations' });
  await app.register(adminDriverRoutes, { prefix: '/admin' });

  // Phase 2+ routes registered here as they are built:
  // await app.register(tripRoutes, { prefix: '/trips' });
  // await app.register(paymentRoutes, { prefix: '/payments' });
  // await app.register(whatsappRoutes, { prefix: '/webhooks/whatsapp' });
}
