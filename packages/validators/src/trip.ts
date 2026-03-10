import { z } from 'zod';
import { latLonSchema, uuidSchema } from './common.js';

export const vehicleCategorySchema = z.enum(['moto', 'standard', 'comfort', 'minivan']);

export const tripTypeSchema = z.enum(['immediate', 'scheduled']);

export const paymentMethodSchema = z.enum([
  'airtel_money',
  'moov_money',
  'hello_monnaie',
  'cash',
]);

export const createTripSchema = z.object({
  origin: latLonSchema,
  origin_label: z.string().min(1).max(200),
  destination: latLonSchema,
  destination_label: z.string().min(1).max(200),
  vehicle_category: vehicleCategorySchema,
  payment_method: paymentMethodSchema,
  trip_type: tripTypeSchema.default('immediate'),
  // ISO8601 — required only when trip_type = 'scheduled'
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  promo_code: z.string().max(20).optional(),
});

export const tripBidSchema = z.object({
  trip_id: uuidSchema,
  amount_xaf: z.number().int().positive(),
  eta_seconds: z.number().int().positive(),
});

export const rateTripSchema = z.object({
  trip_id: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const cancelTripSchema = z.object({
  trip_id: uuidSchema,
  reason: z.string().max(300).optional(),
});

export const estimateFareSchema = z.object({
  origin: latLonSchema,
  destination: latLonSchema,
  vehicle_category: vehicleCategorySchema,
});

export const updateTripStatusSchema = z.object({
  status: z.enum([
    'driver_en_route',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled_by_client',
    'cancelled_by_driver',
  ]),
});

export type CreateTripBody = z.infer<typeof createTripSchema>;
export type TripBidBody = z.infer<typeof tripBidSchema>;
export type RateTripBody = z.infer<typeof rateTripSchema>;
export type CancelTripBody = z.infer<typeof cancelTripSchema>;
export type EstimateFareBody = z.infer<typeof estimateFareSchema>;
export type UpdateTripStatusBody = z.infer<typeof updateTripStatusSchema>;
export type VehicleCategory = z.infer<typeof vehicleCategorySchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
