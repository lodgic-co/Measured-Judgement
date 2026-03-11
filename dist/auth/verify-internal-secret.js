import { config } from '../config/index.js';
import { Unauthenticated } from '../errors/index.js';
/**
 * Dev-only internal secret check. Only enforced in development/test
 * environments as a temporary safeguard until network isolation is in place.
 */
export function verifyInternalSecret(request, _reply) {
    if (config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') {
        return;
    }
    const secret = config.INTERNAL_SERVICE_SECRET;
    if (!secret) {
        return;
    }
    const header = request.headers['x-internal-secret'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || value !== secret) {
        throw Unauthenticated('Missing or invalid X-Internal-Secret');
    }
}
