/**
 * Service authority grants.
 *
 * Records which services (identified by Auth0 M2M client_id = caller_service_id)
 * are authorised to exercise each service capability.
 *
 * capability_key: FK to service_capabilities.key.
 * caller_service_id: the Auth0 azp claim value of the calling service's M2M client.
 *
 * UNIQUE(capability_key, caller_service_id) prevents duplicate grants.
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.service_authority_grants (
      id                 integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      capability_key     text        NOT NULL REFERENCES measured_judgement.service_capabilities(key),
      caller_service_id  text        NOT NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_service_authority_grants UNIQUE (capability_key, caller_service_id)
    )
  `);

  pgm.sql(`
    CREATE INDEX idx_service_authority_grants_capability_key
      ON measured_judgement.service_authority_grants (capability_key)
  `);

  pgm.sql(`
    CREATE INDEX idx_service_authority_grants_caller
      ON measured_judgement.service_authority_grants (caller_service_id)
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.service_authority_grants CASCADE`);
};
