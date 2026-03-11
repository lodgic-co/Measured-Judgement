import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { CheckPermission } from '../domain/procedures.js';
import { InvalidRequest } from '../errors/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  actor_user_uuid: z.string().regex(UUID_REGEX, 'actor_user_uuid must be a valid UUID'),
  organisation_uuid: z.string().regex(UUID_REGEX, 'organisation_uuid must be a valid UUID'),
  permission_key: z.string().min(1, 'permission_key is required'),
  property_uuids: z.array(z.string().regex(UUID_REGEX, 'each property_uuid must be a valid UUID')).optional(),
});

export async function permissionsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/permissions/check', async (request, reply) => {
    const result = bodySchema.safeParse(request.body);
    if (!result.success) {
      throw InvalidRequest(result.error.issues[0].message);
    }

    const { actor_user_uuid, organisation_uuid, permission_key, property_uuids } = result.data;
    request.actorUserUuid = actor_user_uuid;
    request.organisationUuid = organisation_uuid;

    const outcome = await CheckPermission(
      pool,
      actor_user_uuid,
      organisation_uuid,
      permission_key,
      property_uuids,
    );

    return reply.code(200).send(outcome);
  });
}
