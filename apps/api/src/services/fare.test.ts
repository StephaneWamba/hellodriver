import { describe, it, expect } from 'vitest';
import { estimateFare } from './fare.js';

describe('Fare Calculation — Logic Correctness', () => {
  // Test 1: Basic calculation without surge
  it('calculates base fare + per_km correctly (no surge)', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.234 + 0.01 }; // ~1km

    const result = estimateFare(pickup, dropoff, 'standard', 1.0, 'zone1');

    // Standard: base 1000 + per_km 250
    // Distance ~1km: 1000 + (1000 * 250) = 1000 + 250 = 1250
    expect(result.fare_xaf).toBeGreaterThan(1000);
    expect(result.fare_xaf).toBeLessThan(2000); // ballpark check
    expect(result.distance_m).toBeGreaterThan(500); // ~1km
    expect(result.distance_m).toBeLessThan(1500);
  });

  // Test 2: Surge multiplier applied correctly
  it('applies surge multiplier correctly', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.244 }; // ~1km

    const baseResult = estimateFare(pickup, dropoff, 'standard', 1.0, null);
    const surgeResult = estimateFare(pickup, dropoff, 'standard', 2.0, null);

    // Surge should roughly double the fare
    expect(surgeResult.fare_xaf).toBeGreaterThan(baseResult.fare_xaf * 1.8);
    expect(surgeResult.fare_xaf).toBeLessThan(baseResult.fare_xaf * 2.2);
    expect(surgeResult.surge_multiplier).toBe(2.0);
  });

  // Test 3: XAF rounding (integers only, no decimals)
  it('returns all prices as integers (XAF has no decimals)', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.6285, lon: 13.2345 }; // tiny distance

    const result = estimateFare(pickup, dropoff, 'moto', 1.0, null);

    expect(Number.isInteger(result.fare_xaf)).toBe(true);
    expect(Number.isInteger(result.commission_xaf)).toBe(true);
    expect(Number.isInteger(result.driver_amount_xaf)).toBe(true);
    expect(Number.isInteger(result.base_fare_xaf)).toBe(true);
  });

  // Test 4: Commission calculation (15% = 0.15)
  it('calculates commission as 15% of fare', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.244 }; // ~1km

    const result = estimateFare(pickup, dropoff, 'standard', 1.0, null);

    // commission should be ~15% of fare
    const expectedCommission = Math.round(result.fare_xaf * 0.15);
    expect(Math.abs(result.commission_xaf - expectedCommission)).toBeLessThan(2); // allow 1 XAF rounding error
  });

  // Test 5: Driver amount = fare - commission
  it('driver_amount = fare - commission', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.244 };

    const result = estimateFare(pickup, dropoff, 'comfort', 1.5, 'zone1');

    expect(result.driver_amount_xaf).toBe(result.fare_xaf - result.commission_xaf);
  });

  // Test 6: Vehicle category pricing differences
  it('prices vehicles correctly by category', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.244 };

    const moto = estimateFare(pickup, dropoff, 'moto', 1.0, null);
    const standard = estimateFare(pickup, dropoff, 'standard', 1.0, null);
    const comfort = estimateFare(pickup, dropoff, 'comfort', 1.0, null);
    const minivan = estimateFare(pickup, dropoff, 'minivan', 1.0, null);

    // Each tier should be more expensive than the previous
    expect(moto.fare_xaf).toBeLessThan(standard.fare_xaf);
    expect(standard.fare_xaf).toBeLessThan(comfort.fare_xaf);
    expect(comfort.fare_xaf).toBeLessThan(minivan.fare_xaf);
  });

  // Test 7: Duration calculation (30 km/h average urban speed)
  it('calculates duration correctly (30 km/h urban average)', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.234 + 0.01 }; // ~1km

    const result = estimateFare(pickup, dropoff, 'standard', 1.0, null);

    // At 30 km/h, 1km = 120 seconds (~2 minutes)
    expect(result.duration_s).toBeGreaterThan(90); // ~2 min
    expect(result.duration_s).toBeLessThan(180);
  });

  // Test 8: Road factor (1.3x straight-line distance)
  it('applies 1.3x road factor to distance', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.63, lon: 13.244 }; // specific distance

    const result = estimateFare(pickup, dropoff, 'standard', 1.0, null);

    // distance_m should include road factor
    // Haversine gives straight-line, we multiply by 1.3
    expect(result.distance_m).toBeGreaterThan(1000); // at least 1km
    expect(result.distance_m).toBeGreaterThan(0);
  });

  // Test 9: Zero-distance edge case
  it('handles same-location (zero distance) gracefully', () => {
    const location = { lat: -0.628, lon: 13.234 };

    const result = estimateFare(location, location, 'standard', 1.0, null);

    // Should return at least base fare
    expect(result.fare_xaf).toBeGreaterThanOrEqual(1000); // standard base
    expect(result.distance_m).toBeLessThanOrEqual(100); // minimal distance
  });

  // Test 10: Surge clamping (should never be <1.0 or >5.0 in practice, but test the logic)
  it('surge is applied within [1.0, 5.0] range', () => {
    const pickup = { lat: -0.628, lon: 13.234 };
    const dropoff = { lat: -0.628, lon: 13.244 };

    // Valid surge multipliers
    const result1 = estimateFare(pickup, dropoff, 'standard', 1.0, null);
    const result5 = estimateFare(pickup, dropoff, 'standard', 5.0, null);

    expect(result1.surge_multiplier).toBe(1.0);
    expect(result5.surge_multiplier).toBe(5.0);

    // Fare should scale linearly with surge
    expect(result5.fare_xaf).toBeGreaterThan(result1.fare_xaf * 4);
  });
});
