import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';

vi.mock('../../src/auth/verify-token.js', () => ({
  verifyServiceToken: vi.fn().mockImplementation(async (request: { callerServiceId: string }) => {
    request.callerServiceId = 'test-client';
  }),
}));

const AUTH_HEADER = 'Bearer test-token';

const ORG_UUID = '11111111-1111-4111-a111-111111111111';
const USER1_UUID = '22222222-2222-4222-a222-222222222222';
const USER2_UUID = '33333333-3333-4333-a333-333333333333';
const OUTSIDER_UUID = '66666666-6666-4666-a666-666666666666';
const AUTHORITY_INSTANCE_ID = 'authority-main';
const OG_INSTANCE_ID = 'operational-grace-main';
const PROP1_UUID = '44444444-4444-4444-a444-444444444444';
const UNREGISTERED_PROP_UUID = 'ffffffff-ffff-4fff-afff-ffffffffffff';
/** Organisation UUID used when asserting cross-tenant / wrong-org behaviour (not ORG_UUID). */
const OTHER_ORG_UUID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

let app: FastifyInstance;
let request: supertest.SuperTest<supertest.Test>;
let testPool: pg.Pool;

async function resetSeedMemberships(pool: pg.Pool, userIds: number[]): Promise<void> {
  await pool.query(
    `DELETE FROM measured_judgement.user_organisations
     WHERE organisation_uuid = $1::uuid
       AND user_id = ANY($2::int[])`,
    [ORG_UUID, userIds],
  );
}

