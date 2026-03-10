import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

// ─── App error codes ───────────────────────────────────────────────────────────
export const ErrorCode = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Business logic
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  TRIP_NOT_FOUND: 'TRIP_NOT_FOUND',
  TRIP_ALREADY_CLAIMED: 'TRIP_ALREADY_CLAIMED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_TRIP_STATUS: 'INVALID_TRIP_STATUS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Server
  INTERNAL: 'INTERNAL_SERVER_ERROR',
} as const;

export type AppErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(message = 'Not found') {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }

  static conflict(message: string) {
    return new AppError(ErrorCode.CONFLICT, message, 409);
  }
}

// ─── Global error handler ─────────────────────────────────────────────────────
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Zod validation errors (from fastify-type-provider-zod)
  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(422).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.validation,
      },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(422).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.flatten().fieldErrors,
      },
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }

  // Fastify built-in errors (404, 405, etc.)
  if (error.statusCode != null && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      error: { code: String(error.statusCode), message: error.message },
    });
  }

  // Unexpected server error — log full stack, never leak details
  request.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send({
    error: { code: ErrorCode.INTERNAL, message: 'An unexpected error occurred' },
  });
}
