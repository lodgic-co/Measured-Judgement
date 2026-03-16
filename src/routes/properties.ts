import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ValidatePropertyOrganisationScope } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const querySchema = z.object({
  property_uuid: z.string().regex(UUID_REGEX, 'property_uuid must be a valid UUID'),
  organisation_uuid: z.string().regex(UUID_REGEX, 'organisation_uuid must be a valid UUID'),
});

export async function propertiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/properties/validate-scope', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { property_uuid, organisation_uuid } = result.data;

    await ValidatePropertyOrganisationScope(pool, property_uuid, organisation_uuid);

    return reply.code(200).send({ property_uuid, organisation_uuid });
  });
}
