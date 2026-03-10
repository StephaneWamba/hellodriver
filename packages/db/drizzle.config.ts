import type { Config } from 'drizzle-kit';

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL is required for drizzle-kit');
}

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'],
  },
  // PostGIS extensions and custom functions are in schema.sql (applied separately)
  // Drizzle handles table structure only
  verbose: true,
  strict: true,
} satisfies Config;
