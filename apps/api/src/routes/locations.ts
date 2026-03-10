import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { driverLocationSchema, type DriverLocationPayload } from '@hellodriver/validators';
import { driverLocations, driverProfiles } from '@hellodriver/db';
import { AppError } from '../errors.js';

export async function locationRoutes(app: FastifyInstance) {
  // ── PATCH /locations/me ─────────────────────────────────────────────────
  // GPS REST ping (fallback when Socket.io not connected)
  // Writes to Redis immediately, PostgreSQL only if last write >10s ago
  app.patch<{ Body: DriverLocationPayload }>(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: { body: driverLocationSchema },
    },
    async (request, reply) => {
      const { lat, lon, heading, speed_kmh, accuracy_m } = request.body;

      // Check if user is a driver
      const driver = await app.db.query.driverProfiles.findFirst({
        where: (dp) => eq(dp.user_id, request.userId),
      });

      if (!driver) {
        throw AppError.notFound('Driver profile not found');
      }

      // Always update Redis GEO immediately
      await app.redis.geoadd('drivers:geo', lon, lat, request.userId);

      // Refresh heartbeat (10s TTL)
      await app.redis.setex(`driver:${request.userId}:heartbeat`, 10, '1');

      // Gate PostgreSQL writes to every ~10s using NX (only if key was absent)
      const lastWriteKey = `driver:${request.userId}:last_pg_write`;
      const canWrite = await app.redis.set(lastWriteKey, '1', 'EX', 10, 'NX');

      if (canWrite === 'OK') {
        // Write to PostgreSQL (durable record)
        const geomPoint = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;

        await app.db
          .insert(driverLocations)
          .values({
            driver_id: request.userId,
            location: geomPoint as any,
            heading: heading !== undefined ? String(heading) : null,
            speed_kmh: speed_kmh !== undefined ? String(speed_kmh) : null,
            is_available: true,
            is_online: true,
          })
          .onConflictDoUpdate({
            target: driverLocations.driver_id,
            set: {
              location: geomPoint as any,
              heading: heading !== undefined ? String(heading) : null,
              speed_kmh: speed_kmh !== undefined ? String(speed_kmh) : null,
              updated_at: new Date(),
            },
          });
      }

      return reply.send({ received: true });
    },
  );
}
