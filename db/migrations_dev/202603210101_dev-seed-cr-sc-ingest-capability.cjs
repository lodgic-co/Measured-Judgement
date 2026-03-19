// Seeds the SC ingest capability grants for considered-response.
//
// CR must be able to publish mode-neutral domain events to SC's ingest endpoint.
// Two grants are required:
//   1. inventory.events.ingest — general ingest access (shared with OG)
//   2. inventory.events.ingest.mode_neutral — permits null-mode event delivery (CR only)
//
// CR_M2M_CLIENT_ID can be overridden via environment variable; the default
// is the known dev Auth0 M2M client ID for considered-response.

const CR_M2M_CLIENT_ID = process.env['CR_M2M_CLIENT_ID'] || 'PLACEHOLDER_CR_CLIENT_ID';

module.exports.up = (pgm) => {
  // Register the mode_neutral sub-capability (idempotent with existing ingest capability).
  pgm.sql(`
    INSERT INTO measured_judgement.service_capabilities (key, owning_service, description)
    VALUES
      ('inventory.events.ingest.mode_neutral', 'special-circumstances',
       'Allows calling service to publish mode-neutral domain events to SC ingest endpoint. Mode fan-out is performed by SC.')
    ON CONFLICT (key) DO NOTHING
  `);

  // Grant CR both capabilities.
  pgm.sql(`
    INSERT INTO measured_judgement.service_authority_grants (capability_key, caller_service_id)
    VALUES
      ('inventory.events.ingest', '${CR_M2M_CLIENT_ID}'),
      ('inventory.events.ingest.mode_neutral', '${CR_M2M_CLIENT_ID}')
    ON CONFLICT (capability_key, caller_service_id) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.service_authority_grants
    WHERE caller_service_id = '${CR_M2M_CLIENT_ID}'
      AND capability_key IN ('inventory.events.ingest', 'inventory.events.ingest.mode_neutral')
  `);

  pgm.sql(`
    DELETE FROM measured_judgement.service_capabilities
    WHERE key = 'inventory.events.ingest.mode_neutral'
  `);
};
