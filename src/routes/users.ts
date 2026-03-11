import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { parseDelegatedActor } from '../auth/actor.js';
import { InvalidRequest } from '../errors/index.js';
import { ResolveUserLocaleContext } from '../domain/procedures.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users/me/preferences', async (request, reply) => {
    const actor = parseDelegatedActor(request);

    if (!actor || actor.type !== 'user' || !actor.id) {
      throw InvalidRequest('X-Actor-Type: user and X-Actor-User-Uuid required');
    }

    const actorUserUuid = actor.id;
    request.actorUserUuid = actorUserUuid;

    const { resolved_language, resolved_locale, resolved_timezone } =
      await ResolveUserLocaleContext(pool, actorUserUuid);

    return reply.code(200).send({
      language: resolved_language,
      locale: resolved_locale,
      timezone: resolved_timezone,
    });
  });
}
