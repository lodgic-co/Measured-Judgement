/**
 * Service capability catalogue.
 *
 * Records the named actions a service is authorised to expose to other services.
 * Capabilities are distinct from user permissions: they are system-scoped and
 * have no human actor context. Each capability is owned by one service.
 *
 * key: immutable once released; format <domain>.<subdomain>.<action>.
 * owning_service: the service that exposes the route protected by this capability.
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.service_capabilities (
      id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      key            text        NOT NULL,
      owning_service text        NOT NULL,
      description    text        NOT NULL DEFAULT '',
      created_at     timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_service_capabilities_key UNIQUE (key)
    )
  `);

  pgm.sql(`
    CREATE INDEX idx_service_capabilities_owning_service
      ON measured_judgement.service_capabilities (owning_service)
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.service_capabilities CASCADE`);
};
