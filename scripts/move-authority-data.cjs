/**
 * Data move script: copy authority tables from considered-response to measured-judgement.
 *
 * This is a development-stage coordinated breaking change. The system is not
 * live, so no live-traffic migration choreography is required.
 *
 * What it does:
 *   1. Reads users, user_identities, user_organisations, roles,
 *      role_permissions, role_assignments, role_assignment_properties
 *      from considered_response schema.
 *   2. Writes them into the measured_judgement schema in dependency order.
 *   3. Reads organisation authority assignments from the dev routing config
 *      (or a provided environment variable) and populates
 *      measured_judgement.organisation_authority_assignments.
 *
 * Usage:
 *   SOURCE_DB_URL=postgresql://...  TARGET_DB_URL=postgresql://...  \
 *   AUTHORITY_INSTANCE_ID=authority-main  \
 *   AUTHORITY_INSTANCE_BASE_URL=http://considered-response:5000  \
 *   node scripts/move-authority-data.cjs
 *
 * All arguments are required. Script is idempotent via ON CONFLICT DO NOTHING.
 */

const { Client } = require('pg');

async function main() {
  const sourceUrl = process.env.SOURCE_DB_URL;
  const targetUrl = process.env.TARGET_DB_URL;
  const authorityInstanceId = process.env.AUTHORITY_INSTANCE_ID;
  const authorityInstanceBaseUrl = process.env.AUTHORITY_INSTANCE_BASE_URL;

  if (!sourceUrl || !targetUrl || !authorityInstanceId || !authorityInstanceBaseUrl) {
    console.error('[move-authority-data] Required environment variables:');
    console.error('  SOURCE_DB_URL           — considered-response database');
    console.error('  TARGET_DB_URL           — measured-judgement database');
    console.error('  AUTHORITY_INSTANCE_ID   — e.g. authority-main');
    console.error('  AUTHORITY_INSTANCE_BASE_URL — e.g. http://considered-response:5000');
    process.exit(1);
  }

  const src = new Client({ connectionString: sourceUrl });
  const tgt = new Client({ connectionString: targetUrl });

  await src.connect();
  await tgt.connect();

  console.log('[move-authority-data] connected to source and target databases');

  try {
    // Authority instance
    await tgt.query(`
      INSERT INTO measured_judgement.authority_instances (id, base_url)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [authorityInstanceId, authorityInstanceBaseUrl]);
    console.log(`[move-authority-data] authority_instance '${authorityInstanceId}' ensured`);

    // Users
    const usersResult = await src.query(`
      SELECT uuid, email, name, preferred_language, preferred_locale, preferred_timezone, created_at
      FROM considered_response.users
    `);
    let userCount = 0;
    for (const u of usersResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.users
          (uuid, email, name, preferred_language, preferred_locale, preferred_timezone, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (uuid) DO NOTHING
      `, [u.uuid, u.email, u.name, u.preferred_language, u.preferred_locale, u.preferred_timezone, u.created_at]);
      userCount++;
    }
    console.log(`[move-authority-data] copied ${userCount} users`);

    // User identities
    const identitiesResult = await src.query(`
      SELECT ui.provider, ui.external_subject, ui.created_at, ui.revoked_at, u.uuid AS user_uuid
      FROM considered_response.user_identities ui
      JOIN considered_response.users u ON u.id = ui.user_id
    `);
    let identityCount = 0;
    for (const i of identitiesResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.user_identities
          (user_id, provider, external_subject, created_at, revoked_at)
        SELECT u.id, $1, $2, $3, $4
        FROM measured_judgement.users u
        WHERE u.uuid = $5
        ON CONFLICT (provider, external_subject) DO NOTHING
      `, [i.provider, i.external_subject, i.created_at, i.revoked_at, i.user_uuid]);
      identityCount++;
    }
    console.log(`[move-authority-data] copied ${identityCount} user_identities`);

    // user_organisations — use organisation UUID directly
    const userOrgsResult = await src.query(`
      SELECT uo.created_at, u.uuid AS user_uuid, o.uuid AS organisation_uuid
      FROM considered_response.user_organisations uo
      JOIN considered_response.users u ON u.id = uo.user_id
      JOIN considered_response.organisations o ON o.id = uo.organisation_id
    `);
    let uoCount = 0;
    for (const uo of userOrgsResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.user_organisations
          (organisation_uuid, user_id, created_at)
        SELECT $1, u.id, $2
        FROM measured_judgement.users u
        WHERE u.uuid = $3
        ON CONFLICT (organisation_uuid, user_id) DO NOTHING
      `, [uo.organisation_uuid, uo.created_at, uo.user_uuid]);
      uoCount++;
    }
    console.log(`[move-authority-data] copied ${uoCount} user_organisations`);

    // Roles (reference organisation_uuid directly)
    const rolesResult = await src.query(`
      SELECT r.uuid, r.name, r.created_at, r.updated_at, o.uuid AS organisation_uuid
      FROM considered_response.roles r
      JOIN considered_response.organisations o ON o.id = r.organisation_id
    `);
    let roleCount = 0;
    for (const r of rolesResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.roles
          (uuid, organisation_uuid, name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (uuid) DO NOTHING
      `, [r.uuid, r.organisation_uuid, r.name, r.created_at, r.updated_at]);
      roleCount++;
    }
    console.log(`[move-authority-data] copied ${roleCount} roles`);

    // role_permissions
    const rpResult = await src.query(`
      SELECT rp.permission_key, rp.created_at, r.uuid AS role_uuid
      FROM considered_response.role_permissions rp
      JOIN considered_response.roles r ON r.id = rp.role_id
    `);
    let rpCount = 0;
    for (const rp of rpResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.role_permissions
          (role_id, permission_key, created_at)
        SELECT r.id, $1, $2
        FROM measured_judgement.roles r
        WHERE r.uuid = $3
        ON CONFLICT (role_id, permission_key) DO NOTHING
      `, [rp.permission_key, rp.created_at, rp.role_uuid]);
      rpCount++;
    }
    console.log(`[move-authority-data] copied ${rpCount} role_permissions`);

    // role_assignments
    const raResult = await src.query(`
      SELECT ra.scope, ra.created_at, ra.updated_at,
             r.uuid AS role_uuid,
             u.uuid AS user_uuid,
             o.uuid AS organisation_uuid
      FROM considered_response.role_assignments ra
      JOIN considered_response.roles r ON r.id = ra.role_id
      JOIN considered_response.user_organisations uo ON uo.id = ra.user_organisation_id
      JOIN considered_response.users u ON u.id = uo.user_id
      JOIN considered_response.organisations o ON o.id = uo.organisation_id
    `);
    let raCount = 0;
    for (const ra of raResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.role_assignments
          (role_id, scope, user_organisation_id, created_at, updated_at)
        SELECT r.id, $1, uo.id, $2, $3
        FROM measured_judgement.roles r
        JOIN measured_judgement.users u ON u.uuid = $4
        JOIN measured_judgement.user_organisations uo ON uo.user_id = u.id AND uo.organisation_uuid = $5
        WHERE r.uuid = $6
        ON CONFLICT (role_id, scope, user_organisation_id) DO NOTHING
      `, [ra.scope, ra.created_at, ra.updated_at, ra.user_uuid, ra.organisation_uuid, ra.role_uuid]);
      raCount++;
    }
    console.log(`[move-authority-data] copied ${raCount} role_assignments`);

    // role_assignment_properties (use property UUID directly)
    const rapResult = await src.query(`
      SELECT p.uuid AS property_uuid, rap.created_at,
             r.uuid AS role_uuid, u.uuid AS user_uuid, o.uuid AS organisation_uuid, ra.scope
      FROM considered_response.role_assignment_properties rap
      JOIN considered_response.role_assignments ra ON ra.id = rap.role_assignment_id
      JOIN considered_response.roles r ON r.id = ra.role_id
      JOIN considered_response.user_organisations uo ON uo.id = ra.user_organisation_id
      JOIN considered_response.users u ON u.id = uo.user_id
      JOIN considered_response.organisations o ON o.id = uo.organisation_id
      JOIN considered_response.properties p ON p.id = rap.property_id
    `);
    let rapCount = 0;
    for (const rap of rapResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.role_assignment_properties
          (property_uuid, role_assignment_id, created_at)
        SELECT $1, ra.id, $2
        FROM measured_judgement.role_assignments ra
        JOIN measured_judgement.roles r ON r.id = ra.role_id AND r.uuid = $3
        JOIN measured_judgement.user_organisations uo ON uo.id = ra.user_organisation_id
        JOIN measured_judgement.users u ON u.id = uo.user_id AND u.uuid = $4
        WHERE uo.organisation_uuid = $5 AND ra.scope = $6
        ON CONFLICT (property_uuid, role_assignment_id) DO NOTHING
      `, [rap.property_uuid, rap.created_at, rap.role_uuid, rap.user_uuid, rap.organisation_uuid, rap.scope]);
      rapCount++;
    }
    console.log(`[move-authority-data] copied ${rapCount} role_assignment_properties`);

    // organisation_authority_assignments — one per distinct organisation_uuid
    const orgsResult = await src.query(`
      SELECT uuid FROM considered_response.organisations
    `);
    let orgAssignCount = 0;
    for (const org of orgsResult.rows) {
      await tgt.query(`
        INSERT INTO measured_judgement.organisation_authority_assignments
          (organisation_uuid, authority_instance_id)
        VALUES ($1, $2)
        ON CONFLICT (organisation_uuid) DO NOTHING
      `, [org.uuid, authorityInstanceId]);
      orgAssignCount++;
    }
    console.log(`[move-authority-data] assigned ${orgAssignCount} organisations to '${authorityInstanceId}'`);

    console.log('[move-authority-data] data move complete');
  } finally {
    await src.end();
    await tgt.end();
  }
}

main().catch((err) => {
  console.error('[move-authority-data] fatal:', err);
  process.exit(1);
});
