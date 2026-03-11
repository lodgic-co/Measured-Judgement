import Fastify from 'fastify';
import { loggerOptions } from '../observability/logger.js';
import { healthRoutes } from '../routes/health.js';
import { internalRoutes } from '../routes/internal.js';
import { identityRoutes } from '../routes/identity.js';
import { usersRoutes } from '../routes/users.js';
import { routingRoutes } from '../routes/routing.js';
import { permissionsRoutes } from '../routes/permissions.js';
import { verifyInternalSecret } from '../auth/verify-internal-secret.js';
import { verifyServiceToken } from '../auth/verify-token.js';
import { registerRequestId, registerCorrelationHeader, registerErrorHandler } from './error-handler.js';

export function createApp() {
  const app = Fastify({ logger: loggerOptions, disableRequestLogging: true });

  registerRequestId(app);
  registerCorrelationHeader(app);
  registerErrorHandler(app);

  app.register(healthRoutes);
  app.register(internalRoutes);
  app.register(identityRoutes);
  app.register(usersRoutes);
  app.register(routingRoutes);
  app.register(permissionsRoutes);

  app.addHook('onRequest', async (request, reply) => {
    request.startTime = process.hrtime.bigint();

    if (!request.url.startsWith('/health/')) {
      request.log.info(
        { request_id: request.requestId, method: request.method, path: request.url },
        'incoming request',
      );
      verifyInternalSecret(request, reply);
      await verifyServiceToken(request, reply);
    }
  });

  app.addHook('onResponse', (request, reply, done) => {
    if (request.url.startsWith('/health/')) {
      done();
      return;
    }

    const durationNs = Number(process.hrtime.bigint() - request.startTime);
    const durationMs = Math.round((durationNs / 1e6) * 100) / 100;

    const log: Record<string, unknown> = {
      request_id: request.requestId,
      method: request.method,
      path: request.url,
      status_code: reply.statusCode,
      duration_ms: durationMs,
    };
    if (request.callerServiceId) {
      log.caller_service_id = request.callerServiceId;
    }
    if (request.errorCode) {
      log.error_code = request.errorCode;
    }
    if (request.actorUserUuid) {
      log.actor_user_uuid = request.actorUserUuid;
    }
    if (request.organisationUuid) {
      log.organisation_uuid = request.organisationUuid;
    }
    request.log.info(log, 'request completed');
    done();
  });

  return app;
}
