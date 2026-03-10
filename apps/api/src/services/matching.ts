import { sql, eq } from 'drizzle-orm';
import type { DbClient } from '@hellodriver/db';
import { driverLocations, driverProfiles } from '@hellodriver/db';
import type { Redis } from 'ioredis';
import type { VehicleCategory } from '@hellodriver/validators';

export interface NearbyDriver {
  driver_id: string;
  distance_m: number;
}

export interface ZoneSurge {
  zone_id: string | null;
  surge_multiplier: number;
}

/**
 * Find zone for a location and get surge multiplier
 * Returns null zone_id with 1.0 surge if no zone contains the point
 */
export async function getZoneSurge(
  db: DbClient,
  lat: number,
  lon: number,
): Promise<ZoneSurge> {
  const result = (await (db as any).execute(
    sql`
      SELECT id, surge_multiplier::text
      FROM zones
      WHERE ST_Contains(boundary::geometry, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
      ORDER BY surge_multiplier DESC LIMIT 1
    `,
  )) as any[];

  if (!result || result.length === 0) {
    return { zone_id: null, surge_multiplier: 1.0 };
  }

  const row = result[0] as { id: string; surge_multiplier: string };
  const surge = Math.max(1.0, Math.min(5.0, parseFloat(row.surge_multiplier)));

  return {
    zone_id: row.id,
    surge_multiplier: surge,
  };
}

/**
 * Find nearest available drivers within radius
 * Filters against Redis heartbeat to exclude stale drivers
 * Returns at most `limit` drivers sorted by distance ascending
 */
export async function findNearestDrivers(
  db: DbClient,
  redis: Redis,
  lat: number,
  lon: number,
  radiusM: number,
  category: VehicleCategory,
  limit: number = 5,
): Promise<NearbyDriver[]> {
  // PostGIS query: fetch drivers within radius, ordered by distance
  // Query limit * 2 as buffer for stale heartbeats
  const rows = (await (db as any).execute(
    sql`
      SELECT dl.driver_id::text,
        ST_Distance(dl.location::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)::int AS distance_m
      FROM driver_locations dl
      JOIN driver_profiles dp ON dp.user_id = dl.driver_id
      WHERE dl.is_available = TRUE AND dl.is_online = TRUE
        AND dp.verification_status = 'verified'
        AND dp.vehicle_category = ${category}
        AND ST_DWithin(dl.location::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radiusM})
      ORDER BY distance_m ASC LIMIT ${limit * 2}
    `,
  )) as any[];

  if (!rows || rows.length === 0) {
    return [];
  }

  // Filter via Redis heartbeat to exclude stale drivers
  const pipeline = redis.pipeline();
  for (const row of rows) {
    const r = row as { driver_id: string; distance_m: number };
    pipeline.exists(`driver:${r.driver_id}:heartbeat`);
  }

  const heartbeatResults = await pipeline.exec();
  if (!heartbeatResults) {
    return [];
  }

  // Keep only rows where heartbeat exists (result[1] === 1)
  const aliveDrivers: NearbyDriver[] = [];
  for (let i = 0; i < rows.length && aliveDrivers.length < limit; i++) {
    const r = rows[i] as { driver_id: string; distance_m: number };
    const [err, exists] = heartbeatResults[i] as [Error | null, number];

    if (!err && exists === 1) {
      aliveDrivers.push({
        driver_id: r.driver_id,
        distance_m: r.distance_m,
      });
    }
  }

  return aliveDrivers;
}
