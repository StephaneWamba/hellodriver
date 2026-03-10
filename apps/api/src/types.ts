import type { DbClient } from '@hellodriver/db';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import type { Server as SocketServer } from 'socket.io';
import type { PawapayClient } from './services/pawapay.js';

// ─── Fastify instance augmentation ────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
    redis: Redis;
    io: SocketServer;
    pawapay: PawapayClient | null;
    queues: {
      notifications: Queue;
      payments: Queue;
      payouts: Queue;
      trips: Queue;
    };
  }

  interface FastifyRequest {
    // Set by the auth plugin after JWT verification
    userId: string;
    userRole: 'client' | 'driver' | 'admin' | 'superadmin';
  }
}
