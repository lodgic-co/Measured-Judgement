module.exports.up = (pgm) => {
  pgm.sql(`CREATE SCHEMA IF NOT EXISTS measured_judgement`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
};

module.exports.down = (pgm) => {
  pgm.sql(`DROP SCHEMA IF EXISTS measured_judgement CASCADE`);
};
