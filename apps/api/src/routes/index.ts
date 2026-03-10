import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { driverRoutes } from './drivers.js';
import { locationRoutes } from './locations.js';
import { adminDriverRoutes } from './admin/drivers.js';
import { tripRoutes } from './trips.js';
import { paymentRoutes } from './payments.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(driverRoutes, { prefix: '/drivers' });
  await app.register(locationRoutes, { prefix: '/locations' });
  await app.register(adminDriverRoutes, { prefix: '/admin' });
  await app.register(tripRoutes, { prefix: '/trips' });
  await app.register(paymentRoutes, { prefix: '/payments' });

  // Phase 5+ routes registered here as they are built:
  // await app.register(whatsappRoutes, { prefix: '/webhooks/whatsapp' });
}
