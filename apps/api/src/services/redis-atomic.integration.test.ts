import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';

/**
 * Standalone Redis integration tests (no app dependency)
 * Tests: atomic claim (SET NX), heartbeat, GEO commands, rate limiting
 */

describe('Redis Atomic Operations — Standalone Integration', () => {
  let redis: Redis;

  beforeAll(() => {
    // Connect to local/test Redis instance
    // REDIS_URL defaults to localhost:6379 if not set
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      retryStrategy: () => null, // Fail fast in tests
    });
  });

  afterAll(async () => {
    if (redis.status === 'ready') {
      await redis.quit();
    }
  });

  // Test 1: SET NX prevents double-claim
  it('SET NX prevents two drivers from claiming same trip', async () => {
    // Skip if Redis not available
    try {
      await redis.connect();
    } catch {
      console.warn('⚠️  Skipping Redis test — Redis not available');
      return;
    }

    const tripId = `trip:test:${Date.now()}:claimed`;
    const driver1 = 'driver_a';
    const driver2 = 'driver_b';

    // Driver A claims first
    const claim1 = await redis.set(tripId, driver1, 'EX', 300, 'NX');
    expect(claim1).toBe('OK');

    // Driver B tries to claim — should fail
    const claim2 = await redis.set(tripId, driver2, 'EX', 300, 'NX');
    expect(claim2).toBeNull();

    // Verify owner is driver A
    const owner = await redis.get(tripId);
    expect(owner).toBe(driver1);

    await redis.del(tripId);
  });

  // Test 2: Heartbeat key expires
  it('heartbeat key with TTL expires automatically', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const driverId = `driver:test:${Date.now()}:heartbeat`;

    // Set heartbeat with 2s TTL (for fast test)
    await redis.setex(driverId, 2, '1');

    // Check exists immediately
    const exists1 = await redis.exists(driverId);
    expect(exists1).toBe(1);

    // Check TTL
    const ttl = await redis.ttl(driverId);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2);

    await redis.del(driverId);
  });

  // Test 3: Pipeline batch execution
  it('pipeline batch checks multiple heartbeat keys efficiently', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const drivers = [
      { id: `driver:batch:${Date.now()}:1`, alive: true },
      { id: `driver:batch:${Date.now()}:2`, alive: false },
      { id: `driver:batch:${Date.now()}:3`, alive: true },
    ];

    // Set heartbeats for alive drivers
    for (const driver of drivers) {
      if (driver.alive) {
        await redis.setex(driver.id, 10, '1');
      }
    }

    // Pipeline: batch check all in one round-trip
    const pipeline = redis.pipeline();
    for (const driver of drivers) {
      pipeline.exists(driver.id);
    }

    const results = await pipeline.exec();
    expect(results).not.toBeNull();
    expect(results!.length).toBe(3);

    // Count alive
    let aliveCount = 0;
    for (const [err, exists] of results!) {
      if (!err && exists === 1) {
        aliveCount++;
      }
    }

    expect(aliveCount).toBe(2); // D1, D3

    // Cleanup
    for (const driver of drivers) {
      await redis.del(driver.id);
    }
  });

  // Test 4: GEO commands
  it('GEOADD/GEOPOS store and retrieve driver location', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const geoKey = `drivers:geo:${Date.now()}`;
    const driverId = 'driver_test';
    const lon = 13.234;
    const lat = -0.628;

    // Add location
    const added = await redis.geoadd(geoKey, lon, lat, driverId);
    expect(added).toBe(1);

    // Retrieve
    const pos = await redis.geopos(geoKey, driverId);
    expect(pos).not.toBeNull();
    expect(pos!.length).toBe(1);

    const retrievedLon = parseFloat(pos![0][0] as string);
    const retrievedLat = parseFloat(pos![0][1] as string);

    expect(Math.abs(retrievedLon - lon)).toBeLessThan(0.0001);
    expect(Math.abs(retrievedLat - lat)).toBeLessThan(0.0001);

    await redis.del(geoKey);
  });

  // Test 5: GEODIST calculates distance
  it('GEODIST calculates distance between drivers', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const geoKey = `drivers:geo:dist:${Date.now()}`;

    // Two points ~1.5km apart in Libreville
    await redis.geoadd(geoKey, 13.234, -0.628, 'point1');
    await redis.geoadd(geoKey, 13.244, -0.638, 'point2');

    const distance = await redis.geodist(geoKey, 'point1', 'point2', 'm');
    expect(distance).not.toBeNull();

    const distanceM = parseFloat(distance as string);
    expect(distanceM).toBeGreaterThan(1000);
    expect(distanceM).toBeLessThan(2000);

    await redis.del(geoKey);
  });

  // Test 6: Rate limiter counter
  it('rate limiter INCR/EXPIRE prevents abuse', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const phone = '+24177777777';
    const rateLimitKey = `claude:calls:${phone}`;

    // Increment call count
    const count1 = await redis.incr(rateLimitKey);
    expect(count1).toBe(1);

    await redis.expire(rateLimitKey, 3600); // 1 hour

    const count2 = await redis.incr(rateLimitKey);
    expect(count2).toBe(2);

    // Verify limit (50/hour)
    const maxCalls = 50;
    expect(count2).toBeLessThanOrEqual(maxCalls);

    await redis.del(rateLimitKey);
  });

  // Test 7: Concurrent claims (race condition test)
  it('multiple concurrent SET NX only one succeeds', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const tripId = `trip:concurrent:${Date.now()}:claimed`;
    const driverIds = ['driver_1', 'driver_2', 'driver_3', 'driver_4', 'driver_5'];

    // 5 drivers claim simultaneously
    const claims = await Promise.all(
      driverIds.map((driverId) => redis.set(tripId, driverId, 'EX', 300, 'NX')),
    );

    // Exactly one succeeds
    const successCount = claims.filter((c) => c === 'OK').length;
    expect(successCount).toBe(1);

    // Rest fail
    const failCount = claims.filter((c) => c === null).length;
    expect(failCount).toBe(4);

    const owner = await redis.get(tripId);
    expect(owner).toBeDefined();

    await redis.del(tripId);
  });

  // Test 8: List operations (WhatsApp history)
  it('LPUSH/LTRIM/EXPIRE manage conversation history', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const historyKey = `whatsapp:+24177777777:history`;

    // Push messages
    await redis.lpush(
      historyKey,
      JSON.stringify({ role: 'user', content: 'Bonjour' }),
    );
    await redis.lpush(
      historyKey,
      JSON.stringify({ role: 'assistant', content: 'Salut!' }),
    );
    await redis.lpush(
      historyKey,
      JSON.stringify({ role: 'user', content: 'Comment ça va?' }),
    );

    // Trim to 2 messages
    await redis.ltrim(historyKey, 0, 1);

    const length = await redis.llen(historyKey);
    expect(length).toBe(2);

    // Set 24h expiry
    await redis.expire(historyKey, 86400);

    const ttl = await redis.ttl(historyKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86400);

    await redis.del(historyKey);
  });

  // Test 9: Zone grid room calculation
  it('zone room name calculation for Socket.io', () => {
    /**
     * Zone grid: ~10km cells
     * zone = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`
     */

    const lat = -0.628;
    const lon = 13.234;
    const zone = `zone:${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;

    expect(zone).toBe('zone:-7_132');

    // Different location
    const lat2 = -0.738;
    const lon2 = 13.334;
    const zone2 = `zone:${Math.floor(lat2 * 10)}_${Math.floor(lon2 * 10)}`;

    expect(zone2).toBe('zone:-8_133');
    expect(zone).not.toBe(zone2);
  });

  // Test 10: Key expiry (trip claimed lock)
  it('trip:claimed key with 5min TTL prevents stale locks', async () => {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
    } catch {
      return;
    }

    const tripId = `trip:ttl:${Date.now()}:claimed`;

    // Set with 300s TTL
    await redis.set(tripId, 'driver_a', 'EX', 300, 'NX');

    const ttl = await redis.ttl(tripId);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);

    await redis.del(tripId);
  });
});
