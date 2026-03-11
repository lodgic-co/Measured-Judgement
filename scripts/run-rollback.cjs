const { spawnSync } = require('child_process');

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) {
  console.error('[rollback] DATABASE_URL_DIRECT is not set');
  process.exit(1);
}

const parsed = new URL(databaseUrl);
console.log(`[rollback] target: ${parsed.host}${parsed.pathname}`);

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'node-pg-migrate',
    'down',
    '--migrations-dir', 'db/migrations',
    '--database-url', databaseUrl,
    '--migrations-table', 'pgmigrations_measured_judgement',
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
