// Adds reservations.view to Org Admin and Front Desk roles in ORG1.
// Required for USER1 (22222222-…) to pass the OG permission check on
// GET /live|training/properties/:uuid/reservations.

const ORG1_UUID = '11111111-1111-1111-1111-111111111111';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'reservations.view'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'reservations.view'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}' AND name = 'Front Desk'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.role_permissions
    WHERE permission_key = 'reservations.view'
      AND role_id IN (
        SELECT id FROM measured_judgement.roles
        WHERE organisation_uuid = '${ORG1_UUID}'
          AND name IN ('Org Admin', 'Front Desk')
      )
  `);
};
