import envSchema from 'env-schema';
export const configSchema = {
    type: 'object',
    required: [
        'AUTH0_DOMAIN',
        'AUTH0_AUDIENCE',
        'AUTH0_ALLOWED_AZP',
        'DATABASE_URL',
        'DB_SCHEMA',
        'DB_POOL_SIZE',
        'DB_CONNECTION_TIMEOUT_MS',
        'DB_IDLE_TIMEOUT_MS',
        'SYSTEM_DEFAULT_LANGUAGE',
        'SYSTEM_DEFAULT_LOCALE',
        'SYSTEM_DEFAULT_TIMEZONE',
    ],
    properties: {
        INTERNAL_SERVICE_SECRET: { type: 'string' },
        PORT: { type: 'number', default: 5001 },
        LOG_LEVEL: {
            type: 'string',
            enum: ['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'],
            default: 'info',
        },
        NODE_ENV: {
            type: 'string',
            enum: ['development', 'production', 'test'],
            default: 'development',
        },
        AUTH0_DOMAIN: { type: 'string' },
        AUTH0_ISSUER: { type: 'string' },
        AUTH0_ISSUER_BASE_URL: { type: 'string' },
        AUTH0_AUDIENCE: { type: 'string' },
        AUTH0_ALLOWED_AZP: { type: 'string' },
        AUTH0_JWKS_URI: { type: 'string' },
        JWKS_URL: { type: 'string' },
        DATABASE_URL: { type: 'string' },
        DB_SCHEMA: { type: 'string' },
        DB_POOL_SIZE: { type: 'number' },
        DB_CONNECTION_TIMEOUT_MS: { type: 'number' },
        DB_IDLE_TIMEOUT_MS: { type: 'number' },
        SYSTEM_DEFAULT_LANGUAGE: { type: 'string' },
        SYSTEM_DEFAULT_LOCALE: { type: 'string' },
        SYSTEM_DEFAULT_TIMEZONE: { type: 'string' },
        OTEL_EXPORTER_OTLP_ENDPOINT: { type: 'string', default: '' },
        OTEL_SERVICE_NAME: { type: 'string', default: 'measured-judgement' },
    },
};
const deprecationWarnings = [];
function resolveAlias(raw, templateName, legacyName, label) {
    const preferred = raw[templateName];
    const fallback = raw[legacyName];
    if (preferred) {
        return preferred;
    }
    if (fallback) {
        deprecationWarnings.push(`${legacyName} is deprecated; use ${templateName} instead (currently resolved from ${legacyName} for ${label})`);
        return fallback;
    }
    throw new Error(`Missing required environment variable: ${templateName} (or legacy ${legacyName})`);
}
const raw = envSchema({ schema: configSchema, env: true });
const resolvedIssuer = resolveAlias(raw, 'AUTH0_ISSUER', 'AUTH0_ISSUER_BASE_URL', 'issuer URL');
const resolvedJwksUri = resolveAlias(raw, 'AUTH0_JWKS_URI', 'JWKS_URL', 'JWKS endpoint');
export const config = {
    ...raw,
    INTERNAL_SERVICE_SECRET: raw.INTERNAL_SERVICE_SECRET,
    AUTH0_ISSUER: resolvedIssuer,
    AUTH0_JWKS_URI: resolvedJwksUri,
};
export function emitDeprecationWarnings(log) {
    for (const msg of deprecationWarnings) {
        log.warn(msg);
    }
    if (config.INTERNAL_SERVICE_SECRET && config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') {
        log.warn('INTERNAL_SERVICE_SECRET is set but NODE_ENV is not development or test — secret will be ignored.');
    }
    if (config.NODE_ENV === 'development' && config.INTERNAL_SERVICE_SECRET) {
        log.warn('INTERNAL_SERVICE_SECRET is active (dev mode). Temporary safeguard — remove once network isolation is in place.');
    }
}
