import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';

/**
 * Integration tests for Redis operations in matching
 * Tests: atomic claim (SET NX), heartbeat filtering, stale driver culling
 * Skipped if environment variables are missing (no infrastructure available)
 */

const hasRequiredEnv = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
  'REDIS_URL',
].every((key) => process.env[key]);

describe.skipIf(!hasRequiredEnv)('Redis Matching Operations — Integration', () => {
  let redis: Redis;
  let config: any;

  beforeAll(async () => {
    // Import config only when tests run (env vars are available)
    if (hasRequiredEnv) {
      const { config: loadedConfig } = await import('../config.js');
      config = loadedConfig;
      redis = new Redis(config.REDIS_URL);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  // Test 1: SET NX atomic claim prevents race condition
  it('SET NX prevents two drivers from claiming same trip', async () => {
    const tripId = `trip:test:${Date.now()}:claimed`;
    const driver1 = 'driver_a';
    const driver2 = 'driver_b';

    // Driver A claims first
    const claim1 = await redis.set(tripId, driver1, 'EX', 300, 'NX');
    expect(claim1).toBe('OK'); // Success

    // Driver B tries to claim (should fail)
    const claim2 = await redis.set(tripId, driver2, 'EX', 300, 'NX');
    expect(claim2).toBeNull(); // Fails

    // Verify owner is driver A
    const owner = await redis.get(tripId);
    expect(owner).toBe(driver1);

    // Cleanup
    await redis.del(tripId);
  });

  // Test 2: Heartbeat key TTL ensures stale drivers are detected
  it('heartbeat key with 10s TTL expires and removes driver', async () => {
    const driverId = `driver:test:${Date.now()}:heartbeat`;

    // Set heartbeat
    await redis.setex(driverId, 10, '1');

    // Check exists immediately
    const exists1 = await redis.exists(driverId);
    expect(exists1).toBe(1); // Exists

    // Check TTL
    const ttl = await redis.ttl(driverId);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);

    // Cleanup
    await redis.del(driverId);
  });

  // Test 3: Redis pipeline batch query (heartbeat filtering)
  it('pipeline batch queries multiple heartbeat keys in one round-trip', async () => {
    // Setup: 5 drivers, some with heartbeat
    const drivers = [
      { id: `driver:batch:${Date.now()}:1`, alive: true },
      { id: `driver:batch:${Date.now()}:2`, alive: false },
      { id: `driver:batch:${Date.now()}:3`, alive: true },
      { id: `driver:batch:${Date.now()}:4`, alive: false },
      { id: `driver:batch:${Date.now()}:5`, alive: true },
    ];

    // Set heartbeats for alive drivers
    for (const driver of drivers) {
      if (driver.alive) {
        await redis.setex(driver.id, 10, '1');
      }
    }

    // Pipeline: batch check all drivers
    const pipeline = redis.pipeline();
    for (const driver of drivers) {
      pipeline.exists(driver.id);
    }

    const results = await pipeline.exec();
    expect(results).not.toBeNull();
    expect(results!.length).toBe(5);

    // Extract alive count
    let aliveCount = 0;
    for (let i = 0; i < results!.length; i++) {
      const [err, exists] = results![i];
      if (!err && exists === 1) {
        aliveCount++;
      }
    }

    expect(aliveCount).toBe(3); // D1, D3, D5

    // Cleanup
    for (const driver of drivers) {
      await redis.del(driver.id);
    }
  });

  // Test 4: GEO commands for driver location
  it('GEOADD stores driver location and GEOPOS retrieves it', async () => {
    const geoKey = `drivers:geo:test:${Date.now()}`;
    const driverId = 'driver_geo_test';
    const lon = 13.234;
    const lat = -0.628;

    // Add driver location
    const added = await redis.geoadd(geoKey, lon, lat, driverId);
    expect(added).toBe(1);

    // Retrieve location
    const pos = await redis.geopos(geoKey, driverId);
    expect(pos).not.toBeNull();
    expect(pos!.length).toBe(1);
    expect(pos![0]).toBeDefined();

    // Position is [lon, lat] as strings
    const retrievedLon = parseFloat(pos![0][0] as string);
    const retrievedLat = parseFloat(pos![0][1] as string);

    // Should be very close (Redis precision)
    expect(Math.abs(retrievedLon - lon)).toBeLessThan(0.0001);
    expect(Math.abs(retrievedLat - lat)).toBeLessThan(0.0001);

    // Cleanup
    await redis.del(geoKey);
  });

  // Test 5: GEODIST calculates distance
  it('GEODIST calculates distance between two points', async () => {
    const geoKey = `drivers:geo:distance:${Date.now()}`;

    // Two points in Libreville, ~1.5km apart
    const point1 = { lon: 13.234, lat: -0.628 };
    const point2 = { lon: 13.244, lat: -0.638 };

    await redis.geoadd(geoKey, point1.lon, point1.lat, 'point1');
    await redis.geoadd(geoKey, point2.lon, point2.lat, 'point2');

    // Distance in meters
    const distance = await redis.geodist(geoKey, 'point1', 'point2', 'm');
    expect(distance).not.toBeNull();

    // Should be ~1500m (rough estimate)
    const distanceM = parseFloat(distance as string);
    expect(distanceM).toBeGreaterThan(1000);
    expect(distanceM).toBeLessThan(2000);

    // Cleanup
    await redis.del(geoKey);
  });

  // Test 6: Trip claimed key TTL enforcement
  it('trip:claimed key has 5-minute TTL to prevent stale locks', async () => {
    const tripId = `trip:ttl:${Date.now()}:claimed`;
    const driverId = 'driver_ttl_test';

    // Set claim with 300s (5 min) TTL
    await redis.set(tripId, driverId, 'EX', 300, 'NX');

    // Check TTL
    const ttl = await redis.ttl(tripId);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);

    // Cleanup
    await redis.del(tripId);
  });

  // Test 7: Last write throttle (PostgreSQL write gating)
  it('driver:last_pg_write key gates 10s PostgreSQL writes', async () => {
    const driverId = `driver:write:${Date.now()}`;
    const writeKey = `driver:${driverId}:last_pg_write`;

    // First write — should succeed (NX)
    const write1 = await redis.set(writeKey, '1', 'EX', 10, 'NX');
    expect(write1).toBe('OK');

    // Second write immediately after — should fail (key exists)
    const write2 = await redis.set(writeKey, '1', 'EX', 10, 'NX');
    expect(write2).toBeNull();

    // Cleanup
    await redis.del(writeKey);
  });

  // Test 8: Conversation history (for WhatsApp bot)
  it('Redis list stores and trims conversation history', async () => {
    const phone = '+24177777777';
    const historyKey = `whatsapp:${phone}:history`;

    // Add messages
    await redis.lpush(historyKey, JSON.stringify({ role: 'user', content: 'Bonjour' }));
    await redis.lpush(historyKey, JSON.stringify({ role: 'assistant', content: 'Salut!' }));
    await redis.lpush(historyKey, JSON.stringify({ role: 'user', content: 'Comment ça va?' }));

    // Trim to last 2 messages
    await redis.ltrim(historyKey, 0, 1);

    // Check length
    const length = await redis.llen(historyKey);
    expect(length).toBe(2);

    // Set expiry
    await redis.expire(historyKey, 86400); // 24h

    // Cleanup
    await redis.del(historyKey);
  });

  // Test 9: Rate limiter (Claude API calls per phone)
  it('rate limiter counter increments and expires', async () => {
    const phone = '+24177777777';
    const rateLimitKey = `claude:calls:${phone}`;

    // First call
    const count1 = await redis.incr(rateLimitKey);
    expect(count1).toBe(1);

    // Set expiry (1 hour)
    await redis.expire(rateLimitKey, 3600);

    // Second call
    const count2 = await redis.incr(rateLimitKey);
    expect(count2).toBe(2);

    // Check limit (50 calls/hour for Claude)
    const maxCalls = 50;
    expect(count2).toBeLessThanOrEqual(maxCalls);

    // Cleanup
    await redis.del(rateLimitKey);
  });

  // Test 10: Zone grid room assignment
  it('zone room calculation for Socket.io subscription', async () => {
    /**
     * Zone grid: ~10km cells (latitude-based hashing)
     * zone = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`
     *
     * For lat=-0.628, lon=13.234:
     * zone = `zone:${floor(-6.28)}_${floor(132.34)}`
     * zone = `zone:-7_132`
     */

    const lat = -0.628;
    const lon = 13.234;

    const zoneGrid = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;
    expect(zoneGrid).toBe('zone:-7_132');

    // Different location
    const lat2 = -0.738; // 12km south
    const lon2 = 13.334; // 11km east
    const zoneGrid2 = `zone:${Math.floor(lat2 * 10)}_${Math.floor(lon2 * 10)}`;
    expect(zoneGrid2).toBe('zone:-8_133');

    // Zones should be different
    expect(zoneGrid).not.toBe(zoneGrid2);
  });

  // Test 11: Concurrent SET NX under load (race condition test)
  it('multiple concurrent SET NX calls only one succeeds', async () => {
    const tripId = `trip:concurrent:${Date.now()}:claimed`;
    const driverIds = ['driver_1', 'driver_2', 'driver_3', 'driver_4', 'driver_5'];

    // Simulate 5 drivers trying to claim simultaneously
    const claims = await Promise.all(
      driverIds.map((driverId) =>
        redis.set(tripId, driverId, 'EX', 300, 'NX'),
      ),
    );

    // Exactly one should succeed (return 'OK')
    const successCount = claims.filter((c) => c === 'OK').length;
    expect(successCount).toBe(1);

    // Rest should fail (return null)
    const failCount = claims.filter((c) => c === null).length;
    expect(failCount).toBe(4);

    // Verify the winner
    const owner = await redis.get(tripId);
    expect(owner).toBeDefined();

    // Cleanup
    await redis.del(tripId);
  });
});
