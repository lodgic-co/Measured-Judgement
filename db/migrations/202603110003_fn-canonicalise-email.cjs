module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION measured_judgement.canonicalise_email()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.email = lower(trim(NEW.email));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP FUNCTION IF EXISTS measured_judgement.canonicalise_email()`);
};
