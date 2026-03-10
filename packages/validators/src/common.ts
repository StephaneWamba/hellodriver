import { z } from 'zod';

// ─── Pagination ────────────────────────────────────────────────────────────────
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Geographic point ─────────────────────────────────────────────────────────
export const latLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

// ─── Gabon phone number ───────────────────────────────────────────────────────
// +241 followed by 7–8 digits (Airtel: 07xxx, Moov: 02xxx/06xxx)
export const gabonPhoneSchema = z
  .string()
  .regex(/^\+2410[267]\d{6,7}$/, 'Invalid Gabon phone number. Format: +2410XXXXXXX');

// ─── UUID ──────────────────────────────────────────────────────────────────────
export const uuidSchema = z.string().uuid();

// ─── Error response (standard shape) ─────────────────────────────────────────
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type LatLon = z.infer<typeof latLonSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
