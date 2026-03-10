import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from './health.js';

describe('GET /health', () => {
  it('returns 200 when db and redis are reachable', async () => {
    const app = Fastify({ logger: false });

    // Mock db and redis
    app.decorate('db', {
      execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as any);
    app.decorate('redis', {
      ping: vi.fn().mockResolvedValue('PONG'),
    } as any);

    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.services.database).toBe('ok');
    expect(body.services.redis).toBe('ok');
  });

  it('returns 503 when redis is unreachable', async () => {
    const app = Fastify({ logger: false });

    app.decorate('db', {
      execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as any);
    app.decorate('redis', {
      ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as any);

    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('degraded');
    expect(res.json().services.redis).toBe('unreachable');
  });
});
