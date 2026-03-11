/**
 * The authz tables reference organisation_uuid from considered-response.
 * Per the platform standard (UUID FK migration decision), cross-service
 * references use UUIDs rather than integer surrogate keys.
 *
 * user_organisations links a measured_judgement.users record to an
 * organisation by its UUID. No FK to organisations table — organisations
 * remain owned by considered-response.
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.user_organisations (
      id                integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organisation_uuid uuid        NOT NULL,
      user_id           integer     NOT NULL REFERENCES measured_judgement.users(id) ON DELETE CASCADE,
      created_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organisation_uuid, user_id)
    )
  `);

  pgm.sql(`CREATE INDEX idx_user_organisations_user_id ON measured_judgement.user_organisations (user_id)`);
  pgm.sql(`CREATE INDEX idx_user_organisations_organisation_uuid ON measured_judgement.user_organisations (organisation_uuid)`);

  pgm.sql(`
    CREATE TABLE measured_judgement.roles (
      id                integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organisation_uuid uuid        NOT NULL,
      uuid              uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      name              text        NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organisation_uuid, name)
    )
  `);

  pgm.sql(`CREATE INDEX idx_roles_organisation_uuid ON measured_judgement.roles (organisation_uuid)`);

  pgm.sql(`
    CREATE TRIGGER trg_roles_set_updated_at
    BEFORE UPDATE ON measured_judgement.roles
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE measured_judgement.role_permissions (
      id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      permission_key text        NOT NULL,
      role_id        integer     NOT NULL REFERENCES measured_judgement.roles(id) ON DELETE CASCADE,
      created_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (role_id, permission_key)
    )
  `);

  pgm.sql(`CREATE INDEX idx_role_permissions_role_id ON measured_judgement.role_permissions (role_id)`);

  pgm.sql(`
    CREATE TABLE measured_judgement.role_assignments (
      id                   integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      role_id              integer     NOT NULL REFERENCES measured_judgement.roles(id) ON DELETE CASCADE,
      scope                text        NOT NULL,
      user_organisation_id integer     NOT NULL REFERENCES measured_judgement.user_organisations(id) ON DELETE CASCADE,
      created_at           timestamptz NOT NULL DEFAULT now(),
      updated_at           timestamptz NOT NULL DEFAULT now(),
      UNIQUE (role_id, scope, user_organisation_id)
    )
  `);

  pgm.sql(`CREATE INDEX idx_role_assignments_role_id ON measured_judgement.role_assignments (role_id)`);
  pgm.sql(`CREATE INDEX idx_role_assignments_user_organisation_id ON measured_judgement.role_assignments (user_organisation_id)`);

  pgm.sql(`
    CREATE TRIGGER trg_role_assignments_set_updated_at
    BEFORE UPDATE ON measured_judgement.role_assignments
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE measured_judgement.role_assignment_properties (
      property_uuid        uuid    NOT NULL,
      role_assignment_id   integer NOT NULL REFERENCES measured_judgement.role_assignments(id) ON DELETE CASCADE,
      created_at           timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (property_uuid, role_assignment_id)
    )
  `);

  pgm.sql(`CREATE INDEX idx_role_assignment_properties_property_uuid ON measured_judgement.role_assignment_properties (property_uuid)`);
  pgm.sql(`CREATE INDEX idx_role_assignment_properties_role_assignment_id ON measured_judgement.role_assignment_properties (role_assignment_id)`);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.role_assignment_properties CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.role_assignments CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.role_permissions CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.roles CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.user_organisations CASCADE`);
};
