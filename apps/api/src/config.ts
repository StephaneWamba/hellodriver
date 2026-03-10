import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  // ── Database (Supabase) ────────────────────────────────────────────────────
  // Use pooler endpoint (-pooler suffix, port 6543) in production
  DATABASE_URL: z.string().min(1),

  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  // JWT secret from Supabase Dashboard → Settings → API → JWT Secret
  SUPABASE_JWT_SECRET: z.string().min(1),

  // ── Redis (TCP — never Upstash HTTP) ──────────────────────────────────────
  REDIS_URL: z.string().min(1),

  // ── Anthropic (WhatsApp AI agent) ─────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // ── Meta / WhatsApp Cloud API ─────────────────────────────────────────────
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  META_PHONE_NUMBER_ID: z.string().min(1).optional(),

  // ── pawaPay ───────────────────────────────────────────────────────────────
  PAWAPAY_API_KEY: z.string().min(1).optional(),
  PAWAPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  PAWAPAY_BASE_URL: z.string().url().default('https://api.sandbox.pawapay.io'),

  // ── Mapbox ────────────────────────────────────────────────────────────────
  MAPBOX_ACCESS_TOKEN: z.string().min(1).optional(),

  // ── Africa's Talking (SMS fallback) ───────────────────────────────────────
  AT_API_KEY: z.string().min(1).optional(),
  AT_USERNAME: z.string().min(1).optional(),

  // ── Monitoring ────────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  BETTERSTACK_SOURCE_TOKEN: z.string().min(1).optional(),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const [field, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${errors?.join(', ')}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
