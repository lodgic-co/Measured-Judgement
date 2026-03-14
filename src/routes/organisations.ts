import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ResolveOrganisationScope } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const querySchema = z.object({
  actor_user_uuid: z.string().regex(UUID_REGEX, 'actor_user_uuid must be a valid UUID'),
  requested_organisation_uuid: z.string().regex(UUID_REGEX, 'requested_organisation_uuid must be a valid UUID'),
});

export async function organisationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organisations/resolve-scope', async (request, reply) => {
    const result = querySchema.safeParse(request.query);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { actor_user_uuid, requested_organisation_uuid } = result.data;
    request.actorUserUuid = actor_user_uuid;
    request.organisationUuid = requested_organisation_uuid;

    const resolved = await ResolveOrganisationScope(pool, actor_user_uuid, requested_organisation_uuid);

    return reply.code(200).send(resolved);
  });
}
