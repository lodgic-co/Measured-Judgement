export class AppError extends Error {
    status;
    code;
    retryable;
    messageParams;
    constructor(opts) {
        super(opts.message);
        this.name = 'AppError';
        this.status = opts.status;
        this.code = opts.code;
        this.retryable = opts.retryable;
        this.messageParams = opts.messageParams;
    }
    toEnvelope(requestId) {
        const envelope = {
            error: {
                status: this.status,
                code: this.code,
                message: this.message,
                request_id: requestId,
                retryable: this.retryable,
            },
        };
        if (this.messageParams) {
            envelope.error.message_params = this.messageParams;
        }
        return envelope;
    }
}
export function InvalidRequest(message, messageParams) {
    return new AppError({ status: 400, code: 'invalid_request', message, retryable: false, messageParams });
}
export function UnknownPermission(message) {
    return new AppError({ status: 400, code: 'unknown_permission', message, retryable: false });
}
export function ScopeMismatch(message) {
    return new AppError({ status: 400, code: 'scope_mismatch', message, retryable: false });
}
export function InvalidProperty(message) {
    return new AppError({ status: 400, code: 'invalid_property', message, retryable: false });
}
export function Unauthenticated(message) {
    return new AppError({ status: 401, code: 'unauthenticated', message, retryable: false });
}
export function NotFound(message = 'Not found') {
    return new AppError({ status: 404, code: 'not_found', message, retryable: false });
}
export function InternalError(message = 'Internal server error') {
    return new AppError({ status: 500, code: 'internal_error', message, retryable: true });
}
