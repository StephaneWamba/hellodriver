import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import { config } from '../config.js';
import { AppError } from '../errors.js';

// Supabase JWT payload shape
interface SupabaseJwtPayload {
  sub: string; // user UUID
  role: string; // 'authenticated' | 'anon' | 'service_role'
  aud: string;
  phone?: string;
  email?: string;
  app_metadata?: { provider?: string };
  user_metadata?: Record<string, unknown>;
  aal?: string;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  // Supabase JWT secret is base64-encoded; decode it to binary
  const secret = Buffer.from(config.SUPABASE_JWT_SECRET, 'base64');

  await app.register(jwt, {
    secret,
    // Supabase uses HS256
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // Decorator: verifies JWT and attaches userId + userRole to request
  // Usage: add preHandler: [app.authenticate] to any route
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        const payload = request.user as SupabaseJwtPayload;

        if (!payload.sub) {
          throw AppError.unauthorized('Invalid token: missing subject');
        }

        // Look up our users table to get the application role
        const user = await app.db.query.users.findFirst({
          where: (u, { eq, isNull, and }) =>
            and(eq(u.auth_id, payload.sub), isNull(u.deleted_at)),
          columns: { id: true, role: true },
        });

        if (!user) {
          throw AppError.unauthorized('User not found or account deleted');
        }

        request.userId = user.id;
        request.userRole = user.role;
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Log the actual error for debugging
        app.log.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'JWT verification failed');
        throw AppError.unauthorized('Invalid or expired token');
      }
    },
  );

  // Decorator: requires admin or superadmin role
  app.decorate(
    'requireAdmin',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      if (request.userRole !== 'admin' && request.userRole !== 'superadmin') {
        throw AppError.forbidden('Admin access required');
      }
    },
  );
});

// Extend FastifyInstance with our decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
