import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  ResolveUserIdentity,
  ResolveUserLocaleContext,
  ResolveAuthorityInstance,
  ResolveOperationalGraceInstance,
  AssertOrganisationMembership,
  ResolveOrganisationScope,
  EvaluatePermissionCoverage,
  CheckPermission,
  ValidatePropertyOrganisationScope,
} from '../../src/domain/procedures.js';

const USER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORG_UUID = '11111111-1111-4111-a111-111111111111';
const PROP_UUID = '22222222-2222-4222-a222-222222222222';

function makePool(queryResponses: Array<{ rows: unknown[] }>): Pool {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const resp = queryResponses[callIndex++];
      return Promise.resolve(resp ?? { rows: [] });
    }),
  } as unknown as Pool;
}

describe('ResolveUserIdentity', () => {
  it('returns actor_user_uuid on success', async () => {
    const pool = makePool([{ rows: [{ user_uuid: USER_UUID }] }]);
    const result = await ResolveUserIdentity(pool, 'auth0', 'auth0|abc123');
    expect(result).toEqual({ actor_user_uuid: USER_UUID });
  });

  it('throws InvalidRequest when provider is empty', async () => {
    const pool = makePool([]);
    await expect(ResolveUserIdentity(pool, '', 'auth0|abc')).rejects.toThrow('provider is required');
  });

  it('throws InvalidRequest when external_subject is empty', async () => {
    const pool = makePool([]);
    await expect(ResolveUserIdentity(pool, 'auth0', '')).rejects.toThrow('external_subject is required');
  });

  it('throws NotFound when no mapping exists', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ResolveUserIdentity(pool, 'auth0', 'auth0|unknown')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('ResolveUserLocaleContext', () => {
  it('returns resolved preferences', async () => {
    const pool = makePool([
      {
        rows: [
          {
            preferred_language: 'fr',
            preferred_locale: 'fr-FR',
            preferred_timezone: 'Europe/Paris',
          },
        ],
      },
    ]);
    const result = await ResolveUserLocaleContext(pool, USER_UUID);
    expect(result).toEqual({
      resolved_language: 'fr',
      resolved_locale: 'fr-FR',
      resolved_timezone: 'Europe/Paris',
    });
  });

  it('falls back to system defaults when preferences are null', async () => {
    const pool = makePool([
      {
        rows: [
          {
            preferred_language: null,
            preferred_locale: null,
            preferred_timezone: null,
          },
        ],
      },
    ]);
    const result = await ResolveUserLocaleContext(pool, USER_UUID);
    expect(result.resolved_language).toBe('en');
    expect(result.resolved_locale).toBe('en-AU');
    expect(result.resolved_timezone).toBe('UTC');
  });

  it('throws NotFound when user not found', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ResolveUserLocaleContext(pool, USER_UUID)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('ResolveAuthorityInstance', () => {
  it('returns authority_instance_id and base_url', async () => {
    const pool = makePool([
      {
        rows: [{ authority_instance_id: 'authority-main', base_url: 'https://considered-response.internal' }],
      },
    ]);
    const result = await ResolveAuthorityInstance(pool, ORG_UUID);
    expect(result).toEqual({
      authority_instance_id: 'authority-main',
      base_url: 'https://considered-response.internal',
    });
  });

  it('throws NotFound when no assignment exists', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ResolveAuthorityInstance(pool, ORG_UUID)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws InvalidRequest when organisation_uuid is empty', async () => {
    const pool = makePool([]);
    await expect(ResolveAuthorityInstance(pool, '')).rejects.toThrow('organisation_uuid is required');
  });
});

describe('ResolveOperationalGraceInstance', () => {
  it('returns authority_instance_id and base_url', async () => {
    const pool = makePool([
      {
        rows: [{ authority_instance_id: 'operational-grace-main', base_url: 'https://operational-grace.internal' }],
      },
    ]);
    const result = await ResolveOperationalGraceInstance(pool, PROP_UUID);
    expect(result).toEqual({
      authority_instance_id: 'operational-grace-main',
      base_url: 'https://operational-grace.internal',
    });
  });

  it('throws NotFound when no assignment exists for property', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ResolveOperationalGraceInstance(pool, PROP_UUID)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws InvalidRequest when property_uuid is empty', async () => {
    const pool = makePool([]);
    await expect(ResolveOperationalGraceInstance(pool, '')).rejects.toThrow('property_uuid is required');
  });
});

describe('AssertOrganisationMembership', () => {
  it('returns user_organisation_id on success', async () => {
    const pool = makePool([
      { rows: [{ id: 42 }] },
      { rows: [{ id: 99 }] },
    ]);
    const result = await AssertOrganisationMembership(pool, ORG_UUID, USER_UUID);
    expect(result).toEqual({ user_organisation_id: 99 });
  });

  it('throws NotFound when user not found', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(AssertOrganisationMembership(pool, ORG_UUID, USER_UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('throws NotFound when membership not found', async () => {
    const pool = makePool([{ rows: [{ id: 42 }] }, { rows: [] }]);
    await expect(AssertOrganisationMembership(pool, ORG_UUID, USER_UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('ResolveOrganisationScope', () => {
  it('returns resolved_organisation_uuid when actor is a member', async () => {
    const pool = makePool([
      { rows: [{ id: 42 }] },   // users
      { rows: [{ id: 99 }] },   // user_organisations
    ]);
    const result = await ResolveOrganisationScope(pool, USER_UUID, ORG_UUID);
    expect(result).toEqual({ resolved_organisation_uuid: ORG_UUID });
  });

  it('throws NotFound when user not found (non-leakage)', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ResolveOrganisationScope(pool, USER_UUID, ORG_UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('throws NotFound when actor is not a member (non-leakage)', async () => {
    const pool = makePool([
      { rows: [{ id: 42 }] },  // users found
      { rows: [] },             // no membership row
    ]);
    await expect(ResolveOrganisationScope(pool, USER_UUID, ORG_UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('EvaluatePermissionCoverage', () => {
  it('returns allowed: true for organisation-scoped permission with assignment', async () => {
    const pool = makePool([
      { rows: [{ role_assignment_id: 1, scope: 'org' }] },
    ]);
    const result = await EvaluatePermissionCoverage(pool, 99, 'organisation.properties.read');
    expect(result).toEqual({ allowed: true });
  });

  it('returns allowed: false when no assignment exists', async () => {
    const pool = makePool([{ rows: [] }]);
    const result = await EvaluatePermissionCoverage(pool, 99, 'organisation.properties.read');
    expect(result).toEqual({ allowed: false });
  });

  it('throws UnknownPermission for unknown key', async () => {
    const pool = makePool([]);
    await expect(EvaluatePermissionCoverage(pool, 99, 'unknown.permission')).rejects.toMatchObject({
      code: 'unknown_permission',
    });
  });

  it('throws ScopeMismatch when property_uuids provided for org-scoped permission', async () => {
    const pool = makePool([]);
    await expect(
      EvaluatePermissionCoverage(pool, 99, 'organisation.properties.read', [PROP_UUID]),
    ).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it('throws ScopeMismatch when property_uuids missing for property-scoped permission', async () => {
    const pool = makePool([]);
    await expect(
      EvaluatePermissionCoverage(pool, 99, 'reservations.view'),
    ).rejects.toMatchObject({ code: 'scope_mismatch' });
  });
});

describe('CheckPermission', () => {
  it('returns allowed: false when user not found', async () => {
    const pool = makePool([{ rows: [] }]);
    const result = await CheckPermission(pool, USER_UUID, ORG_UUID, 'organisation.properties.read');
    expect(result).toEqual({ allowed: false });
  });

  it('returns allowed: false when not a member', async () => {
    const pool = makePool([{ rows: [{ id: 1 }] }, { rows: [] }]);
    const result = await CheckPermission(pool, USER_UUID, ORG_UUID, 'organisation.properties.read');
    expect(result).toEqual({ allowed: false });
  });

  it('returns allowed: true for member with org-scoped permission', async () => {
    const pool = makePool([
      { rows: [{ id: 1 }] },
      { rows: [{ id: 99 }] },
      { rows: [{ role_assignment_id: 1, scope: 'org' }] },
    ]);
    const result = await CheckPermission(pool, USER_UUID, ORG_UUID, 'organisation.properties.read');
    expect(result).toEqual({ allowed: true });
  });
});

describe('ValidatePropertyOrganisationScope', () => {
  it('returns void when property_uuid and organisation_uuid match a row', async () => {
    const pool = makePool([{ rows: [{ '?column?': 1 }] }]);
    await expect(ValidatePropertyOrganisationScope(pool, PROP_UUID, ORG_UUID)).resolves.toBeUndefined();
  });

  it('throws NotFound when no matching row exists', async () => {
    const pool = makePool([{ rows: [] }]);
    await expect(ValidatePropertyOrganisationScope(pool, PROP_UUID, ORG_UUID)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('throws InvalidRequest when property_uuid is empty', async () => {
    const pool = makePool([]);
    await expect(ValidatePropertyOrganisationScope(pool, '', ORG_UUID)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('throws InvalidRequest when organisation_uuid is empty', async () => {
    const pool = makePool([]);
    await expect(ValidatePropertyOrganisationScope(pool, PROP_UUID, '')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });
});
