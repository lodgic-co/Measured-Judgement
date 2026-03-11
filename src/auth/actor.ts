import type { FastifyRequest } from 'fastify';
import { InvalidRequest } from '../errors/index.js';

export interface DelegatedActor {
  id: string;
  type: string;
  organisationId?: string;
}

const HEADER_ACTOR_USER_UUID = 'x-actor-user-uuid';
const HEADER_ACTOR_TYPE = 'x-actor-type';
const HEADER_ACTOR_ORG = 'x-organisation-uuid';

const VALID_ACTOR_TYPES = new Set(['user', 'service', 'system', 'anonymous']);

export function parseDelegatedActor(request: FastifyRequest): DelegatedActor | null {
  const id = singleHeader(request, HEADER_ACTOR_USER_UUID);
  const type = singleHeader(request, HEADER_ACTOR_TYPE);

  if (!id && !type) {
    return null;
  }

  if (type === 'anonymous') {
    if (id) {
      throw InvalidRequest('X-Actor-User-Uuid must not be provided when X-Actor-Type is anonymous');
    }
    const organisationId = singleHeader(request, HEADER_ACTOR_ORG) ?? undefined;
    return { id: '', type, organisationId };
  }

  if (!id || !type) {
    throw InvalidRequest('Both X-Actor-User-Uuid and X-Actor-Type headers must be provided together');
  }

  if (!VALID_ACTOR_TYPES.has(type)) {
    throw InvalidRequest(`Invalid X-Actor-Type: ${type}. Must be one of: ${[...VALID_ACTOR_TYPES].join(', ')}`);
  }

  const organisationId = singleHeader(request, HEADER_ACTOR_ORG) ?? undefined;

  return { id, type, organisationId };
}

function singleHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  if (value === undefined) return null;
  const str = Array.isArray(value) ? value[0] : value;
  if (!str || str.trim().length === 0) return null;
  return str.trim();
}
