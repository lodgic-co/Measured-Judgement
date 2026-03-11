/**
 * Authority routing directory table.
 *
 * Stores the organisation_uuid → authority_instance_id mapping.
 * authority_instances is a separate table holding instance metadata
 * (id + base_url). This is the database-backed form of the routing
 * directory that measured-judgement owns.
 *
 * property_uuid → authority_instance_id is included in the data model
 * (slice 1 requirement) but property routing endpoints are not exposed
 * until a future slice.
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.authority_instances (
      id         text        PRIMARY KEY,
      base_url   text        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE TRIGGER trg_authority_instances_set_updated_at
    BEFORE UPDATE ON measured_judgement.authority_instances
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE measured_judgement.organisation_authority_assignments (
      id                   integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organisation_uuid    uuid        NOT NULL UNIQUE,
      authority_instance_id text       NOT NULL REFERENCES measured_judgement.authority_instances(id),
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`CREATE INDEX idx_org_authority_assignments_org_uuid ON measured_judgement.organisation_authority_assignments (organisation_uuid)`);
  pgm.sql(`CREATE INDEX idx_org_authority_assignments_instance_id ON measured_judgement.organisation_authority_assignments (authority_instance_id)`);

  pgm.sql(`
    CREATE TRIGGER trg_org_authority_assignments_set_updated_at
    BEFORE UPDATE ON measured_judgement.organisation_authority_assignments
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE measured_judgement.property_authority_assignments (
      id                    integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      property_uuid         uuid        NOT NULL UNIQUE,
      authority_instance_id text        NOT NULL REFERENCES measured_judgement.authority_instances(id),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`CREATE INDEX idx_prop_authority_assignments_prop_uuid ON measured_judgement.property_authority_assignments (property_uuid)`);

  pgm.sql(`
    CREATE TRIGGER trg_prop_authority_assignments_set_updated_at
    BEFORE UPDATE ON measured_judgement.property_authority_assignments
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.property_authority_assignments CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.organisation_authority_assignments CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.authority_instances CASCADE`);
};
