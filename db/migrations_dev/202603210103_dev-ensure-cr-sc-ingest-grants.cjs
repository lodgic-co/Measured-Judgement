// Ensures considered-response has SC ingest grants for the real dev M2M client.
//
// Dev seeds that already ran are not re-executed; changing earlier migration files
// does not update existing databases. This migration is additive and idempotent:
// INSERT ... ON CONFLICT DO NOTHING so every environment gets the two grants
// (inventory.events.ingest + inventory.events.ingest.mode_neutral) for CR's azp
// whether or not 202603210101 / 202603210102 left rows missing or under a placeholder.
//
// CR_M2M_CLIENT_ID can be overridden via environment variable.

const CR_M2M_CLIENT_ID =
  process.env['CR_M2M_CLIENT_ID'] || '7w2Chi9hBPn49vsAerTgN7605dIOgLBX';

module.exports.up = (pgm) => {
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
      AND capability_key IN (
             'inventory.events.ingest',
             'inventory.events.ingest.mode_neutral'
           )
  `);
};
