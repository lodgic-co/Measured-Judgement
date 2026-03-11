// Corrects the authority-main base_url to the Render shared-dev internal
// service address. The previous seed used the local Docker Compose address.
module.exports.up = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.authority_instances
    SET base_url = 'http://considered-response-dev:10000'
    WHERE id = 'authority-main'
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`
    UPDATE measured_judgement.authority_instances
    SET base_url = 'http://considered-response:5000'
    WHERE id = 'authority-main'
  `);
};
