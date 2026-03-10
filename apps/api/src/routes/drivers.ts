import type { FastifyInstance } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  registerDriverSchema,
  registerVehicleSchema,
  documentUploadSchema,
  availabilitySchema,
  type RegisterDriverBody,
  type RegisterVehicleBody,
  type DocumentUploadBody,
  type AvailabilityPayload,
} from '@hellodriver/validators';
import { driverProfiles, vehicles, driverDocuments, driverLocations, users } from '@hellodriver/db';
import { AppError, ErrorCode } from '../errors.js';

export async function driverRoutes(app: FastifyInstance) {
  // ── POST /drivers/register ──────────────────────────────────────────────
  // Create driver profile and set role to 'driver'
  app.post<{ Body: RegisterDriverBody }>(
    '/register',
    {
      preHandler: [app.authenticate],
      schema: { body: registerDriverSchema },
    },
    async (request, reply) => {
      const { vehicle_category } = request.body;

      // Create driver profile
      const [profile] = await app.db
        .insert(driverProfiles)
        .values({
          user_id: request.userId,
          vehicle_category,
          verification_status: 'unverified',
        })
        .returning();

      if (!profile) {
        throw new AppError(ErrorCode.INTERNAL, 'Failed to create driver profile', 500);
      }

      // Update user role to 'driver'
      await app.db
        .update(users)
        .set({ role: 'driver' })
        .where(eq(users.id, request.userId));

      return reply.status(201).send({ profile });
    },
  );

  // ── POST /drivers/vehicles ──────────────────────────────────────────────
  // Add vehicle for driver
  app.post<{ Body: RegisterVehicleBody }>(
    '/vehicles',
    {
      preHandler: [app.authenticate],
      schema: { body: registerVehicleSchema },
    },
    async (request, reply) => {
      const { make, model, year, plate, color, category } = request.body;

      // Check driver exists
      const driver = await app.db.query.driverProfiles.findFirst({
        where: (dp) => eq(dp.user_id, request.userId),
      });

      if (!driver) {
        throw new AppError(ErrorCode.DRIVER_NOT_FOUND, 'Driver profile not found', 404);
      }

      // Check for duplicate plate
      const existing = await app.db.query.vehicles.findFirst({
        where: (v) => eq(v.plate, plate),
      });

      if (existing) {
        throw new AppError(ErrorCode.CONFLICT, 'Vehicle plate already registered', 409);
      }

      // Insert vehicle
      const [vehicle] = await app.db
        .insert(vehicles)
        .values({
          driver_id: request.userId,
          make,
          model,
          year,
          plate,
          color,
          category,
        })
        .returning();

      return reply.status(201).send({ vehicle });
    },
  );

  // ── POST /drivers/documents ─────────────────────────────────────────────
  // Upload driver document
  app.post<{ Body: DocumentUploadBody }>(
    '/documents',
    {
      preHandler: [app.authenticate],
      schema: { body: documentUploadSchema },
    },
    async (request, reply) => {
      const { document_type, storage_url, expiry_date } = request.body;

      // Check driver exists
      const driver = await app.db.query.driverProfiles.findFirst({
        where: (dp) => eq(dp.user_id, request.userId),
      });

      if (!driver) {
        throw new AppError(ErrorCode.DRIVER_NOT_FOUND, 'Driver profile not found', 404);
      }

      // Insert document
      await app.db.insert(driverDocuments).values({
        driver_id: request.userId,
        document_type: document_type as any,
        storage_url,
        status: 'pending',
        expiry_date: expiry_date ? new Date(expiry_date) : null,
      });

      // Check if all required documents are present
      const uploadedDocs = await app.db.query.driverDocuments.findMany({
        where: (dd) =>
          and(
            eq(dd.driver_id, request.userId),
            inArray(dd.document_type, [
              'national_id',
              'drivers_license',
              'vehicle_registration',
              'insurance',
              'vehicle_photo',
            ]),
            eq(dd.status, 'pending'),
          ),
      });

      const requiredDocs = [
        'national_id',
        'drivers_license',
        'vehicle_registration',
        'insurance',
        'vehicle_photo',
      ];
      const uploadedTypes = new Set<string>(uploadedDocs.map((d) => d.document_type));
      const allRequiredPresent = requiredDocs.every((type) => uploadedTypes.has(type));

      // If all required docs present, update verification status
      if (allRequiredPresent && driver.verification_status === 'unverified') {
        await app.db
          .update(driverProfiles)
          .set({ verification_status: 'pending_review' })
          .where(eq(driverProfiles.user_id, request.userId));
      }

      return reply.status(201).send({ message: 'Document uploaded' });
    },
  );

  // ── GET /drivers/me ────────────────────────────────────────────────────
  // Get driver profile + documents + active vehicle
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const driver = await app.db.query.driverProfiles.findFirst({
      where: (dp) => eq(dp.user_id, request.userId),
      with: {
        documents: true,
        vehicles: true,
      },
    });

    if (!driver) {
      throw new AppError(ErrorCode.DRIVER_NOT_FOUND, 'Driver profile not found', 404);
    }

    return reply.send({ driver });
  });

  // ── PATCH /drivers/availability ────────────────────────────────────────
  // Go online/offline with Redis GEO and heartbeat
  app.patch<{ Body: AvailabilityPayload }>(
    '/availability',
    {
      preHandler: [app.authenticate],
      schema: { body: availabilitySchema },
    },
    async (request, reply) => {
      const { is_available } = request.body;

      // Check driver is verified
      const driver = await app.db.query.driverProfiles.findFirst({
        where: (dp) => eq(dp.user_id, request.userId),
      });

      if (!driver) {
        throw new AppError(ErrorCode.DRIVER_NOT_FOUND, 'Driver profile not found', 404);
      }

      if (driver.verification_status !== 'verified') {
        throw new AppError(
          ErrorCode.DRIVER_NOT_VERIFIED,
          'Driver must be verified before going online',
          403,
        );
      }

      if (is_available) {
        // Get last known location from Redis or database
        // For now, use placeholder - real location comes from Socket.io or REST GPS endpoint
        const lon = 0;
        const lat = 0;

        // Add to Redis GEO and set heartbeat
        await app.redis.geoadd('drivers:geo', lon, lat, request.userId);
        await app.redis.setex(`driver:${request.userId}:heartbeat`, 10, '1');
      } else {
        // Remove from Redis GEO and heartbeat
        await app.redis.zrem('drivers:geo', request.userId);
        await app.redis.del(`driver:${request.userId}:heartbeat`);
      }

      // Update database (create or update driver_locations)
      await app.db
        .insert(driverLocations)
        .values({
          driver_id: request.userId,
          location: sql`ST_SetSRID(ST_MakePoint(0, 0), 4326)` as any,
          is_available,
          is_online: is_available,
        })
        .onConflictDoUpdate({
          target: driverLocations.driver_id,
          set: {
            is_available,
            is_online: is_available,
            updated_at: new Date(),
          },
        });

      return reply.send({ is_available });
    },
  );

  // ── GET /drivers/status ────────────────────────────────────────────────
  // Get online/available status
  app.get('/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const location = await app.db.query.driverLocations.findFirst({
      where: (dl) => eq(dl.driver_id, request.userId),
    });

    if (!location) {
      return reply.send({
        is_online: false,
        is_available: false,
        heartbeat_alive: false,
      });
    }

    // Check heartbeat
    const heartbeatAlive = await app.redis.get(`driver:${request.userId}:heartbeat`);

    return reply.send({
      is_online: location.is_online,
      is_available: location.is_available,
      heartbeat_alive: heartbeatAlive !== null,
    });
  });
}
