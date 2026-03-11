import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

const sslConfig = process.env['PG_SSL'] === 'false' ? {} : { ssl: { rejectUnauthorized: false } };

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ...sslConfig,
  max: config.DB_POOL_SIZE,
  connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
