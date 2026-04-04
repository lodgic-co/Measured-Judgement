// One-time migration to update dev seed UUIDs to RFC 4122 v4 compliant values.
// The original dev seeds used placeholder UUIDs that lacked a valid version
// nibble (char 13, must be 1-8) and variant nibble (char 17, must be 8/9/a/b).
// This migration renames every affected row so existing dev environments
// match the updated seed files without needing a full schema wipe.

module.exports.up = (pgm) => {

  // ── users.uuid ──────────────────────────────────────────────────────────────

  pgm.sql(`UPDATE measured_judgement.users
    SET uuid = '22222222-2222-4222-a222-222222222222'
    WHERE uuid = '22222222-2222-2222-2222-222222222222'`);

  pgm.sql(`UPDATE measured_judgement.users
    SET uuid = '33333333-3333-4333-a333-333333333333'
    WHERE uuid = '33333333-3333-3333-3333-333333333333'`);

  pgm.sql(`UPDATE measured_judgement.users
    SET uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    WHERE uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'`);

  // ── user_organisations.organisation_uuid ────────────────────────────────────

  pgm.sql(`DELETE FROM measured_judgement.user_organisations legacy
    WHERE legacy.organisation_uuid = '11111111-1111-1111-1111-111111111111'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.user_organisations canonical
        WHERE canonical.organisation_uuid = '11111111-1111-4111-a111-111111111111'
          AND canonical.user_id = legacy.user_id
      )`);

  pgm.sql(`UPDATE measured_judgement.user_organisations
    SET organisation_uuid = '11111111-1111-4111-a111-111111111111'
    WHERE organisation_uuid = '11111111-1111-1111-1111-111111111111'`);

  pgm.sql(`DELETE FROM measured_judgement.user_organisations legacy
    WHERE legacy.organisation_uuid = '22222222-2222-2222-2222-222222222222'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.user_organisations canonical
        WHERE canonical.organisation_uuid = '22222222-2222-4222-a222-222222222222'
          AND canonical.user_id = legacy.user_id
      )`);

  pgm.sql(`UPDATE measured_judgement.user_organisations
    SET organisation_uuid = '22222222-2222-4222-a222-222222222222'
    WHERE organisation_uuid = '22222222-2222-2222-2222-222222222222'`);

  // ── roles.organisation_uuid ─────────────────────────────────────────────────

  pgm.sql(`DELETE FROM measured_judgement.roles legacy
    WHERE legacy.organisation_uuid = '11111111-1111-1111-1111-111111111111'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.roles canonical
        WHERE canonical.organisation_uuid = '11111111-1111-4111-a111-111111111111'
          AND canonical.name = legacy.name
      )`);

  pgm.sql(`UPDATE measured_judgement.roles
    SET organisation_uuid = '11111111-1111-4111-a111-111111111111'
    WHERE organisation_uuid = '11111111-1111-1111-1111-111111111111'`);

  pgm.sql(`DELETE FROM measured_judgement.roles legacy
    WHERE legacy.organisation_uuid = '22222222-2222-2222-2222-222222222222'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.roles canonical
        WHERE canonical.organisation_uuid = '22222222-2222-4222-a222-222222222222'
          AND canonical.name = legacy.name
      )`);

  pgm.sql(`UPDATE measured_judgement.roles
    SET organisation_uuid = '22222222-2222-4222-a222-222222222222'
    WHERE organisation_uuid = '22222222-2222-2222-2222-222222222222'`);

  // ── role_assignment_properties.property_uuid ────────────────────────────────

  pgm.sql(`DELETE FROM measured_judgement.role_assignment_properties legacy
    WHERE legacy.property_uuid = '44444444-4444-4444-4444-444444444444'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.role_assignment_properties canonical
        WHERE canonical.property_uuid = '44444444-4444-4444-a444-444444444444'
          AND canonical.role_assignment_id = legacy.role_assignment_id
      )`);

  pgm.sql(`UPDATE measured_judgement.role_assignment_properties
    SET property_uuid = '44444444-4444-4444-a444-444444444444'
    WHERE property_uuid = '44444444-4444-4444-4444-444444444444'`);

  pgm.sql(`DELETE FROM measured_judgement.role_assignment_properties legacy
    WHERE legacy.property_uuid = '55555555-5555-5555-5555-555555555555'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.role_assignment_properties canonical
        WHERE canonical.property_uuid = '55555555-5555-4555-a555-555555555555'
          AND canonical.role_assignment_id = legacy.role_assignment_id
      )`);

  pgm.sql(`UPDATE measured_judgement.role_assignment_properties
    SET property_uuid = '55555555-5555-4555-a555-555555555555'
    WHERE property_uuid = '55555555-5555-5555-5555-555555555555'`);

  pgm.sql(`DELETE FROM measured_judgement.role_assignment_properties legacy
    WHERE legacy.property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.role_assignment_properties canonical
        WHERE canonical.property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
          AND canonical.role_assignment_id = legacy.role_assignment_id
      )`);

  pgm.sql(`UPDATE measured_judgement.role_assignment_properties
    SET property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
    WHERE property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`);

  // ── organisation_authority_assignments.organisation_uuid ────────────────────

  pgm.sql(`DELETE FROM measured_judgement.organisation_authority_assignments
    WHERE organisation_uuid = '11111111-1111-1111-1111-111111111111'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.organisation_authority_assignments canonical
        WHERE canonical.organisation_uuid = '11111111-1111-4111-a111-111111111111'
      )`);

  pgm.sql(`UPDATE measured_judgement.organisation_authority_assignments
    SET organisation_uuid = '11111111-1111-4111-a111-111111111111'
    WHERE organisation_uuid = '11111111-1111-1111-1111-111111111111'`);

  pgm.sql(`DELETE FROM measured_judgement.organisation_authority_assignments
    WHERE organisation_uuid = '22222222-2222-2222-2222-222222222222'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.organisation_authority_assignments canonical
        WHERE canonical.organisation_uuid = '22222222-2222-4222-a222-222222222222'
      )`);

  pgm.sql(`UPDATE measured_judgement.organisation_authority_assignments
    SET organisation_uuid = '22222222-2222-4222-a222-222222222222'
    WHERE organisation_uuid = '22222222-2222-2222-2222-222222222222'`);

  // ── property_authority_assignments.property_uuid ────────────────────────────

  pgm.sql(`DELETE FROM measured_judgement.property_authority_assignments
    WHERE property_uuid = '44444444-4444-4444-4444-444444444444'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.property_authority_assignments canonical
        WHERE canonical.property_uuid = '44444444-4444-4444-a444-444444444444'
      )`);

  pgm.sql(`UPDATE measured_judgement.property_authority_assignments
    SET property_uuid = '44444444-4444-4444-a444-444444444444'
    WHERE property_uuid = '44444444-4444-4444-4444-444444444444'`);

  pgm.sql(`DELETE FROM measured_judgement.property_authority_assignments
    WHERE property_uuid = '55555555-5555-5555-5555-555555555555'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.property_authority_assignments canonical
        WHERE canonical.property_uuid = '55555555-5555-4555-a555-555555555555'
      )`);

  pgm.sql(`UPDATE measured_judgement.property_authority_assignments
    SET property_uuid = '55555555-5555-4555-a555-555555555555'
    WHERE property_uuid = '55555555-5555-5555-5555-555555555555'`);

  pgm.sql(`DELETE FROM measured_judgement.property_authority_assignments
    WHERE property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND EXISTS (
        SELECT 1
        FROM measured_judgement.property_authority_assignments canonical
        WHERE canonical.property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
      )`);

  pgm.sql(`UPDATE measured_judgement.property_authority_assignments
    SET property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
    WHERE property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`);
};

