// Corrects service_authority_grants rows inserted with PLACEHOLDER_CR_CLIENT_ID by
// 202603210101_dev-seed-cr-sc-ingest-capability.cjs when CR_M2M_CLIENT_ID was not
// set at seed time.
//
// Sets the real dev Auth0 M2M client ID for considered-response on both SC ingest grants.

const PLACEHOLDER = 'PLACEHOLDER_CR_CLIENT_ID';
const CR_M2M_CLIENT_ID =
  process.env['CR_M2M_CLIENT_ID'] || '7w2Chi9hBPn49vsAerTgN7605dIOgLBX';

module.exports.up = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.service_authority_grants
    SET    caller_service_id = '${CR_M2M_CLIENT_ID}'
    WHERE  caller_service_id = '${PLACEHOLDER}'
      AND  capability_key IN (
             'inventory.events.ingest',
             'inventory.events.ingest.mode_neutral'
           )
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.service_authority_grants
    SET    caller_service_id = '${PLACEHOLDER}'
    WHERE  caller_service_id = '${CR_M2M_CLIENT_ID}'
      AND  capability_key IN (
             'inventory.events.ingest',
             'inventory.events.ingest.mode_neutral'
           )
  `);
};
