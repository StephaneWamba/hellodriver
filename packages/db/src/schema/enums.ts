import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'client',
  'driver',
  'admin',
  'superadmin',
]);

export const tripStatusEnum = pgEnum('trip_status', [
  'pending',
  'matching',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled_by_client',
  'cancelled_by_driver',
  'cancelled_by_admin',
  'payment_pending',
  'paid',
  'disputed',
]);

export const vehicleCategoryEnum = pgEnum('vehicle_category', [
  'moto',
  'standard',
  'comfort',
  'minivan',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'airtel_money',
  'moov_money',
  'hello_monnaie',
  'cash',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'initiated',
  'pending_user_approval',
  'processing',
  'confirmed',
  'failed',
  'refunded',
]);

export const paymentTypeEnum = pgEnum('payment_type', [
  'deposit',
  'payout',
  'refund',
]);

export const documentTypeEnum = pgEnum('document_type', [
  'national_id',
  'drivers_license',
  'vehicle_registration',
  'insurance',
  'vehicle_photo',
  'profile_photo',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'unverified',
  'pending_review',
  'verified',
  'suspended',
]);
