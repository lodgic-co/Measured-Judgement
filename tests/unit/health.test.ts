import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

async function makeRequest(path: string, method = 'GET') {
  const resp = await app.inject({ method, url: path });
  return { status: resp.statusCode, body: resp.json() };
}

describe('health', () => {
  beforeAll(async () => {
    const { createApp } = await import('../../src/http/app.js');
    app = createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200', async () => {
    const { status, body } = await makeRequest('/health/live');
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('health/ready with DB check', () => {
  let setReady: (v: boolean) => void;
  let setDbPool: (p: unknown) => void;

  beforeAll(async () => {
    const { createApp } = await import('../../src/http/app.js');
    const health = await import('../../src/routes/health.js');
    setReady = health.setReady;
    setDbPool = health.setDbPool;
    app = createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    setReady(false);
  });

  it('returns 503 when server is not ready', async () => {
    const { status, body } = await makeRequest('/health/ready');
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'not_ready' });
  });

  it('returns 503 when ready but no DB pool set', async () => {
    setReady(true);
    setDbPool(null as unknown as import('pg').Pool);
    const { status, body } = await makeRequest('/health/ready');
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'not_ready' });
  });

  it('returns 200 when ready and DB responds', async () => {
    setReady(true);
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: vi.fn(),
    };
    const mockPool = { connect: vi.fn().mockResolvedValue(mockClient) };
    setDbPool(mockPool as unknown as import('pg').Pool);

    const { status, body } = await makeRequest('/health/ready');
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ready' });
    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 503 when DB query throws', async () => {
    setReady(true);
    const mockClient = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
      release: vi.fn(),
    };
    const mockPool = { connect: vi.fn().mockResolvedValue(mockClient) };
    setDbPool(mockPool as unknown as import('pg').Pool);

    const { status, body } = await makeRequest('/health/ready');
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'not_ready' });
  });

  it('does not leak error details in 503', async () => {
    setReady(true);
    const mockPool = {
      connect: vi.fn().mockRejectedValue(new Error('FATAL: password authentication failed')),
    };
    setDbPool(mockPool as unknown as import('pg').Pool);

    const { status, body } = await makeRequest('/health/ready');
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'not_ready' });
    expect(JSON.stringify(body)).not.toContain('FATAL');
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
