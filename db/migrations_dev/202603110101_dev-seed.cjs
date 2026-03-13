/**
 * Development seed — users, identities, memberships, roles, permissions,
 * and routing directory.
 *
 * Users, roles, and permission data were previously seeded in
 * considered-response dev seeds. They are consolidated here now that
 * measured-judgement owns identity and authority.
 *
 * UUIDs match considered-response dev seeds exactly for cross-service
 * consistency in the local dev environment.
 *
 * NOTE: ORG2_UUID ('22222222-...') shares its value with USER1_UUID.
 * This is an existing quirk of the original CR dev seeds — the same UUID
 * string was reused for different entity types in different services.
 */

const ORG1_UUID  = '11111111-1111-4111-a111-111111111111';
const ORG2_UUID  = '22222222-2222-4222-a222-222222222222';
const USER1_UUID = '22222222-2222-4222-a222-222222222222';
const USER2_UUID = '33333333-3333-4333-a333-333333333333';
const USER3_UUID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const PROP1_UUID = '44444444-4444-4444-a444-444444444444';
const PROP2_UUID = '55555555-5555-4555-a555-555555555555';
const PROP3_UUID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

module.exports.up = (pgm) => {

  // ── Users ──────────────────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.users
      (uuid, email, name, preferred_language, preferred_locale, preferred_timezone)
    VALUES
      ('${USER1_UUID}', 'happy@example.com',            'Happy User',        'en', 'en-AU', 'Australia/Sydney'),
      ('${USER2_UUID}', 'secondary@example.com',        'Secondary User',    'fr', 'fr-FR', 'Europe/Paris'),
      ('${USER3_UUID}', 'second-org-user@example.com',  'Second Org User',    NULL,  NULL,   NULL)
    ON CONFLICT (uuid) DO NOTHING
  `);

  // ── User identities ────────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject)
    SELECT id, 'auth0', 'auth0|dev-happy-path'
    FROM measured_judgement.users WHERE uuid = '${USER1_UUID}'
    ON CONFLICT (provider, external_subject) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject)
    SELECT id, 'google-oauth2', '107951601874477150705'
    FROM measured_judgement.users WHERE uuid = '${USER1_UUID}'
    ON CONFLICT (provider, external_subject) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject)
    SELECT id, 'google-oauth2', 'google-oauth2|107951601874477150705'
    FROM measured_judgement.users WHERE uuid = '${USER1_UUID}'
    ON CONFLICT (provider, external_subject) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject)
    SELECT id, 'https://dev-o7cvobbwsz5w7r14.us.auth0.com/', 'google-oauth2|107951601874477150705'
    FROM measured_judgement.users WHERE uuid = '${USER1_UUID}'
    ON CONFLICT (provider, external_subject) DO UPDATE SET revoked_at = NULL
  `);

  // ── User organisations ─────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.user_organisations (organisation_uuid, user_id)
    SELECT '${ORG1_UUID}', id FROM measured_judgement.users WHERE uuid = '${USER1_UUID}'
    ON CONFLICT (organisation_uuid, user_id) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_organisations (organisation_uuid, user_id)
    SELECT '${ORG1_UUID}', id FROM measured_judgement.users WHERE uuid = '${USER2_UUID}'
    ON CONFLICT (organisation_uuid, user_id) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_organisations (organisation_uuid, user_id)
    SELECT '${ORG2_UUID}', id FROM measured_judgement.users WHERE uuid = '${USER3_UUID}'
    ON CONFLICT (organisation_uuid, user_id) DO NOTHING
  `);

  // ── Roles ──────────────────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.roles (organisation_uuid, name)
    VALUES
      ('${ORG1_UUID}', 'Org Admin'),
      ('${ORG1_UUID}', 'Front Desk'),
      ('${ORG1_UUID}', 'Rate Plan Manager'),
      ('${ORG2_UUID}', 'Org Admin')
    ON CONFLICT (organisation_uuid, name) DO NOTHING
  `);

  // ── Role permissions ───────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'org.manage'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'property.manage'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'organisation.properties.read'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'property.view'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Front Desk'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'guest.checkin'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Front Desk'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'rate_plans.view'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Rate Plan Manager'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'organisation.properties.read'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG2_UUID}' AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  // ── Role assignments ───────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.role_assignments (role_id, scope, user_organisation_id)
    SELECT r.id, 'all_properties', uo.id
    FROM measured_judgement.roles r
    JOIN measured_judgement.user_organisations uo ON uo.organisation_uuid = r.organisation_uuid
    JOIN measured_judgement.users u ON u.id = uo.user_id
    WHERE r.organisation_uuid = '${ORG1_UUID}' AND r.name = 'Org Admin'
      AND u.uuid = '${USER1_UUID}'
    ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_assignments (role_id, scope, user_organisation_id)
    SELECT r.id, 'all_properties', uo.id
    FROM measured_judgement.roles r
    JOIN measured_judgement.user_organisations uo ON uo.organisation_uuid = r.organisation_uuid
    JOIN measured_judgement.users u ON u.id = uo.user_id
    WHERE r.organisation_uuid = '${ORG1_UUID}' AND r.name = 'Rate Plan Manager'
      AND u.uuid = '${USER1_UUID}'
    ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_assignments (role_id, scope, user_organisation_id)
    SELECT r.id, 'property_set', uo.id
    FROM measured_judgement.roles r
    JOIN measured_judgement.user_organisations uo ON uo.organisation_uuid = r.organisation_uuid
    JOIN measured_judgement.users u ON u.id = uo.user_id
    WHERE r.organisation_uuid = '${ORG1_UUID}' AND r.name = 'Front Desk'
      AND u.uuid = '${USER2_UUID}'
    ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_assignments (role_id, scope, user_organisation_id)
    SELECT r.id, 'all_properties', uo.id
    FROM measured_judgement.roles r
    JOIN measured_judgement.user_organisations uo ON uo.organisation_uuid = r.organisation_uuid
    JOIN measured_judgement.users u ON u.id = uo.user_id
    WHERE r.organisation_uuid = '${ORG2_UUID}' AND r.name = 'Org Admin'
      AND u.uuid = '${USER3_UUID}'
    ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
  `);

  // ── Role assignment properties ─────────────────────────────────────────────
  // PROP1 scoped to USER2's Front Desk assignment in ORG1

  pgm.sql(`
    INSERT INTO measured_judgement.role_assignment_properties (property_uuid, role_assignment_id)
    SELECT '${PROP1_UUID}', ra.id
    FROM measured_judgement.role_assignments ra
    JOIN measured_judgement.roles r ON r.id = ra.role_id
    JOIN measured_judgement.user_organisations uo ON uo.id = ra.user_organisation_id
    JOIN measured_judgement.users u ON u.id = uo.user_id
    WHERE r.organisation_uuid = '${ORG1_UUID}' AND r.name = 'Front Desk'
      AND u.uuid = '${USER2_UUID}'
    ON CONFLICT (property_uuid, role_assignment_id) DO NOTHING
  `);

  // ── Authority instances ────────────────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.authority_instances (id, base_url)
    VALUES ('authority-main', 'http://considered-response:5000')
    ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url
  `);

  // ── Organisation authority assignments ─────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.organisation_authority_assignments
      (organisation_uuid, authority_instance_id)
    VALUES
      ('${ORG1_UUID}', 'authority-main'),
      ('${ORG2_UUID}', 'authority-main')
    ON CONFLICT (organisation_uuid) DO NOTHING
  `);

  // ── Property authority assignments ─────────────────────────────────────────

  pgm.sql(`
    INSERT INTO measured_judgement.property_authority_assignments
      (property_uuid, authority_instance_id)
    VALUES
      ('${PROP1_UUID}', 'authority-main'),
      ('${PROP2_UUID}', 'authority-main'),
      ('${PROP3_UUID}', 'authority-main')
    ON CONFLICT (property_uuid) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DELETE FROM measured_judgement.role_assignment_properties
    WHERE property_uuid IN ('${PROP1_UUID}', '${PROP2_UUID}', '${PROP3_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.role_assignments
    WHERE user_organisation_id IN (
      SELECT id FROM measured_judgement.user_organisations
      WHERE organisation_uuid IN ('${ORG1_UUID}', '${ORG2_UUID}')
    )`);

  pgm.sql(`DELETE FROM measured_judgement.role_permissions
    WHERE role_id IN (
      SELECT id FROM measured_judgement.roles
      WHERE organisation_uuid IN ('${ORG1_UUID}', '${ORG2_UUID}')
    )`);

  pgm.sql(`DELETE FROM measured_judgement.roles
    WHERE organisation_uuid IN ('${ORG1_UUID}', '${ORG2_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.user_organisations
    WHERE organisation_uuid IN ('${ORG1_UUID}', '${ORG2_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.user_identities
    WHERE user_id IN (
      SELECT id FROM measured_judgement.users
      WHERE uuid IN ('${USER1_UUID}', '${USER2_UUID}', '${USER3_UUID}')
    )`);

  pgm.sql(`DELETE FROM measured_judgement.users
    WHERE uuid IN ('${USER1_UUID}', '${USER2_UUID}', '${USER3_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.property_authority_assignments
    WHERE property_uuid IN ('${PROP1_UUID}', '${PROP2_UUID}', '${PROP3_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.organisation_authority_assignments
    WHERE organisation_uuid IN ('${ORG1_UUID}', '${ORG2_UUID}')`);

  pgm.sql(`DELETE FROM measured_judgement.authority_instances WHERE id = 'authority-main'`);
};
