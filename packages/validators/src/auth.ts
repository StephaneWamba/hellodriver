import { z } from 'zod';
import { gabonPhoneSchema } from './common.js';

export const sendOtpSchema = z.object({
  phone: gabonPhoneSchema,
  // 'whatsapp' tried first, 'sms' used as fallback
  channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
});

export const verifyOtpSchema = z.object({
  phone: gabonPhoneSchema,
  token: z.string().min(6).max(6),
});

export const registerUserSchema = z.object({
  full_name: z.string().min(2).max(100),
  // email optional — most Gabon users won't have one
  email: z.string().email().optional(),
});

export type SendOtpBody = z.infer<typeof sendOtpSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type RegisterUserBody = z.infer<typeof registerUserSchema>;
