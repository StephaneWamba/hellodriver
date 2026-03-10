import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { driverProfiles, driverDocuments, adminActions } from '@hellodriver/db';
import { AppError } from '../../errors.js';

export async function adminDriverRoutes(app: FastifyInstance) {
  // ── GET /admin/drivers ──────────────────────────────────────────────────
  // List drivers with optional verification_status filter
  app.get<{
    Querystring: {
      verification_status?: string;
      page?: string;
      limit?: string;
    };
  }>(
    '/drivers',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { verification_status, page = '1', limit = '20' } = request.query;
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset = (pageNum - 1) * limitNum;

      let query;

      if (verification_status) {
        query = app.db.query.driverProfiles.findMany({
          where: (dp) => eq(dp.verification_status, verification_status as any),
          limit: limitNum,
          offset,
        });
      } else {
        query = app.db.query.driverProfiles.findMany({
          limit: limitNum,
          offset,
        });
      }

      const drivers = await query;

      return reply.send({ drivers, page: pageNum, limit: limitNum });
    },
  );

  // ── PATCH /admin/drivers/:userId/documents/:docId ───────────────────────
  // Approve/reject driver document
  app.patch<{
    Params: { userId: string; docId: string };
    Body: { status: 'approved' | 'rejected' };
  }>(
    '/drivers/:userId/documents/:docId',
    {
      preHandler: [app.authenticate, app.requireAdmin],
      schema: {
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['approved', 'rejected'],
            },
          },
          required: ['status'],
        },
      },
    },
    async (request, reply) => {
      const { userId, docId } = request.params;
      const { status } = request.body;

      // Update document status
      const [updated] = await app.db
        .update(driverDocuments)
        .set({ status })
        .where(
          and(eq(driverDocuments.id, docId), eq(driverDocuments.driver_id, userId)),
        )
        .returning();

      if (!updated) {
        throw AppError.notFound('Document not found');
      }

      // Log admin action
      await app.db.insert(adminActions).values({
        admin_id: request.userId,
        action_type: 'document_review',
        target_type: 'driver_documents',
        target_id: docId,
        metadata: { document_id: docId, status },
      });

      return reply.send({ document: updated });
    },
  );

  // ── PATCH /admin/drivers/:userId/verification ──────────────────────────
  // Set overall driver verification status
  app.patch<{
    Params: { userId: string };
    Body: {
      verification_status: 'verified' | 'suspended' | 'pending_review' | 'unverified';
    };
  }>(
    '/drivers/:userId/verification',
    {
      preHandler: [app.authenticate, app.requireAdmin],
      schema: {
        body: {
          type: 'object',
          properties: {
            verification_status: {
              type: 'string',
              enum: ['verified', 'suspended', 'pending_review', 'unverified'],
            },
          },
          required: ['verification_status'],
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { verification_status } = request.body;

      // Update driver verification status
      const [updated] = await app.db
        .update(driverProfiles)
        .set({ verification_status })
        .where(eq(driverProfiles.user_id, userId))
        .returning();

      if (!updated) {
        throw AppError.notFound('Driver not found');
      }

      // Log admin action
      await app.db.insert(adminActions).values({
        admin_id: request.userId,
        action_type: 'driver_verification',
        target_type: 'driver_profiles',
        target_id: userId,
        metadata: { verification_status },
      });

      return reply.send({ driver: updated });
    },
  );

  // ── GET /admin/drivers/documents/expiring ──────────────────────────────────
  // List documents expiring within 30 days (from v_expiring_documents view)
  app.get<{
    Querystring: {
      days_until?: string;
    };
  }>(
    '/drivers/documents/expiring',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { days_until } = request.query;

      let query = sql`SELECT * FROM v_expiring_documents`;

      // Optional filter for documents expiring within N days
      if (days_until) {
        const dayLimit = parseInt(days_until, 10);
        if (isNaN(dayLimit) || dayLimit < 0) {
          throw AppError.badRequest('days_until must be a non-negative number');
        }
        query = sql`SELECT * FROM v_expiring_documents WHERE days_until_expiry <= ${dayLimit}`;
      }

      const result = await app.db.execute(query as any);
      const expiringDocuments = (result as unknown as Array<{
        id: string;
        driver_id: string;
        driver_name: string;
        driver_phone: string;
        document_type: string;
        expiry_date: string;
        days_until_expiry: number;
      }>) ?? [];

      return reply.send({ expiring_documents: expiringDocuments, total: expiringDocuments.length });
    },
  );
}
