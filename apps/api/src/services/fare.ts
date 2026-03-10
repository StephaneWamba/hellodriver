import type { VehicleCategory } from '@hellodriver/validators';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface FareEstimate {
  distance_m: number;
  duration_s: number;
  base_fare_xaf: number;
  surge_multiplier: number;
  fare_xaf: number;
  commission_xaf: number;
  driver_amount_xaf: number;
  zone_id: string | null;
}

// Fare table (XAF) — all per-km and base rates
const FARE_TABLE: Record<VehicleCategory, { base: number; per_km: number }> = {
  moto: { base: 500, per_km: 150 },
  standard: { base: 1000, per_km: 250 },
  comfort: { base: 2000, per_km: 400 },
  minivan: { base: 3000, per_km: 500 },
};

const ROAD_FACTOR = 1.3; // straight-line to actual road distance
const COMMISSION_RATE = 0.15; // 15% platform cut
const AVG_SPEED_MS = 30 / 3.6; // 30 km/h in m/s (Libreville urban average)

/**
 * Calculate straight-line distance in meters using Haversine formula
 */
function haversineDistance(from: LatLon, to: LatLon): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lon - from.lon) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Estimate fare for a trip
 * All returned values are integers (no decimals)
 */
export function estimateFare(
  pickup: LatLon,
  dropoff: LatLon,
  category: VehicleCategory,
  surgeMultiplier: number = 1.0,
  zoneId: string | null = null,
): FareEstimate {
  // Clamp surge to [1.0, 5.0]
  const surge = Math.max(1.0, Math.min(5.0, surgeMultiplier));

  // Straight-line distance in meters
  const straightLineM = haversineDistance(pickup, dropoff);

  // Road distance estimate (add 30% for actual routing)
  const roadDistanceM = straightLineM * ROAD_FACTOR;
  const roadDistanceKm = roadDistanceM / 1000;

  // Estimate duration in seconds (road distance / speed)
  const durationS = Math.round(roadDistanceM / AVG_SPEED_MS);

  // Base fare calculation
  const rates = FARE_TABLE[category];
  const baseFareXaf = rates.base + Math.round(roadDistanceKm * rates.per_km);

  // Apply surge
  const fareXaf = Math.round(baseFareXaf * surge);

  // Commission (15%)
  const commissionXaf = Math.round(fareXaf * COMMISSION_RATE);

  // Driver receives remaining amount
  const driverAmountXaf = fareXaf - commissionXaf;

  return {
    distance_m: Math.round(roadDistanceM),
    duration_s: durationS,
    base_fare_xaf: baseFareXaf,
    surge_multiplier: surge,
    fare_xaf: fareXaf,
    commission_xaf: commissionXaf,
    driver_amount_xaf: driverAmountXaf,
    zone_id: zoneId,
  };
}
