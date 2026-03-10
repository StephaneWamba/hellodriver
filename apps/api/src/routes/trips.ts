import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  createTripSchema,
  cancelTripSchema,
  type CreateTripBody,
  type CancelTripBody,
} from '@hellodriver/validators';
// Workaround: define schemas locally (TypeScript build cache issue)
import { z } from 'zod';
import { latLonSchema, vehicleCategorySchema } from '@hellodriver/validators';

const estimateFareSchema = z.object({
  origin: latLonSchema,
  destination: latLonSchema,
  vehicle_category: vehicleCategorySchema,
});

const updateTripStatusSchema = z.object({
  status: z.enum([
    'driver_en_route',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled_by_client',
    'cancelled_by_driver',
  ]),
});

type EstimateFareBody = z.infer<typeof estimateFareSchema>;
type UpdateTripStatusBody = z.infer<typeof updateTripStatusSchema>;
import { trips, cancellationPolicies } from '@hellodriver/db';
import { AppError, ErrorCode } from '../errors.js';
import { estimateFare } from '../services/fare.js';
import { getZoneSurge, findNearestDrivers } from '../services/matching.js';
import { processTripCompletion } from '../services/payment.js';

export async function tripRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /estimate — Public fare estimation
  // ─────────────────────────────────────────────────────────────────────────────
  app.post<{ Body: EstimateFareBody }>(
    '/estimate',
    {
      schema: {
        body: estimateFareSchema,
      },
    },
    async (req, reply) => {
      const { origin, destination, vehicle_category }: EstimateFareBody = req.body;

      // Get zone and surge for pickup location
      const zoneSurge = await getZoneSurge(app.db, origin.lat, origin.lon);

      // Calculate fare
      const estimate = estimateFare(
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon },
        vehicle_category,
        zoneSurge.surge_multiplier,
        zoneSurge.zone_id,
      );

      return reply.send({ estimate });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST / — Create new trip (client books)
  // ─────────────────────────────────────────────────────────────────────────────
  app.post<{ Body: CreateTripBody }>(
    '/',
    {
      preHandler: app.authenticate,
      schema: {
        body: createTripSchema,
      },
    },
    async (req, reply) => {
      const clientId = req.userId;
      if (req.userRole !== 'client') {
        throw AppError.forbidden('Only clients can book trips');
      }

      const {
        origin,
        destination,
        vehicle_category,
        payment_method,
        trip_type,
        scheduled_at,
      }: CreateTripBody = req.body;

      // Validate scheduled_at is present for scheduled trips
      if (trip_type === 'scheduled' && !scheduled_at) {
        throw AppError.badRequest('scheduled_at required for scheduled trips');
      }

      // Get zone and surge for pickup location
      const zoneSurge = await getZoneSurge(
        app.db,
        origin.lat,
        origin.lon,
      );

      // Calculate fare
      const estimate = estimateFare(
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon },
        vehicle_category,
        zoneSurge.surge_multiplier,
        zoneSurge.zone_id,
      );

      // Create trip
      const tripId = crypto.randomUUID();
      const [createdTrip] = await app.db
        .insert(trips)
        .values({
          id: tripId,
          client_id: clientId,
          origin: sql`ST_SetSRID(ST_MakePoint(${origin.lon}, ${origin.lat}), 4326)` as any,
          origin_label: req.body.origin_label,
          destination: sql`ST_SetSRID(ST_MakePoint(${destination.lon}, ${destination.lat}), 4326)` as any,
          destination_label: req.body.destination_label,
          vehicle_category,
          payment_method,
          trip_type,
          scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
          fare_xaf: estimate.fare_xaf,
          zone_id: zoneSurge.zone_id,
          status: trip_type === 'immediate' ? 'matching' : 'pending',
        } as any)
        .returning();

      // For immediate trips: find drivers and emit offers
      if (trip_type === 'immediate') {
        const drivers = await findNearestDrivers(
          app.db,
          app.redis,
          origin.lat,
          origin.lon,
          5000, // 5km radius
          vehicle_category,
          5, // top 5 drivers
        );

        // Emit bid offer to each driver via personal room
        for (const driver of drivers) {
          app.io.to(`driver:${driver.driver_id}`).emit('trip:bid', {
            trip_id: tripId,
            origin_lat: origin.lat,
            origin_lon: origin.lon,
            origin_label: req.body.origin_label,
            destination_lat: destination.lat,
            destination_lon: destination.lon,
            destination_label: req.body.destination_label,
            estimated_fare_xaf: estimate.fare_xaf,
            estimated_duration_s: estimate.duration_s,
            vehicle_category,
          });
        }

        // Schedule bid expiry job (60 seconds)
        await app.queues.trips.add(
          'bid:expire',
          { trip_id: tripId },
          { delay: 60_000 },
        );

        // Notify client that trip was created
        app.io.to(`user:${clientId}`).emit('trip:created', {
          trip_id: tripId,
          status: 'matching',
        });
      }

      return reply.status(201).send({ trip: createdTrip });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /:tripId — Get trip details
  // ─────────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { tripId: string } }>(
    '/:tripId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { tripId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;

      const trip = await app.db.query.trips.findFirst({
        where: eq(trips.id, tripId),
      });

      if (!trip) {
        throw AppError.notFound('Trip not found');
      }

      // Access control
      if (
        userRole === 'client' && trip.client_id !== userId
          ? true
          : userRole === 'driver' && trip.driver_id !== userId
            ? true
            : userRole !== 'admin' && userRole !== 'superadmin'
              ? true
              : false
      ) {
        throw AppError.forbidden('Cannot access this trip');
      }

      // If active trip, attach live GPS from Redis
      let driverLocation = null;
      if (
        trip.driver_id &&
        ['driver_en_route', 'driver_arrived', 'in_progress'].includes(
          trip.status,
        )
      ) {
        const geopos = await app.redis.geopos(
          'drivers:geo',
          trip.driver_id,
        );
        if (geopos?.[0]) {
          driverLocation = {
            lon: parseFloat(geopos[0][0] as string),
            lat: parseFloat(geopos[0][1] as string),
          };
        }
      }

      return reply.send({
        trip: {
          ...trip,
          driver_location: driverLocation,
        },
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /:tripId/status — Update trip status
  // ─────────────────────────────────────────────────────────────────────────────
  app.patch<{ Params: { tripId: string }; Body: UpdateTripStatusBody }>(
    '/:tripId/status',
    {
      preHandler: app.authenticate,
      schema: {
        body: updateTripStatusSchema,
      },
    },
    async (req, reply) => {
      const { tripId } = req.params;
      const { status }: UpdateTripStatusBody = req.body;
      const userId = req.userId;
      const userRole = req.userRole;

      const trip = await app.db.query.trips.findFirst({
        where: eq(trips.id, tripId),
      });

      if (!trip) {
        throw AppError.notFound('Trip not found');
      }

      // Role-based access: only driver or client can update
      if (status === 'cancelled_by_driver' && trip.driver_id !== userId) {
        throw AppError.forbidden('Only assigned driver can cancel as driver');
      }
      if (status === 'cancelled_by_client' && trip.client_id !== userId) {
        throw AppError.forbidden('Only trip client can cancel');
      }
      if (
        ['driver_en_route', 'driver_arrived', 'in_progress', 'completed'].includes(
          status,
        ) &&
        trip.driver_id !== userId
      ) {
        throw AppError.forbidden('Only assigned driver can update trip progress');
      }

      // Update status
      const updateData: any = {
        status,
        updated_at: new Date(),
      };

      if (status === 'in_progress' && !trip.started_at) {
        updateData.started_at = new Date();
      }
      if (status === 'completed' && !trip.completed_at) {
        updateData.completed_at = new Date();
      }
      if (status.startsWith('cancelled_') && !trip.cancelled_at) {
        updateData.cancelled_at = new Date();
      }

      try {
        // Cast status to enum value
        const statusValue = status as any;
        const [updated] = await app.db
          .update(trips)
          .set({ ...updateData, status: statusValue })
          .where(eq(trips.id, tripId))
          .returning();

        if (!updated) {
          throw AppError.notFound('Trip not found');
        }

        // Process payment on trip completion (hello_monnaie: sync debit/credit, mobile money: async deposit job)
        if (status === 'completed') {
          try {
            const newStatus = await processTripCompletion(app, updated);
            if (newStatus !== 'paid') {
              // Update trip status if payment processing changed it (e.g., 'payment_pending')
              await app.db
                .update(trips)
                .set({ status: newStatus as any, updated_at: new Date() })
                .where(eq(trips.id, tripId));
            }
          } catch (err) {
            // Trip completion succeeds even if payment fails — driver completed the ride
            app.log.error({ tripId, err }, 'processTripCompletion failed');
            app.io
              .to(`trip:${tripId}`)
              .emit('payment:error', {
                trip_id: tripId,
                error: 'payment_processing_failed',
              });
          }
        }

        // Broadcast status update
        app.io.to(`trip:${tripId}`).emit('trip:status_updated', {
          trip_id: tripId,
          status,
          timestamp: new Date().toISOString(),
        });

        return reply.send({ trip: updated });
      } catch (err: any) {
        // Handle PostgreSQL trigger exceptions (invalid state transition)
        if (err.code === 'P0001') {
          throw AppError.badRequest(err.message);
        }
        throw err;
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /:tripId/cancel — Cancel trip with policy
  // ─────────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { tripId: string }; Body: CancelTripBody }>(
    '/:tripId/cancel',
    {
      preHandler: app.authenticate,
      schema: {
        body: cancelTripSchema,
      },
    },
    async (req, reply) => {
      const { tripId } = req.params;
      const { reason }: CancelTripBody = req.body;
      const userId = req.userId;
      const userRole = req.userRole;

      const trip = await app.db.query.trips.findFirst({
        where: eq(trips.id, tripId),
      });

      if (!trip) {
        throw AppError.notFound('Trip not found');
      }

      // Determine canceller
      let cancelledBy: 'client' | 'driver' | null = null;
      if (userRole === 'client' && trip.client_id === userId) {
        cancelledBy = 'client';
      } else if (userRole === 'driver' && trip.driver_id === userId) {
        cancelledBy = 'driver';
      } else {
        throw AppError.forbidden('Cannot cancel this trip');
      }

      // Check if already cancelled
      if (trip.status.includes('cancelled')) {
        return reply.status(409).send({
          error: {
            code: ErrorCode.CONFLICT,
            message: 'Trip already cancelled',
          },
        });
      }

      // Determine cancellation fee
      let cancellationFeeXaf = 0;
      if (
        ['driver_assigned', 'accepted', 'driver_en_route', 'driver_arrived'].includes(
          trip.status,
        )
      ) {
        // Apply fee policy
        const policy = await app.db.query.cancellationPolicies.findFirst({
          where: eq(cancellationPolicies.vehicle_category, trip.vehicle_category),
        });

        if (policy) {
          const minutesSinceAssign =
            (Date.now() - trip.updated_at.getTime()) / 60_000;
          if (minutesSinceAssign > policy.minutes_grace) {
            cancellationFeeXaf = policy.fee_xaf;
          }
        }
      }

      // Update trip
      const tripStatus = cancelledBy === 'client' ? 'cancelled_by_client' : 'cancelled_by_driver';

      const [updated] = await app.db
        .update(trips)
        .set({
          status: tripStatus as any,
          cancellation_reason: reason || null,
          cancellation_fee_xaf: cancellationFeeXaf,
          cancelled_at: new Date(),
          updated_at: new Date(),
        } as any)
        .where(eq(trips.id, tripId))
        .returning();

      // Broadcast cancellation
      app.io.to(`trip:${tripId}`).emit('trip:cancelled', {
        trip_id: tripId,
        cancelled_by: cancelledBy,
        fee_xaf: cancellationFeeXaf,
      });

      return reply.send({
        trip: updated,
        cancellation_fee_xaf: cancellationFeeXaf,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GET / — List trips (admin only, paginated)
  // ─────────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    '/',
    { preHandler: app.authenticate },
    async (req, reply) => {
      if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
        throw AppError.forbidden('Admin only');
      }

      const statusQuery = req.query.status;
      const limit = Math.min(parseInt(req.query.limit || '50'), 100);
      const offset = parseInt(req.query.offset || '0');

      const whereCondition = statusQuery ? eq(trips.status, statusQuery as any) : undefined;

      const data = await app.db
        .select()
        .from(trips)
        .$dynamic()
        .where(whereCondition)
        .orderBy(desc(trips.created_at))
        .limit(limit)
        .offset(offset);

      const countResult = await app.db
        .select({ count: sql`count(*)` })
        .from(trips)
        .$dynamic()
        .where(whereCondition);

      const [{ count }] = countResult;

      return reply.send({
        trips: data,
        pagination: {
          total: count,
          limit,
          offset,
        },
      });
    },
  );
}
