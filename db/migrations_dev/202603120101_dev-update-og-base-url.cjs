// Corrects the operational-grace-main base_url to the actual dev hostname.
// The previous seed used a Docker Compose internal name; this reflects the
// correct dev environment address.

module.exports.up = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.authority_instances
    SET base_url = 'http://operational-grace-dev:10000'
    WHERE id = 'operational-grace-main'
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.authority_instances
    SET base_url = 'http://operational-grace:5002'
    WHERE id = 'operational-grace-main'
  `);
};
