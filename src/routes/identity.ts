import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ResolveUserIdentity } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const querySchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  external_subject: z.string().min(1, 'external_subject is required'),
});

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/identity/resolve', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { provider, external_subject } = result.data;

    const resolved = await ResolveUserIdentity(pool, provider, external_subject);

    return reply.code(200).send(resolved);
  });
}