module.exports.down = (pgm) => {
  pgm.sql(`UPDATE measured_judgement.users SET uuid = '22222222-2222-2222-2222-222222222222' WHERE uuid = '22222222-2222-4222-a222-222222222222'`);
  pgm.sql(`UPDATE measured_judgement.users SET uuid = '33333333-3333-3333-3333-333333333333' WHERE uuid = '33333333-3333-4333-a333-333333333333'`);
  pgm.sql(`UPDATE measured_judgement.users SET uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'`);
  pgm.sql(`UPDATE measured_judgement.user_organisations SET organisation_uuid = '11111111-1111-1111-1111-111111111111' WHERE organisation_uuid = '11111111-1111-4111-a111-111111111111'`);
  pgm.sql(`UPDATE measured_judgement.user_organisations SET organisation_uuid = '22222222-2222-2222-2222-222222222222' WHERE organisation_uuid = '22222222-2222-4222-a222-222222222222'`);
  pgm.sql(`UPDATE measured_judgement.roles SET organisation_uuid = '11111111-1111-1111-1111-111111111111' WHERE organisation_uuid = '11111111-1111-4111-a111-111111111111'`);
  pgm.sql(`UPDATE measured_judgement.roles SET organisation_uuid = '22222222-2222-2222-2222-222222222222' WHERE organisation_uuid = '22222222-2222-4222-a222-222222222222'`);
  pgm.sql(`UPDATE measured_judgement.role_assignment_properties SET property_uuid = '44444444-4444-4444-4444-444444444444' WHERE property_uuid = '44444444-4444-4444-a444-444444444444'`);
  pgm.sql(`UPDATE measured_judgement.role_assignment_properties SET property_uuid = '55555555-5555-5555-5555-555555555555' WHERE property_uuid = '55555555-5555-4555-a555-555555555555'`);
  pgm.sql(`UPDATE measured_judgement.role_assignment_properties SET property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'`);
  pgm.sql(`UPDATE measured_judgement.organisation_authority_assignments SET organisation_uuid = '11111111-1111-1111-1111-111111111111' WHERE organisation_uuid = '11111111-1111-4111-a111-111111111111'`);
  pgm.sql(`UPDATE measured_judgement.organisation_authority_assignments SET organisation_uuid = '22222222-2222-2222-2222-222222222222' WHERE organisation_uuid = '22222222-2222-4222-a222-222222222222'`);
  pgm.sql(`UPDATE measured_judgement.property_authority_assignments SET property_uuid = '44444444-4444-4444-4444-444444444444' WHERE property_uuid = '44444444-4444-4444-a444-444444444444'`);
  pgm.sql(`UPDATE measured_judgement.property_authority_assignments SET property_uuid = '55555555-5555-5555-5555-555555555555' WHERE property_uuid = '55555555-5555-4555-a555-555555555555'`);
  pgm.sql(`UPDATE measured_judgement.property_authority_assignments SET property_uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE property_uuid = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'`);
};
