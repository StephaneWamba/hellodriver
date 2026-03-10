import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export type DbClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    // Supabase pooler (Transaction mode): keep alive with min: 2
    max: 20,
    min: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  return drizzle(pool, { schema, logger: process.env['NODE_ENV'] === 'development' });
}
