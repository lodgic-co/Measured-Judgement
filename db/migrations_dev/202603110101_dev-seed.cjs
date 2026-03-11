/**
 * Development seed: one user, one identity, one authority instance,
 * one organisation assignment.
 *
 * Organisation UUIDs must match those in considered-response dev seed
 * so that polite-intervention routing works across both services in dev.
 */
module.exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO measured_judgement.users (email, name, preferred_language, preferred_locale, preferred_timezone)
    VALUES ('dev@example.com', 'Dev User', 'en', 'en-AU', 'Australia/Sydney')
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.user_identities (user_id, provider, external_subject)
    SELECT id, 'auth0', 'auth0|devuser001'
    FROM measured_judgement.users
    WHERE email = 'dev@example.com'
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.authority_instances (id, base_url)
    VALUES ('authority-main', 'http://considered-response:5000')
  `);

  pgm.sql(`
    INSERT INTO measured_judgement.organisation_authority_assignments (organisation_uuid, authority_instance_id)
    VALUES
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'authority-main'),
      ('11111111-1111-1111-1111-111111111111', 'authority-main')
  `);
};

module.exports.down = (pgm) => {
  pgm.sql(`DELETE FROM measured_judgement.organisation_authority_assignments`);
  pgm.sql(`DELETE FROM measured_judgement.authority_instances`);
  pgm.sql(`DELETE FROM measured_judgement.user_identities`);
  pgm.sql(`DELETE FROM measured_judgement.users`);
};
