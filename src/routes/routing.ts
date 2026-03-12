import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config/index.js';
import { ResolveAuthorityInstance } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const querySchema = z.object({
  organisation_uuid: z.string().regex(UUID_REGEX, 'organisation_uuid must be a valid UUID'),
});

export async function routingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/routing/authority-instance', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { organisation_uuid } = result.data;
    request.organisationUuid = organisation_uuid;

    const resolved = await ResolveAuthorityInstance(pool, organisation_uuid);

    return reply.code(200).send(resolved);
  });

  app.get('/routing/operational-grace', async (_request, reply) => {
    return reply.code(200).send({ base_url: config.OPERATIONAL_GRACE_BASE_URL });
  });
}
