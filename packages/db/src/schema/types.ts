import { customType } from 'drizzle-orm/pg-core';

// PostGIS geometry(Point, 4326) — stored as WKB, queried via ST_* functions
// Use sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` when inserting
// Use sql`ST_X(${col}::geometry)` / ST_Y to read
export const point = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Point, 4326)';
  },
});

// PostGIS geometry(Polygon, 4326) — for zone boundaries
export const polygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Polygon, 4326)';
  },
});

// PostGIS geometry(MultiPolygon, 4326) — for complex zone boundaries
export const multiPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4326)';
  },
});
