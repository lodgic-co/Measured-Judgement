/**
 * Development seed — populate organisation_properties for all dev properties.
 *
 * PROP1, PROP2, PROP3 all belong to ORG1, consistent with the property
 * authority assignments and org membership in 202603110101_dev-seed.cjs.
 *
 * UUIDs match the main dev seed exactly.
 */

const ORG1_UUID  = '11111111-1111-4111-a111-111111111111';
const PROP1_UUID = '44444444-4444-4444-a444-444444444444';
const PROP2_UUID = '55555555-5555-4555-a555-555555555555';
const PROP3_UUID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.organisation_properties
      (organisation_uuid, property_uuid)
    VALUES
      ('${ORG1_UUID}', '${PROP1_UUID}'),
      ('${ORG1_UUID}', '${PROP2_UUID}'),
      ('${ORG1_UUID}', '${PROP3_UUID}')
    ON CONFLICT (property_uuid) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.organisation_properties
    WHERE property_uuid IN ('${PROP1_UUID}', '${PROP2_UUID}', '${PROP3_UUID}')
  `);
};
