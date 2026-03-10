import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import msgpackParser from 'socket.io-msgpack-parser';
import Redis from 'ioredis';
import { driverLocations } from '@hellodriver/db';
import { config } from '../config.js';
import { sql } from 'drizzle-orm';

// ─── Socket.io server with Redis Streams adapter, msgpack parser, and zone rooms ──
export const socketPlugin = fp(async (app: FastifyInstance) => {
  // Create a dedicated Redis client for the Socket.io adapter
  const redisClient = new Redis(config.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 30_000);
      app.log.warn({ attempt: times, delayMs: delay }, 'Socket.io Redis reconnecting…');
      return delay;
    },
  });

  redisClient.on('connect', () => app.log.info('Socket.io Redis connected'));
  redisClient.on('error', (err) => app.log.error({ err }, 'Socket.io Redis error'));

  // ── Create Socket.io server ────────────────────────────────────────────────────
  const io = new SocketServer(app.server, {
    transports: ['websocket'], // Disable polling fallback
    parser: msgpackParser, // msgpack binary encoding
    adapter: createAdapter(redisClient),
  });

  // ── JWT authentication middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;

    if (!token) {
      return next(new Error('Missing token'));
    }

    try {
      const payload = await app.jwt.verify(token);
      socket.data.userId = (payload as any).sub as string;
      socket.data.userRole = (payload as any).role as string;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── On connect (driver joins zone room) ─────────────────────────────────────
  io.on('connection', async (socket) => {
    const { userId, userRole } = socket.data;

    // Only drivers use zones and GPS events
    if (userRole === 'driver') {
      try {
        // Get last location from Redis GEO
        const geopos = await app.redis.geopos('drivers:geo', userId);
        let zoneName = 'zone:0_0'; // default zone

        if (geopos && geopos[0]) {
          // geopos returns [lon, lat] as strings
          const lon = parseFloat(geopos[0][0] as string);
          const lat = parseFloat(geopos[0][1] as string);
          // Zone grid: ~10km cells (rough latitude-based hashing)
          zoneName = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;
        }

        // Join zone room
        socket.join(zoneName);
        socket.data.zone = zoneName;

        app.log.info({ userId, zone: zoneName }, 'Driver connected, joined zone');
      } catch (err) {
        app.log.error({ err, userId }, 'Error joining zone room');
      }
    }

    // ── GPS update event handler ───────────────────────────────────────────────
    socket.on(
      'gps:update',
      async (payload: { lat: number; lon: number; heading?: number; speed_kmh?: number }, ack) => {
        const { lat, lon } = payload;

        try {
          // Update Redis GEO immediately
          await app.redis.geoadd('drivers:geo', lon, lat, userId);

          // Refresh heartbeat (10s TTL)
          await app.redis.setex(`driver:${userId}:heartbeat`, 10, '1');

          // Compute new zone
          const newZone = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;

          // If zone changed, rejoin rooms
          if (socket.data.zone && socket.data.zone !== newZone) {
            const oldZone = socket.data.zone;
            socket.leave(socket.data.zone);
            socket.join(newZone);
            socket.data.zone = newZone;
            app.log.info({ userId, oldZone, newZone }, 'Driver zone changed');
          }

          // Gate PostgreSQL write to avoid high cardinality writes
          const lastWriteKey = `driver:${userId}:last_pg_write`;
          const canWrite = await app.redis.set(lastWriteKey, '1', 'EX', 10, 'NX');

          if (canWrite === 'OK') {
            // Upsert to database (fallback persistence, analytics)
            await app.db
              .insert(driverLocations)
              .values({
                driver_id: userId,
                location: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` as any,
                is_available: true, // assume available if sending GPS
                is_online: true,
              })
              .onConflictDoUpdate({
                target: driverLocations.driver_id,
                set: {
                  location: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` as any,
                  updated_at: new Date(),
                },
              });
          }

          // If driver is on an active trip, emit location to trip room
          const tripRoomName = `trip:${userId}:active`; // or check trip_id from DB
          socket.volatile.to(tripRoomName).emit('driver:location', {
            driver_id: userId,
            lat,
            lon,
            heading: payload.heading,
            speed_kmh: payload.speed_kmh,
            timestamp: new Date().toISOString(),
          });

          // Acknowledge back to driver
          if (ack) {
            ack({ received: true });
          }
        } catch (err) {
          app.log.error({ err, userId }, 'Error handling GPS update');
          if (ack) {
            ack({ error: 'GPS update failed' });
          }
        }
      },
    );

    // ── Disconnect ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      app.log.info({ userId }, 'Driver disconnected');
      // Note: Redis GEOADD and heartbeat remain — removed by separate heartbeat monitor
    });
  });

  app.decorate('io', io);

  app.addHook('onClose', async () => {
    app.log.info('Closing Socket.io server…');
    io.close();
    await redisClient.quit();
  });
});
