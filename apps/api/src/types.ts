import type { DbClient } from '@hellodriver/db';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';

// ─── Fastify instance augmentation ────────────────────────────────────────────
declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
    redis: Redis;
    queues: {
      notifications: Queue;
      payments: Queue;
      payouts: Queue;
    };
  }

  interface FastifyRequest {
    // Set by the auth plugin after JWT verification
    userId: string;
    userRole: 'client' | 'driver' | 'admin' | 'superadmin';
  }
}
