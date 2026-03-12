import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';

const INTERNAL_SECRET = process.env['INTERNAL_SERVICE_SECRET'] ?? 'test-internal-secret';

const ORG_UUID = '11111111-1111-1111-1111-111111111111';
const USER1_UUID = '22222222-2222-2222-2222-222222222222';
const USER2_UUID = '33333333-3333-3333-3333-333333333333';
const OUTSIDER_UUID = '66666666-6666-6666-6666-666666666666';
const AUTHORITY_INSTANCE_ID = 'authority-main';
const PROP1_UUID = '44444444-4444-4444-4444-444444444444';
const UNREGISTERED_PROP_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let app: FastifyInstance;
let request: supertest.SuperTest<supertest.Test>;
let testPool: pg.Pool;

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
    ON CONFLICT (uuid) DO UPDATE SET
      preferred_language = EXCLUDED.preferred_language,
      preferred_locale = EXCLUDED.preferred_locale,
      preferred_timezone = EXCLUDED.preferred_timezone
  `, [USER1_UUID, USER2_UUID, OUTSIDER_UUID]);

  const user1IdRes = await testPool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`, [USER1_UUID],
  );
  const user1Id = user1IdRes.rows[0].id;
  const user2IdRes = await testPool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`, [USER2_UUID],
  );
  const user2Id = user2IdRes.rows[0].id;

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
    INSERT INTO measured_judgement.property_authority_assignments (property_uuid, authority_instance_id)
    VALUES ($1, $2)
    ON CONFLICT (property_uuid) DO UPDATE SET authority_instance_id = EXCLUDED.authority_instance_id
  `, [PROP1_UUID, AUTHORITY_INSTANCE_ID]);
}

function expectEnvelope(body: unknown, expectedStatus: number, expectedCode: string): void {
  const b = body as Record<string, unknown>;
  expect(b).toHaveProperty('error');
  const err = b.error as Record<string, unknown>;
  expect(err.status).toBe(expectedStatus);
  expect(err.code).toBe(expectedCode);
  expect(typeof err.message).toBe('string');
  expect(typeof err.request_id).toBe('string');
  expect((err.request_id as string).length).toBeGreaterThan(0);
  expect(typeof err.retryable).toBe('boolean');
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
    it('returns 401 when X-Internal-Secret is missing', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|dev-happy-path');
      expect(res.status).toBe(401);
      expectEnvelope(res.body, 401, 'unauthenticated');
    });

    it('returns 401 when X-Internal-Secret is wrong', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|dev-happy-path')
        .set('X-Internal-Secret', 'wrong-secret');
      expect(res.status).toBe(401);
      expectEnvelope(res.body, 401, 'unauthenticated');
    });

    it('returns 400 invalid_request when no query params provided', async () => {
      const res = await request
        .get('/identity/resolve')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when provider is missing', async () => {
      const res = await request
        .get('/identity/resolve?external_subject=auth0|dev-happy-path')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when external_subject is empty', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found when mapping not found', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=nonexistent')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 404 not_found when mapping is revoked', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|revoked-identity')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with actor_user_uuid when mapping exists', async () => {
      const res = await request
        .get('/identity/resolve?provider=auth0&external_subject=auth0|dev-happy-path')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });

    it('resolves google-oauth2 split subject to correct user uuid', async () => {
      const res = await request
        .get('/identity/resolve?provider=google-oauth2&external_subject=107951601874477150705')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });

    it('resolves google-oauth2 full sub to correct user uuid', async () => {
      const res = await request
        .get('/identity/resolve?provider=google-oauth2&external_subject=google-oauth2|107951601874477150705')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.actor_user_uuid).toBe(USER1_UUID);
    });
  });

  describe('GET /users/me/preferences', () => {
    it('returns 400 invalid_request when actor headers missing', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when actor type is not user', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-Type', 'anonymous');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when actor uuid is not a valid UUID', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', 'not-a-uuid')
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found for unknown actor_user_uuid', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with user preferences (explicit values)', async () => {
      const res = await request
        .get('/users/me/preferences')
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user');
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 400 invalid_request when permission_key is missing', async () => {
      const res = await request
        .post('/permissions/check')
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({ actor_user_uuid: USER1_UUID, organisation_uuid: ORG_UUID });
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 200 allowed:false when user is not a member', async () => {
      const res = await request
        .post('/permissions/check')
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it('returns 400 scope_mismatch when org-scoped permission is sent with property_uuids', async () => {
      const res = await request
        .post('/permissions/check')
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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

    it('returns 200 allowed:false for property-scoped permission when user is member but lacks the permission', async () => {
      const res = await request
        .post('/permissions/check')
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET)
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
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(400);
      expectEnvelope(res.body, 400, 'invalid_request');
    });

    it('returns 404 not_found when no assignment for organisation', async () => {
      const res = await request
        .get('/routing/authority-instance?organisation_uuid=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(404);
      expectEnvelope(res.body, 404, 'not_found');
    });

    it('returns 200 with authority_instance_id and base_url for known organisation', async () => {
      const res = await request
        .get(`/routing/authority-instance?organisation_uuid=${ORG_UUID}`)
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.authority_instance_id).toBe(AUTHORITY_INSTANCE_ID);
      expect(res.body.base_url).toBe('https://considered-response.internal');
    });
  });

  describe('GET /routing/operational-grace', () => {
    it('returns 200 with base_url from OPERATIONAL_GRACE_BASE_URL env var', async () => {
      const res = await request
        .get('/routing/operational-grace')
        .set('X-Internal-Secret', INTERNAL_SECRET);
      expect(res.status).toBe(200);
      expect(typeof res.body.base_url).toBe('string');
      expect(res.body.base_url.length).toBeGreaterThan(0);
    });

    it('returns 401 when no auth credential provided', async () => {
      const res = await request.get('/routing/operational-grace');
      expect(res.status).toBe(401);
    });
  });

  describe('cross-tenancy isolation on permissions', () => {
    it('returns allowed:false when checking a different org the user is not in', async () => {
      const otherOrgUuid = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
      const res = await request
        .post('/permissions/check')
        .set('X-Internal-Secret', INTERNAL_SECRET)
        .set('X-Actor-User-Uuid', USER1_UUID)
        .set('X-Actor-Type', 'user')
        .send({
          actor_user_uuid: USER1_UUID,
          organisation_uuid: otherOrgUuid,
          permission_key: 'organisation.properties.read',
        });
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });
  });
});
