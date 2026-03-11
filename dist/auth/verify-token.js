import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/index.js';
import { Unauthenticated } from '../errors/index.js';
const ALLOWED_ALGORITHMS = ['RS256'];
const CLOCK_TOLERANCE_SECONDS = 60;
const jwks = createRemoteJWKSet(new URL(config.AUTH0_JWKS_URI));
export async function verifyServiceToken(request, _reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw Unauthenticated('Authorization header required');
    }
    const jwt = authHeader.slice(7);
    try {
        const { payload } = await jwtVerify(jwt, jwks, {
            issuer: config.AUTH0_ISSUER,
            audience: config.AUTH0_AUDIENCE,
            algorithms: ALLOWED_ALGORITHMS,
            clockTolerance: CLOCK_TOLERANCE_SECONDS,
        });
        if (!payload.azp) {
            request.log.warn('Token missing azp claim');
            throw Unauthenticated('Token missing azp claim');
        }
        if (payload.azp !== config.AUTH0_ALLOWED_AZP) {
            request.log.warn({ azp: payload.azp }, 'Token azp mismatch');
            throw Unauthenticated('Unauthorized client');
        }
        request.token = payload;
        request.callerServiceId = payload.azp;
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AppError') {
            throw err;
        }
        request.log.warn({ error_code: 'unauthenticated' }, 'JWT verification failed');
        throw Unauthenticated('Token verification failed');
    }
}
