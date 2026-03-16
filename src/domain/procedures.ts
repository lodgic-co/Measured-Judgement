import type { Pool } from 'pg';
import { config } from '../config/index.js';
import { lookupPermission } from './permissions.js';
import {
  AppError,
  InvalidRequest,
  NotFound,
  UnknownPermission,
  ScopeMismatch,
  InvalidProperty,
} from '../errors/index.js';

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves an external identity (provider + external_subject) to the
 * internal actor_user_uuid. This is the platform bootstrap call.
 *
 * Returns only actor_user_uuid — identity resolution and routing resolution
 * are separate concerns and must remain decoupled.
 */
export async function ResolveUserIdentity(
  pool: Pool,
  provider: string,
  externalSubject: string,
): Promise<{ actor_user_uuid: string }> {
  if (!provider || provider.trim().length === 0) {
    throw InvalidRequest('provider is required');
  }
  if (!externalSubject || externalSubject.trim().length === 0) {
    throw InvalidRequest('external_subject is required');
  }

  const result = await pool.query(
    `SELECT u.uuid AS user_uuid
     FROM measured_judgement.user_identities ui
     JOIN measured_judgement.users u ON u.id = ui.user_id
     WHERE ui.provider = $1
       AND ui.external_subject = $2
       AND ui.revoked_at IS NULL`,
    [provider, externalSubject],
  );

  if (result.rows.length === 0) {
    throw NotFound('Identity mapping not found');
  }

  return { actor_user_uuid: result.rows[0].user_uuid };
}

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

export async function ResolveUserLocaleContext(
  pool: Pool,
  actorUserUuid: string,
): Promise<{ resolved_language: string; resolved_locale: string; resolved_timezone: string }> {
  const result = await pool.query(
    `SELECT preferred_language, preferred_locale, preferred_timezone
     FROM measured_judgement.users
     WHERE uuid = $1`,
    [actorUserUuid],
  );

  if (result.rows.length === 0) {
    throw NotFound('User not found');
  }

  const row = result.rows[0];

  return {
    resolved_language: row.preferred_language ?? config.SYSTEM_DEFAULT_LANGUAGE,
    resolved_locale: row.preferred_locale ?? config.SYSTEM_DEFAULT_LOCALE,
    resolved_timezone: row.preferred_timezone ?? config.SYSTEM_DEFAULT_TIMEZONE,
  };
}

// ---------------------------------------------------------------------------
// Authority Routing
// ---------------------------------------------------------------------------

/**
 * Resolves the authority instance for a given organisation UUID.
 *
 * This is the database-backed routing lookup. polite-intervention calls this
 * for every organisation-scoped request. Routing decisions occur only at the
 * edge, sourced from this service.
 */
export async function ResolveAuthorityInstance(
  pool: Pool,
  organisationUuid: string,
): Promise<{ authority_instance_id: string; base_url: string }> {
  if (!organisationUuid || organisationUuid.trim().length === 0) {
    throw InvalidRequest('organisation_uuid is required');
  }

  const result = await pool.query(
    `SELECT oaa.authority_instance_id, ai.base_url
     FROM measured_judgement.organisation_authority_assignments oaa
     JOIN measured_judgement.authority_instances ai
       ON ai.id = oaa.authority_instance_id
     WHERE oaa.organisation_uuid = $1::uuid`,
    [organisationUuid],
  );

  if (result.rows.length === 0) {
    throw NotFound('No authority instance assignment found for organisation');
  }

  return {
    authority_instance_id: result.rows[0].authority_instance_id,
    base_url: result.rows[0].base_url,
  };
}

/**
 * Resolves the operational-grace instance for a property_uuid.
 *
 * Queries property_authority_assignments (property-scoped routing table)
 * joined to authority_instances. Returns both the instance id and base_url,
 * consistent with the authority-instance routing shape.
 *
 * The permission-validation COUNT(*) query is unaffected — it does not
 * inspect the authority_instance_id value.
 */
