/**
 * Organisation properties authority record.
 *
 * Records the property→organisation ownership relationship as a dedicated
 * authority table, distinct from property_authority_assignments (which records
 * routing facts). Routing and ownership are different facts and must not share
 * a table.
 *
 * This is the source of truth for GET /properties/validate-scope, called by
 * polite-intervention to assert property→organisation membership before
 * forwarding property-scoped requests.
 *
 * Invariant: a property belongs to exactly one organisation (UNIQUE on property_uuid).
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.organisation_properties (
      id                integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organisation_uuid uuid        NOT NULL,
      property_uuid     uuid        NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_organisation_properties_property_uuid UNIQUE (property_uuid)
    )
  `);

  pgm.sql(`CREATE INDEX idx_organisation_properties_org_uuid ON measured_judgement.organisation_properties (organisation_uuid)`);

  pgm.sql(`
    CREATE TRIGGER trg_organisation_properties_set_updated_at
    BEFORE UPDATE ON measured_judgement.organisation_properties
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.organisation_properties CASCADE`);
};
