module.exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION measured_judgement.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP FUNCTION IF EXISTS measured_judgement.set_updated_at()`);
};