export async function ResolveOperationalGraceInstance(
  pool: Pool,
  propertyUuid: string,
): Promise<{ authority_instance_id: string; base_url: string }> {
  if (!propertyUuid || propertyUuid.trim().length === 0) {
    throw InvalidRequest('property_uuid is required');
  }

  const result = await pool.query(
    `SELECT paa.authority_instance_id, ai.base_url
     FROM measured_judgement.property_authority_assignments paa
     JOIN measured_judgement.authority_instances ai
       ON ai.id = paa.authority_instance_id
     WHERE paa.property_uuid = $1::uuid`,
    [propertyUuid],
  );

  if (result.rows.length === 0) {
    throw NotFound('No operational-grace instance assignment found for property');
  }

  return {
    authority_instance_id: result.rows[0].authority_instance_id,
    base_url: result.rows[0].base_url,
  };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * Asserts that the actor is a member of the organisation.
 * Returns internal IDs for use in downstream permission checks.
 * Throws NotFound (404) on any failure — non-leakage semantic.
 */
export async function AssertOrganisationMembership(
  pool: Pool,
  organisationUuid: string,
  actorUserUuid: string,
): Promise<{ user_organisation_id: number }> {
  const userResult = await pool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`,
    [actorUserUuid],
  );
  if (userResult.rows.length === 0) {
    throw NotFound();
  }
  const userId: number = userResult.rows[0].id;

  const memberResult = await pool.query(
    `SELECT id FROM measured_judgement.user_organisations
     WHERE organisation_uuid = $1::uuid AND user_id = $2`,
    [organisationUuid, userId],
  );
  if (memberResult.rows.length === 0) {
    throw NotFound();
  }

  return { user_organisation_id: memberResult.rows[0].id };
}

// ---------------------------------------------------------------------------
// Organisation Scope Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves and verifies organisation scope for a delegated actor.
 *
 * Wraps AssertOrganisationMembership and returns the platform-trusted
 * resolved_organisation_uuid after membership is verified. The returned UUID
 * echoes the input after verification — the value is not transformed, only
 * its trust level is elevated from client-supplied to platform-asserted.
 *
 * Throws NotFound (404) for any failure mode to preserve non-leakage
 * semantics: the caller cannot distinguish a missing organisation from a
 * non-member. Called by polite-intervention as a mandatory pre-flight step
 * before asserting X-Organisation-Uuid in delegated actor context.
 */
export async function ResolveOrganisationScope(
  pool: Pool,
  actorUserUuid: string,
  requestedOrganisationUuid: string,
): Promise<{ resolved_organisation_uuid: string }> {
  await AssertOrganisationMembership(pool, requestedOrganisationUuid, actorUserUuid);
  return { resolved_organisation_uuid: requestedOrganisationUuid };
}

// ---------------------------------------------------------------------------
// Permission Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates whether the user holds a given permission within the organisation,
 * optionally scoped to specific properties.
 *
 * Returns { allowed: boolean } without throwing. Callers that need enforcement
 * should use AssertOrganisationPermission or CheckPermission.
 */
export async function EvaluatePermissionCoverage(
  pool: Pool,
  userOrganisationId: number,
  permissionKey: string,
  propertyUuids?: string[],
): Promise<{ allowed: boolean }> {
  const permDef = lookupPermission(permissionKey);
  if (!permDef) {
    throw UnknownPermission(`Unknown permission key: ${permissionKey}`);
  }

  if (permDef.scope === 'organisation' && propertyUuids !== undefined) {
    throw ScopeMismatch('Organisation scoped permission must not include property_uuids');
  }
  if (permDef.scope === 'property' && (!propertyUuids || propertyUuids.length === 0)) {
    throw ScopeMismatch('Property scoped permission requires non-empty property_uuids');
  }

  try {
    const assignmentResult = await pool.query(
      `SELECT ra.id AS role_assignment_id, ra.scope
       FROM measured_judgement.role_assignments ra
       JOIN measured_judgement.role_permissions rp ON rp.role_id = ra.role_id
       WHERE ra.user_organisation_id = $1
         AND rp.permission_key = $2`,
      [userOrganisationId, permissionKey],
    );

    if (assignmentResult.rows.length === 0) {
      return { allowed: false };
    }

    if (permDef.scope === 'organisation') {
      return { allowed: true };
    }

    const grantingAssignments = assignmentResult.rows as Array<{
      role_assignment_id: number;
      scope: string;
    }>;

    if (grantingAssignments.some((a) => a.scope === 'all_properties')) {
      return { allowed: true };
    }

    const dedupedPropertyUuids = [...new Set(propertyUuids!)];
    const grantingIds = grantingAssignments.map((a) => a.role_assignment_id);

    const coveredResult = await pool.query(
      `SELECT DISTINCT property_uuid
       FROM measured_judgement.role_assignment_properties
       WHERE role_assignment_id = ANY($1)
         AND property_uuid = ANY($2::uuid[])`,
      [grantingIds, dedupedPropertyUuids],
    );

    const coveredSet = new Set(coveredResult.rows.map((r: { property_uuid: string }) => r.property_uuid));
    const allCovered = dedupedPropertyUuids.every((uuid) => coveredSet.has(uuid));

    return { allowed: allCovered };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    return { allowed: false };
  }
}

/**
 * Full permission check: resolves membership, validates property ownership
 * if property-scoped, then evaluates coverage.
 *
 * Called by domain services (e.g. considered-response) via POST /permissions/check.
 * The edge does not call this — enforcement occurs in the service that owns
 * the protected domain behaviour.
 */
// ---------------------------------------------------------------------------
// Property-to-Organisation Scope Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a property_uuid belongs to the given organisation_uuid.
 *
 * Queries organisation_properties (the dedicated ownership authority record,
 * separate from property_authority_assignments). Returns void on success.
 *
 * Throws NotFound() — without a distinguishing message — for all denial
 * cases: "property not registered" and "property registered to a different
 * organisation" are externally identical (non-leakage invariant).
 *
 * This is structural scope validation, not permission evaluation.
 * Called by polite-intervention's assertPropertyBelongsToOrganisation procedure.
 */
export async function ValidatePropertyOrganisationScope(
  pool: Pool,
  propertyUuid: string,
  organisationUuid: string,
): Promise<void> {
  if (!propertyUuid || propertyUuid.trim().length === 0) {
    throw InvalidRequest('property_uuid is required');
  }
  if (!organisationUuid || organisationUuid.trim().length === 0) {
    throw InvalidRequest('organisation_uuid is required');
  }

  const result = await pool.query(
    `SELECT 1
     FROM measured_judgement.organisation_properties
     WHERE property_uuid = $1::uuid
       AND organisation_uuid = $2::uuid
     LIMIT 1`,
    [propertyUuid, organisationUuid],
  );

  if (result.rows.length === 0) {
    throw NotFound();
  }
}

export async function CheckPermission(
  pool: Pool,
  actorUserUuid: string,
  organisationUuid: string,
  permissionKey: string,
  propertyUuids?: string[],
): Promise<{ allowed: boolean }> {
  const permDef = lookupPermission(permissionKey);
  if (!permDef) {
    throw UnknownPermission(`Unknown permission key: ${permissionKey}`);
  }

  const userResult = await pool.query(
    `SELECT id FROM measured_judgement.users WHERE uuid = $1`,
    [actorUserUuid],
  );
  if (userResult.rows.length === 0) {
    return { allowed: false };
  }
  const userId: number = userResult.rows[0].id;

  const memberResult = await pool.query(
    `SELECT id FROM measured_judgement.user_organisations
     WHERE organisation_uuid = $1::uuid AND user_id = $2`,
    [organisationUuid, userId],
  );
  if (memberResult.rows.length === 0) {
    return { allowed: false };
  }
  const userOrganisationId: number = memberResult.rows[0].id;

  if (permDef.scope === 'property' && propertyUuids && propertyUuids.length > 0) {
    const dedupedUuids = [...new Set(propertyUuids)];
    const validResult = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM measured_judgement.property_authority_assignments
       WHERE property_uuid = ANY($1::uuid[])`,
      [dedupedUuids],
    );
    const knownCount = parseInt(validResult.rows[0].cnt as string, 10);
    if (knownCount !== dedupedUuids.length) {
      throw InvalidProperty('One or more property_uuids are not registered in the routing directory');
    }
  }

  return EvaluatePermissionCoverage(pool, userOrganisationId, permissionKey, propertyUuids);
}
