import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendOtpSchema, verifyOtpSchema, registerUserSchema, type SendOtpBody, type VerifyOtpBody, type RegisterUserBody } from '@hellodriver/validators';
import { users, wallets } from '@hellodriver/db';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { AppError, ErrorCode } from '../errors.js';

// Rate limit key for OTP: 5 OTPs per phone per hour
const OTP_RATE_LIMIT_KEY = (phone: string) => `otp:rate:${phone}`;
const OTP_RATE_LIMIT_MAX = 5;
const OTP_RATE_LIMIT_WINDOW_S = 3_600;

export async function authRoutes(app: FastifyInstance) {
  const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── POST /auth/otp/send ──────────────────────────────────────────────────
  // Sends OTP to a Gabon phone number.
  // Phase 5: WhatsApp-first waterfall added here.
  // Phase 0: Supabase SMS only.
  app.post<{ Body: SendOtpBody }>(
    '/auth/otp/send',
    { schema: { body: sendOtpSchema } },
    async (request, reply) => {
      const { phone } = request.body;

      // Rate limit: 5 OTPs per hour per phone
      const rateKey = OTP_RATE_LIMIT_KEY(phone);
      const count = await app.redis.incr(rateKey);
      if (count === 1) {
        await app.redis.expire(rateKey, OTP_RATE_LIMIT_WINDOW_S);
      }
      if (count > OTP_RATE_LIMIT_MAX) {
        throw new AppError(ErrorCode.OTP_RATE_LIMITED, 'Too many OTP requests. Try again in 1 hour.', 429);
      }

      // Call Supabase auth OTP endpoint directly
      const response = await fetch(`${config.SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        app.log.error({ status: response.status, phone }, 'Failed to send OTP');
        throw new AppError(ErrorCode.INTERNAL, 'Failed to send OTP', 500);
      }

      return reply.status(200).send({ message: 'OTP sent' });
    },
  );

  // ── POST /auth/otp/verify ────────────────────────────────────────────────
  // Verifies OTP with Supabase. Returns session + creates user in our DB on first login.
  app.post<{ Body: VerifyOtpBody }>(
    '/auth/otp/verify',
    { schema: { body: verifyOtpSchema } },
    async (request, reply) => {
      const { phone, token } = request.body;

      // Verify OTP with Supabase
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error || !data.user || !data.session) {
        throw new AppError(ErrorCode.INVALID_OTP, 'Invalid or expired OTP', 401);
      }

      const authId = data.user.id;

      // Upsert user in our DB (idempotent — safe to call on every login)
      const existingUser = await app.db.query.users.findFirst({
        where: (u, { eq }) => eq(u.auth_id, authId),
      });

      let appUserId: string;

      if (!existingUser) {
        // First login — create user + wallet
        const [newUser] = await app.db.insert(users).values({
          phone,
          auth_id: authId,
          role: 'client',
        }).returning({ id: users.id });

        if (!newUser) throw new AppError(ErrorCode.INTERNAL, 'Failed to create user', 500);

        appUserId = newUser.id;

        // Create wallet (balance starts at 0)
        await app.db.insert(wallets).values({ user_id: appUserId });
      } else {
        appUserId = existingUser.id;
      }

      return reply.status(200).send({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        user: {
          id: appUserId,
          phone,
          is_new: !existingUser,
        },
      });
    },
  );

  // ── GET /auth/me ─────────────────────────────────────────────────────────
  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await app.db.query.users.findFirst({
        where: (u, { eq, isNull, and: andOp }) =>
          andOp(eq(u.id, request.userId), isNull(u.deleted_at)),
        with: {
          wallet: { columns: { balance_xaf: true } },
        },
      });

      if (!user) throw AppError.notFound('User not found');

      return reply.send({ user });
    },
  );

  // ── POST /auth/register ──────────────────────────────────────────────────
  // Complete profile after first OTP login (full_name, etc.)
  app.post<{ Body: RegisterUserBody }>(
    '/auth/register',
    {
      preHandler: [app.authenticate],
      schema: { body: registerUserSchema },
    },
    async (request, reply) => {
      const { full_name, email } = request.body;

      const [updated] = await app.db
        .update(users)
        .set({ full_name, email, updated_at: new Date() })
        .where(eq(users.id, request.userId))
        .returning({ id: users.id, full_name: users.full_name, role: users.role });

      return reply.send({ user: updated });
    },
  );
}
