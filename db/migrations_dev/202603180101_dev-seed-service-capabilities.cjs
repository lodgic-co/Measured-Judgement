// Seeds service capabilities and initial grants for SC → OG and SC → CR.
// The seed is idempotent (ON CONFLICT DO NOTHING).
//
// SC_M2M_CLIENT_ID can be overridden via environment variable; the default
// is the known dev Auth0 M2M client ID for special-circumstances.

const SC_M2M_CLIENT_ID = process.env['SC_M2M_CLIENT_ID'] || '6SYVbgyUFiiYUBUwmm18fS96OLfxopmP';

module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.service_capabilities (key, owning_service, description)
    VALUES
      ('inventory.occupancy.bundle.read', 'operational-grace',
       'Allows calling service to fetch an OG occupancy bundle for a rebuild scope'),
      ('inventory.configuration.bundle.read', 'considered-response',
       'Allows calling service to fetch a CR configuration bundle for a rebuild scope')
    ON CONFLICT (key) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.service_authority_grants (capability_key, caller_service_id)
    VALUES
      ('inventory.occupancy.bundle.read', '${SC_M2M_CLIENT_ID}'),
      ('inventory.configuration.bundle.read', '${SC_M2M_CLIENT_ID}')
    ON CONFLICT (capability_key, caller_service_id) DO NOTHING
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM measured_judgement.service_authority_grants
    WHERE caller_service_id = '${SC_M2M_CLIENT_ID}'
  `);

  pgm.sql(`
    DELETE FROM measured_judgement.service_capabilities
    WHERE key IN ('inventory.occupancy.bundle.read', 'inventory.configuration.bundle.read')
  `);
};
