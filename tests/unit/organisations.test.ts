import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

const USER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORG_UUID = '11111111-1111-4111-a111-111111111111';
const INTERNAL_SECRET = 'test-internal-secret';

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/db/pool.js', () => ({
  pool: { query: mockQuery },
}));

let app: FastifyInstance;

describe('GET /organisations/resolve-scope', () => {
  beforeAll(async () => {
    const { createApp } = await import('../../src/http/app.js');
    app = createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with resolved_organisation_uuid when actor is a member', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })   // users
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });  // user_organisations

    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=${USER_UUID}&requested_organisation_uuid=${ORG_UUID}`,
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.json()).toEqual({ resolved_organisation_uuid: ORG_UUID });
  });

  it('returns 404 when actor is not a member (non-leakage)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // users found
      .mockResolvedValueOnce({ rows: [] });            // not a member

    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=${USER_UUID}&requested_organisation_uuid=${ORG_UUID}`,
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });

    expect(resp.statusCode).toBe(404);
    expect(resp.json().error.code).toBe('not_found');
  });

  it('returns 404 when actor user not found (non-leakage)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });  // user not found

    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=${USER_UUID}&requested_organisation_uuid=${ORG_UUID}`,
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });

    expect(resp.statusCode).toBe(404);
    expect(resp.json().error.code).toBe('not_found');
  });

  it('returns 400 for malformed actor_user_uuid', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=not-a-uuid&requested_organisation_uuid=${ORG_UUID}`,
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });

    expect(resp.statusCode).toBe(400);
    expect(resp.json().error.code).toBe('invalid_request');
  });

  it('returns 400 for malformed requested_organisation_uuid', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=${USER_UUID}&requested_organisation_uuid=not-a-uuid`,
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });

    expect(resp.statusCode).toBe(400);
    expect(resp.json().error.code).toBe('invalid_request');
  });

  it('returns 401 when no auth credentials supplied', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/organisations/resolve-scope?actor_user_uuid=${USER_UUID}&requested_organisation_uuid=${ORG_UUID}`,
    });

    expect(resp.statusCode).toBe(401);
  });
});
