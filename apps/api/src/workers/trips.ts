import { Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { trips } from '@hellodriver/db';
import { config } from '../config.js';

const CONNECTION = { url: config.REDIS_URL };

export interface BidExpireJob {
  trip_id: string;
}

/**
 * Start BullMQ Worker for trip-related jobs
 * Currently handles: bid:expire (transition to no_driver_found)
 */
export function startTripWorker(app: FastifyInstance) {
  const worker = new Worker<BidExpireJob>(
    'trips',
    async (job) => {
      const { trip_id } = job.data;

      app.log.info({ trip_id }, 'Processing bid:expire job');

      // Check trip still in matching state
      const trip = await app.db.query.trips.findFirst({
        where: eq(trips.id, trip_id),
      });

      if (!trip) {
        app.log.warn({ trip_id }, 'Trip not found, skipping expiry');
        return;
      }

      if (trip.status !== 'matching') {
        app.log.info(
          { trip_id, status: trip.status },
          'Trip no longer in matching, skipping expiry',
        );
        return;
      }

      // Transition to no_driver_found (optimistic: only if still matching)
      const [updated] = await app.db
        .update(trips)
        .set({
          status: 'cancelled_by_admin',
          cancellation_reason: 'no_driver_found',
          cancelled_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(eq(trips.id, trip_id), eq(trips.status, 'matching')),
        )
        .returning({ id: trips.id });

      if (!updated) {
        app.log.info(
          { trip_id },
          'Trip already transitioned, skipping notification',
        );
        return;
      }

      // Notify client and any listeners via Socket.io
      app.io.to(`trip:${trip_id}`).emit('trip:no_driver_found', {
        trip_id,
        reason: 'no_driver_accepted_within_60s',
      });

      app.log.info({ trip_id }, 'Trip marked as no_driver_found');
    },
    { connection: CONNECTION },
  );

  // Error handling
  worker.on('failed', (job, err) => {
    if (job) {
      app.log.error(
        { jobId: job.id, trip_id: job.data.trip_id, err },
        'Trip worker job failed',
      );
    }
  });

  app.log.info('Trip BullMQ worker started');

  // Cleanup on app close
  app.addHook('onClose', async () => {
    app.log.info('Closing trip worker…');
    await worker.close();
  });

  return worker;
}
