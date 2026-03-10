import { z } from 'zod';
import { gabonPhoneSchema, uuidSchema } from './common.js';

export const pawapayOperatorSchema = z.enum(['AIRTEL_GABON', 'MOOV_GABON']);

export const initiateDepositSchema = z.object({
  trip_id: uuidSchema.optional(),
  amount_xaf: z.number().int().positive(),
  msisdn: gabonPhoneSchema,
  operator: pawapayOperatorSchema,
});

export const initiatePayoutSchema = z.object({
  amount_xaf: z.number().int().positive(),
  msisdn: gabonPhoneSchema,
  operator: pawapayOperatorSchema,
});

export const OPERATOR_LIMITS = {
  AIRTEL_GABON: { max_per_tx: 500_000, max_daily: 1_000_000, max_tx_per_day: 30 },
  MOOV_GABON: { max_per_tx: 300_000, max_daily: 1_000_000, max_tx_per_day: 25 },
} as const;

export const pawapayWebhookSchema = z.object({
  depositId: z.string(),
  status: z.enum(['COMPLETED', 'FAILED', 'EXPIRED']),
  amount: z.string(),
  currency: z.literal('XAF'),
  correspondent: pawapayOperatorSchema,
  payer: z.object({ type: z.string(), address: z.object({ value: z.string() }) }),
  customerTimestamp: z.string(),
  created: z.string(),
  respondedByPayer: z.string().optional(),
  correspondentIds: z.record(z.string()).optional(),
});

export type InitiateDepositBody = z.infer<typeof initiateDepositSchema>;
export type InitiatePayoutBody = z.infer<typeof initiatePayoutSchema>;
export type PawapayWebhookPayload = z.infer<typeof pawapayWebhookSchema>;
export type PawapayOperator = z.infer<typeof pawapayOperatorSchema>;
