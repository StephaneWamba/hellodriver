import { z } from 'zod';
import { vehicleCategorySchema } from './trip.js';

export const registerDriverSchema = z.object({
  full_name: z.string().min(2).max(100),
  vehicle_category: vehicleCategorySchema,
});

export const registerVehicleSchema = z.object({
  make: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  plate: z.string().min(2).max(20),
  color: z.string().min(2).max(30),
  category: vehicleCategorySchema,
});

export const driverLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed_kmh: z.number().min(0).max(200).optional(),
  accuracy_m: z.number().min(0).optional(),
});

export const availabilitySchema = z.object({
  is_available: z.boolean(),
});

export const documentUploadSchema = z.object({
  document_type: z.enum([
    'national_id',
    'drivers_license',
    'vehicle_registration',
    'insurance',
    'vehicle_photo',
    'profile_photo',
  ]),
  storage_url: z.string().url(),
  expiry_date: z.string().datetime().optional(),
});

export type RegisterDriverBody = z.infer<typeof registerDriverSchema>;
export type RegisterVehicleBody = z.infer<typeof registerVehicleSchema>;
export type DriverLocationPayload = z.infer<typeof driverLocationSchema>;
export type AvailabilityPayload = z.infer<typeof availabilitySchema>;
export type DocumentUploadBody = z.infer<typeof documentUploadSchema>;
