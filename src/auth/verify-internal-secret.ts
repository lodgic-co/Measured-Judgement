import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { Unauthenticated } from '../errors/index.js';

/**
 * Dev-only internal secret check. Only enforced in development/test
 * environments as a temporary safeguard until network isolation is in place.
 *
 * Returns true when the request has been authenticated via internal secret,
 * allowing callers to skip JWT verification for internal service-to-service
 * calls (e.g. considered-response calling measured-judgement in dev).
 */
export function verifyInternalSecret(request: FastifyRequest, _reply: FastifyReply): boolean {
  if (config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') {
    return false;
  }

  const secret = config.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers['x-internal-secret'];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value || value !== secret) {
    throw Unauthenticated('Missing or invalid X-Internal-Secret');
  }

  request.callerServiceId = 'internal';
  return true;
}
