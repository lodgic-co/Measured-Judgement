// Adds pricing.quote to the ORG1 Org Admin role so the primary dev test user
// can call the price-stay quote route against seeded properties.

const ORG1_UUID = '11111111-1111-4111-a111-111111111111';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.role_permissions (role_id, permission_key)
    SELECT id, 'pricing.quote'
    FROM measured_judgement.roles
    WHERE organisation_uuid = '${ORG1_UUID}'
      AND name = 'Org Admin'
    ON CONFLICT (role_id, permission_key) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.role_permissions
    WHERE permission_key = 'pricing.quote'
      AND role_id IN (
        SELECT id
        FROM measured_judgement.roles
        WHERE organisation_uuid = '${ORG1_UUID}'
          AND name = 'Org Admin'
      )
  `);
};
