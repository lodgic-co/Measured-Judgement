import Fastify from 'fastify';
import { trace, context } from '@opentelemetry/api';
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

    if (!request.url.startsWith('/health')) {
      // [DIAG] active trace_id at point of normal ingress log emission
      const diagActiveSpan = trace.getSpan(context.active());
      const diagActiveTraceId = diagActiveSpan?.spanContext().traceId ?? '(none)';
      process.stderr.write(JSON.stringify({
        mj_diag: 'ingress_log_hook',
        path: request.url,
        request_id: request.requestId,
        active_trace_id_at_ingress_log: diagActiveTraceId,
      }) + '\n');

      request.log.info(
        { request_id: request.requestId, method: request.method, path: request.url },
        'incoming request',
      );
      const internalAuthenticated = verifyInternalSecret(request, reply);
      if (!internalAuthenticated) {
        await verifyServiceToken(request, reply);
      }
    }
  });

  app.addHook('onResponse', (request, reply, done) => {
    if (request.url.startsWith('/health')) {
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
    if (request.permissionKey !== undefined) {
      log.permission_key = request.permissionKey;
    }
    if (request.permissionOutcome !== undefined) {
      log.permission_outcome = request.permissionOutcome;
    }
    request.log.info(log, 'request completed');
    done();
  });

  return app;
}
