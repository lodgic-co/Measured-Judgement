import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const DB_CHECK_TIMEOUT_MS = 1000;

let ready = false;
let dbPool: Pool | null = null;

export function setReady(value: boolean): void {
  ready = value;
}

export function setDbPool(pool: Pool): void {
  dbPool = pool;
}

async function checkDbConnectivity(pool: Pool): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', async (_request, reply) => {
    reply.code(200).send({ status: 'ok' });
  });

  app.get('/health/ready', async (request, reply) => {
    if (!ready || !dbPool) {
      reply.code(503).send({ status: 'not_ready' });
      return;
    }

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('DB check timeout')), DB_CHECK_TIMEOUT_MS);
      });
      await Promise.race([checkDbConnectivity(dbPool), timeout]);
      reply.code(200).send({ status: 'ready' });
    } catch (err) {
      request.log.error({ err }, 'readiness check failed');
      reply.code(503).send({ status: 'not_ready' });
    }
  });
}
