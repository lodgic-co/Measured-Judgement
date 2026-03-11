module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE measured_judgement.users (
      id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      uuid       uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      email      text        NOT NULL UNIQUE,
      name       text        NULL,
      preferred_language  text NULL,
      preferred_locale    text NULL,
      preferred_timezone  text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE TRIGGER trg_users_canonicalise_email
    BEFORE INSERT OR UPDATE ON measured_judgement.users
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.canonicalise_email()
  `);

  pgm.sql(`
    CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON measured_judgement.users
    FOR EACH ROW
    EXECUTE FUNCTION measured_judgement.set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE measured_judgement.user_identities (
      id               integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id          integer     NOT NULL REFERENCES measured_judgement.users(id) ON DELETE CASCADE,
      provider         text        NOT NULL,
      external_subject text        NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      revoked_at       timestamptz NULL,
      UNIQUE (provider, external_subject)
    )
  `);

  pgm.sql(`CREATE INDEX idx_user_identities_user_id ON measured_judgement.user_identities (user_id)`);
  pgm.sql(`CREATE INDEX idx_user_identities_provider_subject ON measured_judgement.user_identities (provider, external_subject)`);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.user_identities CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS measured_judgement.users CASCADE`);
};
