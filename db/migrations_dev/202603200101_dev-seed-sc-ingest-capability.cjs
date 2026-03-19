// Seeds the SC ingest capability and grants it to OG.
// This allows OG to publish domain events to SC's /internal/events/ingest endpoint.
// The seed is idempotent (ON CONFLICT DO NOTHING).
//
// OG_M2M_CLIENT_ID can be overridden via environment variable; the default
// is the known dev Auth0 M2M client ID for operational-grace.

const OG_M2M_CLIENT_ID = process.env['OG_M2M_CLIENT_ID'] || 'Ci4tLjKca8g8zcQ3QLvEZHxXkgyHuAqF';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.service_capabilities (key, owning_service, description)
    VALUES
      ('inventory.events.ingest', 'special-circumstances',
       'Allows calling service to publish domain events to SC ingest endpoint')
    ON CONFLICT (key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.service_authority_grants (capability_key, caller_service_id)
    VALUES
      ('inventory.events.ingest', '${OG_M2M_CLIENT_ID}')
    ON CONFLICT (capability_key, caller_service_id) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.service_authority_grants
    WHERE capability_key = 'inventory.events.ingest'
      AND caller_service_id = '${OG_M2M_CLIENT_ID}'
  `);

  pgm.sql(`
    DELETE FROM measured_judgement.service_capabilities
    WHERE key = 'inventory.events.ingest'
  `);
};
