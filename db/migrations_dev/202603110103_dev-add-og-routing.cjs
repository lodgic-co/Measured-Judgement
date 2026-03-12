// Adds the operational-grace-main instance to the authority_instances registry
// and re-points property_authority_assignments rows at it.
//
// property_authority_assignments is the property-scoped routing table for OG.
// The previous seed used 'authority-main' as a placeholder; this corrects that.
// The permission-validation query (COUNT(*) existence check) is unaffected —
// it does not inspect the authority_instance_id value.

const PROP1_UUID = '44444444-4444-4444-4444-444444444444';
const PROP2_UUID = '55555555-5555-5555-5555-555555555555';
const PROP3_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.authority_instances (id, base_url)
    VALUES ('operational-grace-main', 'http://operational-grace:5002')
    ON CONFLICT (id) DO UPDATE SET base_url = EXCLUDED.base_url
  `);

  pgm.sql(`
    UPDATE measured_judgement.property_authority_assignments
    SET authority_instance_id = 'operational-grace-main'
    WHERE property_uuid IN (
      '${PROP1_UUID}'::uuid,
      '${PROP2_UUID}'::uuid,
      '${PROP3_UUID}'::uuid
    )
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.property_authority_assignments
    SET authority_instance_id = 'authority-main'
    WHERE property_uuid IN (
      '${PROP1_UUID}'::uuid,
      '${PROP2_UUID}'::uuid,
      '${PROP3_UUID}'::uuid
    )
  `);

  pgm.sql(`DELETE FROM measured_judgement.authority_instances WHERE id = 'operational-grace-main'`);
};
