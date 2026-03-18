import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { SelectServiceCapabilityGrants } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const querySchema = z.object({
  owning_service: z.string().min(1, 'owning_service is required'),
});

export async function serviceAuthoritiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/service-authorities/grants', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { owning_service } = result.data;

    const grants = await SelectServiceCapabilityGrants(pool, owning_service);

    return reply.code(200).send({ grants });
  });
}
