import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { AppError } from '../errors/index.js';

function getActiveTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  if (!span) return undefined;
  const traceId = span.spanContext().traceId;
  if (traceId === '00000000000000000000000000000000') return undefined;
  return traceId;
}

export function registerRequestId(app: FastifyInstance): void {
  app.decorateRequest('requestId', '');

  app.addHook('onRequest', async (request: FastifyRequest) => {
    // [DIAG] earliest hook - log raw incoming trace headers and active context
    const diagTraceparent = request.headers['traceparent'] ?? '(not-present)';
    const diagTracestate = request.headers['tracestate'] ?? '(not-present)';
    const diagXRequestId = request.headers['x-request-id'] ?? '(not-present)';
    const diagEarlyActiveTraceId = getActiveTraceId() ?? '(none)';
    process.stderr.write(JSON.stringify({
      mj_diag: 'earliest_onRequest',
      path: request.url,
      raw_traceparent: diagTraceparent,
      raw_tracestate: diagTracestate,
      raw_x_request_id: diagXRequestId,
      active_trace_id_at_hook: diagEarlyActiveTraceId,
    }) + '\n');

    const incoming = request.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && incoming.trim().length > 0
        ? incoming.trim()
        : (getActiveTraceId() ?? randomUUID());
    request.requestId = id;

    const span = trace.getSpan(context.active());
    if (span) {
      span.setAttribute('app.request_id', id);
    }
  });
}

export function registerCorrelationHeader(app: FastifyInstance): void {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = getActiveTraceId();
    const value = traceId ?? request.requestId ?? request.id;
    reply.header('x-request-id', value);
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    const reqId = request.requestId || request.id;

    const span = trace.getSpan(context.active());

    if (error instanceof AppError) {
      request.errorCode = error.code;

      if (span) {
        span.setAttribute('error.code', error.code);
        if (error.status >= 500) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.code });
        }
      }

      return reply.code(error.status).send(error.toEnvelope(reqId));
    }

    request.errorCode = 'internal_error';
    request.log.error({ err: error }, 'unhandled error');

    if (span) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'internal_error' });
      span.setAttribute('error.code', 'internal_error');
    }

    return reply.code(500).send({
      error: {
        status: 500,
        code: 'internal_error',
        message: 'Internal server error',
        request_id: reqId,
        retryable: false,
      },
    });
  });
}
