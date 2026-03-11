import { config } from '../config/index.js';
import { lookupPermission } from './permissions.js';
import { AppError, InvalidRequest, NotFound, UnknownPermission, ScopeMismatch, InvalidProperty, } from '../errors/index.js';
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
export async function ResolveUserIdentity(pool, provider, externalSubject) {
    if (!provider || provider.trim().length === 0) {
        throw InvalidRequest('provider is required');
    }
    if (!externalSubject || externalSubject.trim().length === 0) {
        throw InvalidRequest('external_subject is required');
    }
    const result = await pool.query(`SELECT u.uuid AS user_uuid
     FROM measured_judgement.user_identities ui
     JOIN measured_judgement.users u ON u.id = ui.user_id
     WHERE ui.provider = $1
       AND ui.external_subject = $2
       AND ui.revoked_at IS NULL`, [provider, externalSubject]);
    if (result.rows.length === 0) {
        throw NotFound('Identity mapping not found');
    }
    return { actor_user_uuid: result.rows[0].user_uuid };
}
// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------
export async function ResolveUserLocaleContext(pool, actorUserUuid) {
    const result = await pool.query(`SELECT preferred_language, preferred_locale, preferred_timezone
     FROM measured_judgement.users
     WHERE uuid = $1`, [actorUserUuid]);
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
export async function ResolveAuthorityInstance(pool, organisationUuid) {
    if (!organisationUuid || organisationUuid.trim().length === 0) {
        throw InvalidRequest('organisation_uuid is required');
    }
    const result = await pool.query(`SELECT oaa.authority_instance_id, ai.base_url
     FROM measured_judgement.organisation_authority_assignments oaa
     JOIN measured_judgement.authority_instances ai
       ON ai.id = oaa.authority_instance_id
     WHERE oaa.organisation_uuid = $1::uuid`, [organisationUuid]);
    if (result.rows.length === 0) {
        throw NotFound('No authority instance assignment found for organisation');
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
export async function AssertOrganisationMembership(pool, organisationUuid, actorUserUuid) {
    const userResult = await pool.query(`SELECT id FROM measured_judgement.users WHERE uuid = $1`, [actorUserUuid]);
    if (userResult.rows.length === 0) {
        throw NotFound();
    }
    const userId = userResult.rows[0].id;
    const memberResult = await pool.query(`SELECT id FROM measured_judgement.user_organisations
     WHERE organisation_uuid = $1::uuid AND user_id = $2`, [organisationUuid, userId]);
    if (memberResult.rows.length === 0) {
        throw NotFound();
    }
    return { user_organisation_id: memberResult.rows[0].id };
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
export async function EvaluatePermissionCoverage(pool, userOrganisationId, permissionKey, propertyUuids) {
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
        const assignmentResult = await pool.query(`SELECT ra.id AS role_assignment_id, ra.scope
       FROM measured_judgement.role_assignments ra
       JOIN measured_judgement.role_permissions rp ON rp.role_id = ra.role_id
       WHERE ra.user_organisation_id = $1
         AND rp.permission_key = $2`, [userOrganisationId, permissionKey]);
        if (assignmentResult.rows.length === 0) {
            return { allowed: false };
        }
        if (permDef.scope === 'organisation') {
            return { allowed: true };
        }
        const grantingAssignments = assignmentResult.rows;
        if (grantingAssignments.some((a) => a.scope === 'all_properties')) {
            return { allowed: true };
        }
        const dedupedPropertyUuids = [...new Set(propertyUuids)];
        const grantingIds = grantingAssignments.map((a) => a.role_assignment_id);
        const coveredResult = await pool.query(`SELECT DISTINCT property_uuid
       FROM measured_judgement.role_assignment_properties
       WHERE role_assignment_id = ANY($1)
         AND property_uuid = ANY($2::uuid[])`, [grantingIds, dedupedPropertyUuids]);
        const coveredSet = new Set(coveredResult.rows.map((r) => r.property_uuid));
        const allCovered = dedupedPropertyUuids.every((uuid) => coveredSet.has(uuid));
        return { allowed: allCovered };
    }
    catch (err) {
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
export async function CheckPermission(pool, actorUserUuid, organisationUuid, permissionKey, propertyUuids) {
    const permDef = lookupPermission(permissionKey);
    if (!permDef) {
        throw UnknownPermission(`Unknown permission key: ${permissionKey}`);
    }
    const userResult = await pool.query(`SELECT id FROM measured_judgement.users WHERE uuid = $1`, [actorUserUuid]);
    if (userResult.rows.length === 0) {
        return { allowed: false };
    }
    const userId = userResult.rows[0].id;
    const memberResult = await pool.query(`SELECT id FROM measured_judgement.user_organisations
     WHERE organisation_uuid = $1::uuid AND user_id = $2`, [organisationUuid, userId]);
    if (memberResult.rows.length === 0) {
        return { allowed: false };
    }
    const userOrganisationId = memberResult.rows[0].id;
    if (permDef.scope === 'property' && propertyUuids && propertyUuids.length > 0) {
        const dedupedUuids = [...new Set(propertyUuids)];
        const validResult = await pool.query(`SELECT COUNT(*) AS cnt
       FROM measured_judgement.property_authority_assignments
       WHERE property_uuid = ANY($1::uuid[])`, [dedupedUuids]);
        const knownCount = parseInt(validResult.rows[0].cnt, 10);
        if (knownCount !== dedupedUuids.length) {
            throw InvalidProperty('One or more property_uuids are not registered in the routing directory');
        }
    }
    return EvaluatePermissionCoverage(pool, userOrganisationId, permissionKey, propertyUuids);
}