async function seedTestData(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) throw new Error('DATABASE_URL is required for integration tests');

  testPool = new pg.Pool({ connectionString: dbUrl });

  await testPool.query(`
    INSERT INTO measured_judgement.users (uuid, email, name, preferred_language, preferred_locale, preferred_timezone)
    VALUES
      ($1, 'happy@example.com', 'Happy User', 'en', 'en-AU', 'Australia/Sydney'),
      ($2, 'secondary@example.com', 'Secondary User', NULL, NULL, NULL),
      ($3, 'outsider@example.com', 'Outsider User', 'de', 'de-DE', 'Europe/Berlin')
    ON CONFLICT (email) DO UPDATE SET
      uuid = EXCLUDED.uuid,
      preferred_language = EXCLUDED.preferred_language,
      preferred_locale = EXCLUDED.preferred_locale,
      preferred_timezone = EXCLUDED.preferred_timezone
  `, [USER1_UUID, USER2_UUID, OUTSIDER_UUID]);

  const user1IdRes = await testPool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`, [USER1_UUID],
  );
  if (user1IdRes.rowCount !== 1 || !user1IdRes.rows[0]?.id) {
    throw new Error(`Failed to resolve seeded user id for USER1_UUID: ${USER1_UUID}`);
  }
  const user1Id = user1IdRes.rows[0].id;
  const user2IdRes = await testPool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`, [USER2_UUID],
  );
  if (user2IdRes.rowCount !== 1 || !user2IdRes.rows[0]?.id) {
    throw new Error(`Failed to resolve seeded user id for USER2_UUID: ${USER2_UUID}`);
  }
  const user2Id = user2IdRes.rows[0].id;

  // Reset memberships for the fixed integration-test users so prior runs or
  // dev-seed fixtures cannot leak role assignments into this suite.
  await resetSeedMemberships(testPool, [user1Id, user2Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject, revoked_at)
    VALUES ($1, 'auth0', 'auth0|dev-happy-path', NULL)
    ON CONFLICT (provider, external_subject) DO UPDATE SET revoked_at = NULL
  `, [user1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject, revoked_at)
    VALUES ($1, 'auth0', 'auth0|revoked-identity', now())
    ON CONFLICT (provider, external_subject) DO UPDATE SET revoked_at = now()
  `, [user1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject, revoked_at)
    VALUES ($1, 'google-oauth2', '107951601874477150705', NULL)
    ON CONFLICT (provider, external_subject) DO UPDATE SET revoked_at = NULL
  `, [user1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject, revoked_at)
    VALUES ($1, 'google-oauth2', 'google-oauth2|107951601874477150705', NULL)
    ON CONFLICT (provider, external_subject) DO UPDATE SET revoked_at = NULL
  `, [user1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_organisations (organisation_uuid, user_id)
    VALUES ($1, $2)
    ON CONFLICT (organisation_uuid, user_id) DO NOTHING
  `, [ORG_UUID, user1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.user_organisations (organisation_uuid, user_id)
    VALUES ($1, $2)
    ON CONFLICT (organisation_uuid, user_id) DO NOTHING
  `, [ORG_UUID, user2Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.roles (organisation_uuid, name)
    VALUES ($1, 'Org Admin')
    ON CONFLICT (organisation_uuid, name) DO NOTHING
  `, [ORG_UUID]);

  const roleIdRes = await testPool.query(
    `SELECT id FROM measured_judgement.roles WHERE organisation_uuid = $1 AND name = 'Org Admin'`,
    [ORG_UUID],
  );
  if (roleIdRes.rows.length === 0) {
    throw new Error('Test setup failed: Org Admin role was not found for organisation.');
  }
  const roleId = roleIdRes.rows[0].id;

  await testPool.query(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    VALUES ($1, 'organisation.properties.read')
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `, [roleId]);

  await testPool.query(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    VALUES ($1, 'rate_plans.view')
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `, [roleId]);

  const uo1IdRes = await testPool.query(
    `SELECT id FROM measured_judgement.user_organisations WHERE organisation_uuid = $1 AND user_id = $2`,
    [ORG_UUID, user1Id],
  );
  if (uo1IdRes.rows.length === 0) {
    throw new Error(
      `Test setup failed: no user_organisations row found for organisation_uuid=${ORG_UUID} and user_id=${user1Id}`,
    );
  }
  const uo1Id = uo1IdRes.rows[0].id;

  await testPool.query(`
    INSERT INTO measured_judgement.role_assignments (role_id, scope, user_organisation_id)
    VALUES ($1, 'all_properties', $2)
    ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
  `, [roleId, uo1Id]);

  await testPool.query(`
    INSERT INTO measured_judgement.authority_instances (id, base_url)
    VALUES ($1, 'https://considered-response.internal')
    ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url
  `, [AUTHORITY_INSTANCE_ID]);

  await testPool.query(`
    INSERT INTO measured_judgement.authority_instances (id, base_url)
    VALUES ($1, 'https://operational-grace.internal')
    ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url
  `, [OG_INSTANCE_ID]);

  await testPool.query(`
    INSERT INTO measured_judgement.organisation_authority_assignments (organisation_uuid, authority_instance_id)
    VALUES ($1, $2)
    ON CONFLICT (organisation_uuid) DO UPDATE SET authority_instance_id = EXCLUDED.authority_instance_id
  `, [ORG_UUID, AUTHORITY_INSTANCE_ID]);

  await testPool.query(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    VALUES ($1, 'property.configure')
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `, [roleId]);

  await testPool.query(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    VALUES ($1, 'pricing.quote')
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `, [roleId]);

  await testPool.query(`
    INSERT INTO measured_judgement.property_authority_assignments (property_uuid, authority_instance_id)
    VALUES ($1, $2)
    ON CONFLICT (property_uuid) DO UPDATE SET authority_instance_id = EXCLUDED.authority_instance_id
  `, [PROP1_UUID, OG_INSTANCE_ID]);

  await testPool.query(`
    INSERT INTO measured_judgement.organisation_properties (organisation_uuid, property_uuid)
    VALUES ($1, $2)
    ON CONFLICT (property_uuid) DO UPDATE SET organisation_uuid = EXCLUDED.organisation_uuid
  `, [ORG_UUID, PROP1_UUID]);
}

interface ErrorDetails {
  status: number;
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
}

interface ErrorEnvelope {
  error: ErrorDetails;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isErrorDetails(value: unknown): value is ErrorDetails {
  if (!isRecord(value)) return false;
  return (
    typeof value.status === 'number' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.request_id === 'string' &&
    typeof value.retryable === 'boolean'
  );
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value)) return false;
  return isErrorDetails(value.error);
}

function expectEnvelope(body: unknown, expectedStatus: number, expectedCode: string): void {
  expect(isErrorEnvelope(body)).toBe(true);
  if (!isErrorEnvelope(body)) return;

  expect(body.error.status).toBe(expectedStatus);
  expect(body.error.code).toBe(expectedCode);
  expect(typeof body.error.message).toBe('string');
  expect(typeof body.error.request_id).toBe('string');
  expect(body.error.request_id.length).toBeGreaterThan(0);
  expect(typeof body.error.retryable).toBe('boolean');
}

describe('measured-judgement endpoint integration tests', () => {
  beforeAll(async () => {
    await seedTestData();

    const { createApp } = await import('../../src/http/app.js');
    app = createApp();
    await app.ready();
    request = supertest(app.server) as unknown as supertest.SuperTest<supertest.Test>;
  }, 30_000);

  afterAll(async () => {
    await app.close();
    const { closePool } = await import('../../src/db/pool.js');
    await closePool();
    if (testPool) await testPool.end();
  });

  describe('GET /identity/resolve', () => {
    it('returns 401 when auth fails', async () => {
      const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
      vi.mocked(verifyServiceToken).mockRejectedValueOnce(
        new (await import('../../src/errors/index.js')).AppError({ status: 401, code: 'unauthenticated', message: 'Unauthorized', retryable: false }),
      );
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|dev-happy-path');
      expect(res.status).toBe(401);
      expectEnvelope(res.body, 401, 'unauthenticated');
    });

    it('returns 400 invalid_request when no query params provided', async () => {
      const res = await request
        .get('/identity/resolve')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when provider is missing', async () => {
      const res = await request
        .get('/identity/resolve?external_subject=auth0|dev-happy-path')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when external_subject is empty', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found when mapping not found', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=nonexistent')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 404 not_found when mapping is revoked', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|revoked-identity')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with actor_user_uuid when mapping exists', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|dev-happy-path')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });

    it('resolves google-oauth2 split subject to correct user uuid', async () => {
      const res = await request
        .get('/identity/resolve?provider=google-oauth2&external_subject=107951601874477150705')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });

    it('resolves google-oauth2 full sub to correct user uuid', async () => {
      const res = await request
        .get('/identity/resolve?provider=google-oauth2&external_subject=google-oauth2|107951601874477150705')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });
  });

  describe('GET /users/me/preferences', () => {
    it('returns 400 invalid_request when actor headers missing', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when actor type is not user', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-Type', 'anonymous');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when actor uuid is not a valid UUID', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', 'not-a-uuid')
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found for unknown actor_user_uuid', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee')
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with user preferences (explicit values)', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(200);
      expect(res.body.language).toBe('en');
      expect(res.body.locale).toBe('en-AU');
      expect(res.body.timezone).toBe('Australia/Sydney');
    });

    it('returns 200 with system defaults when user prefs are null', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER2_UUID)
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(200);
      expect(res.body.language).toBe(process.env['SYSTEM_DEFAULT_LANGUAGE'] ?? 'en');
      expect(res.body.locale).toBe(process.env['SYSTEM_DEFAULT_LOCALE'] ?? 'en-AU');
      expect(res.body.timezone).toBe(process.env['SYSTEM_DEFAULT_TIMEZONE'] ?? 'UTC');
    });
  });

  describe('POST /permissions/check', () => {
    it('returns 400 invalid_request when body is missing', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when permission_key is missing', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({ actor_user_uuid: USER1_UUID, organisation_uuid: ORG_UUID });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 200 allowed:false when user is not a member', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', OUTSIDER_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: OUTSIDER_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it('returns 200 allowed:false when user lacks the permission', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER2_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER2_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it('returns 200 allowed:true when user has the permission', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });

    it('returns 200 allowed:true for rate_plans.view permission (org-scoped)', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'rate_plans.view',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });

    it('returns 400 for unknown permission key', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'nonexistent.permission.key',
        });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'unknown_permission');
    });

    it('non-leakage: returns 200 allowed:false for unknown organisation (not 404)', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee',
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it('returns 400 scope_mismatch when org-scoped permission is sent with property_uuids', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'organisation.properties.read',
          property_uuids: [PROP1_UUID],
        });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'scope_mismatch');
    });

    it('returns 400 scope_mismatch when property-scoped permission is sent without property_uuids', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'property.configure',
        });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'scope_mismatch');
    });

    it('returns 200 allowed:true for property-scoped permission when user has all_properties scope', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'property.configure',
          property_uuids: [PROP1_UUID],
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });

    it('returns 200 allowed:true for pricing.quote when user has property coverage', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'pricing.quote',
          property_uuids: [PROP1_UUID],
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    });

    it('returns 200 allowed:false for property-scoped permission when user is member but lacks the permission', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER2_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER2_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'property.configure',
          property_uuids: [PROP1_UUID],
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it('returns 400 invalid_property when property_uuid is not registered in routing directory', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: ORG_UUID,
          permission_key: 'property.configure',
          property_uuids: [UNREGISTERED_PROP_UUID],
        });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_property');
    });
  });

  describe('GET /routing/authority-instance', () => {
    it('returns 400 invalid_request when organisation_uuid missing', async () => {
      const res = await request
        .get('/routing/authority-instance')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found when no assignment for organisation', async () => {
      const res = await request
        .get('/routing/authority-instance?organisation_uuid=aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with authority_instance_id and base_url for known organisation', async () => {
      const res = await request
        .get(`/routing/authority-instance?organisation_uuid=${ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.authority_instance_id).toBe(AUTHORITY_INSTANCE_ID);
      expect(res.body.base_url).toBe('https://considered-response.internal');
    });
  });

  describe('GET /routing/operational-grace', () => {
    it('returns 400 when property_uuid is missing', async () => {
      const res = await request
        .get('/routing/operational-grace')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 when property_uuid is not a valid UUID', async () => {
      const res = await request
        .get('/routing/operational-grace?property_uuid=not-a-uuid')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 when no assignment exists for property', async () => {
      const res = await request
        .get(`/routing/operational-grace?property_uuid=${UNREGISTERED_PROP_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with authority_instance_id and base_url for known property', async () => {
      const res = await request
        .get(`/routing/operational-grace?property_uuid=${PROP1_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.authority_instance_id).toBe(OG_INSTANCE_ID);
      expect(res.body.base_url).toBe('https://operational-grace.internal');
    });

    it('returns 401 when auth fails', async () => {
      const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
      vi.mocked(verifyServiceToken).mockRejectedValueOnce(
        new (await import('../../src/errors/index.js')).AppError({ status: 401, code: 'unauthenticated', message: 'Unauthorized', retryable: false }),
      );
      const res = await request.get(`/routing/operational-grace?property_uuid=${PROP1_UUID}`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /properties/validate-scope', () => {
    it('returns 200 with property_uuid and organisation_uuid when property belongs to organisation', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=${PROP1_UUID}&organisation_uuid=${ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.body.property_uuid).toBe(PROP1_UUID);
      expect(res.body.organisation_uuid).toBe(ORG_UUID);
    });

    it('returns 404 when property exists but belongs to a different organisation', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=${PROP1_UUID}&organisation_uuid=${OTHER_ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 404 when property_uuid is not registered in organisation_properties', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=${UNREGISTERED_PROP_UUID}&organisation_uuid=${ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 400 when property_uuid is a malformed UUID', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=not-a-uuid&organisation_uuid=${ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 when organisation_uuid is a malformed UUID', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=${PROP1_UUID}&organisation_uuid=not-a-uuid`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 when property_uuid is missing', async () => {
      const res = await request
        .get(`/properties/validate-scope?organisation_uuid=${ORG_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 when organisation_uuid is missing', async () => {
      const res = await request
        .get(`/properties/validate-scope?property_uuid=${PROP1_UUID}`)
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 401 when auth fails', async () => {
      const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
      vi.mocked(verifyServiceToken).mockRejectedValueOnce(
        new (await import('../../src/errors/index.js')).AppError({ status: 401, code: 'unauthenticated', message: 'Unauthorized', retryable: false }),
      );
      const res = await request.get(`/properties/validate-scope?property_uuid=${PROP1_UUID}&organisation_uuid=${ORG_UUID}`);
      expect(res.status).toBe(401);
    });
  });

  describe('cross-tenancy isolation on permissions', () => {
    it('returns allowed:false when checking a different org the user is not in', async () => {
      const res = await request
        .post('/permissions/check')
        .set('Authorization', AUTH_HEADER)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: OTHER_ORG_UUID,
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });
  });
});
