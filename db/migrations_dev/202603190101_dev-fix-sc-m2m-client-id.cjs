// Corrects the service_authority_grants rows that were inserted with the
// 'sc-m2m-placeholder' sentinel by 202603180101_dev-seed-service-capabilities.cjs
// in environments where SC_M2M_CLIENT_ID was not set at seed time.
//
// Sets the real dev Auth0 M2M client ID for special-circumstances on both grants.

const PLACEHOLDER    = 'sc-m2m-placeholder';
const SC_M2M_CLIENT_ID = process.env['SC_M2M_CLIENT_ID'] || '6SYVbgyUFiiYUBUwmm18fS96OLfxopmP';

module.exports.up = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.service_authority_grants
    SET    caller_service_id = '${SC_M2M_CLIENT_ID}'
    WHERE  caller_service_id = '${PLACEHOLDER}'
      AND  capability_key IN (
             'inventory.occupancy.bundle.read',
             'inventory.configuration.bundle.read'
           )
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.service_authority_grants
    SET    caller_service_id = '${PLACEHOLDER}'
    WHERE  caller_service_id = '${SC_M2M_CLIENT_ID}'
      AND  capability_key IN (
             'inventory.occupancy.bundle.read',
             'inventory.configuration.bundle.read'
           )
  `);
};
