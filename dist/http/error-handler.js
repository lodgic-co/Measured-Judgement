import { randomUUID } from 'crypto';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { AppError } from '../errors/index.js';
function getActiveTraceId() {
    const span = trace.getSpan(context.active());
    if (!span)
        return undefined;
    const traceId = span.spanContext().traceId;
    if (traceId === '00000000000000000000000000000000')
        return undefined;
    return traceId;
}
export function registerRequestId(app) {
    app.decorateRequest('requestId', '');
    app.addHook('onRequest', async (request) => {
        const incoming = request.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
        request.requestId = id;
        const span = trace.getSpan(context.active());
        if (span) {
            span.setAttribute('app.request_id', id);
        }
    });
}
export function registerCorrelationHeader(app) {
    app.addHook('onSend', async (request, reply) => {
        const traceId = getActiveTraceId();
        const value = traceId ?? request.requestId ?? request.id;
        reply.header('x-request-id', value);
    });
}
export function registerErrorHandler(app) {
    app.setErrorHandler((error, request, reply) => {
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
                retryable: true,
            },
        });
    });
}
