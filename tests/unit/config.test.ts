import { describe, it, expect } from 'vitest';
import envSchema from 'env-schema';
import { configSchema, parseAllowedAzp } from '../../src/config/index.js';

const REQUIRED_DB_VARS = ['DB_SCHEMA', 'DB_POOL_SIZE', 'DB_CONNECTION_TIMEOUT_MS', 'DB_IDLE_TIMEOUT_MS'] as const;

const MINIMAL_ENV: Record<string, string> = {
  AUTH0_DOMAIN: 'test.auth0.com',
  AUTH0_ISSUER: 'https://test.auth0.com/',
  AUTH0_AUDIENCE: 'https://internal.test.example.com/',
  AUTH0_ALLOWED_AZP: 'test-m2m-client',
  AUTH0_JWKS_URI: 'http://localhost:15113/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
  DB_SCHEMA: 'measured_judgement',
  DB_POOL_SIZE: '5',
  DB_CONNECTION_TIMEOUT_MS: '3000',
  DB_IDLE_TIMEOUT_MS: '5000',
  SYSTEM_DEFAULT_LANGUAGE: 'en',
  SYSTEM_DEFAULT_LOCALE: 'en-AU',
  SYSTEM_DEFAULT_TIMEZONE: 'UTC',
  OPERATIONAL_GRACE_BASE_URL: 'https://operational-grace.internal.test',
};

function parseConfig(data: Record<string, string>) {
  return envSchema({ schema: configSchema, data, env: false, dotenv: false });
}

describe('config validation - DB environment variables', () => {
  for (const varName of REQUIRED_DB_VARS) {
    it(`fails fast when ${varName} is missing`, () => {
      const data = { ...MINIMAL_ENV };
      delete data[varName];
      expect(() => parseConfig(data)).toThrow();
    });
  }

  it('succeeds when all required DB vars are present', () => {
    const result = parseConfig(MINIMAL_ENV) as Record<string, unknown>;
    expect(result['DB_SCHEMA']).toBe('measured_judgement');
    expect(result['DB_POOL_SIZE']).toBe(5);
  });
});

describe('config validation - Auth0', () => {
  it('accepts AUTH0_ISSUER and AUTH0_JWKS_URI', () => {
    const result = parseConfig(MINIMAL_ENV) as Record<string, unknown>;
    expect(result['AUTH0_ISSUER']).toBe('https://test.auth0.com/');
    expect(result['AUTH0_JWKS_URI']).toBe('http://localhost:15113/.well-known/jwks.json');
  });

  it('accepts legacy AUTH0_ISSUER_BASE_URL as fallback', () => {
    const data = { ...MINIMAL_ENV };
    delete data['AUTH0_ISSUER'];
    delete data['AUTH0_JWKS_URI'];
    data['AUTH0_ISSUER_BASE_URL'] = 'https://legacy.auth0.com/';
    data['JWKS_URL'] = 'http://legacy:15113/.well-known/jwks.json';
    expect(() => parseConfig(data)).not.toThrow();
  });
});

describe('parseAllowedAzp', () => {
  it('parses a single value', () => {
    expect(parseAllowedAzp('client-a')).toEqual(['client-a']);
  });

  it('parses a comma-separated list', () => {
    expect(parseAllowedAzp('client-a,client-b,client-c')).toEqual(['client-a', 'client-b', 'client-c']);
  });

  it('trims whitespace around each value', () => {
    expect(parseAllowedAzp(' client-a , client-b , client-c ')).toEqual(['client-a', 'client-b', 'client-c']);
  });

  it('rejects empty entries between commas', () => {
    expect(parseAllowedAzp('client-a,,client-b')).toEqual(['client-a', 'client-b']);
  });

  it('returns empty array for an empty string', () => {
    expect(parseAllowedAzp('')).toEqual([]);
  });

  it('returns empty array for a whitespace-only string', () => {
    expect(parseAllowedAzp('   ')).toEqual([]);
  });
});

describe('config validation - INTERNAL_SERVICE_SECRET', () => {
  it('succeeds when INTERNAL_SERVICE_SECRET is missing', () => {
    const data = { ...MINIMAL_ENV };
    delete data['INTERNAL_SERVICE_SECRET'];
    expect(() => parseConfig(data)).not.toThrow();
  });

  it('parses INTERNAL_SERVICE_SECRET when provided', () => {
    const data = { ...MINIMAL_ENV, INTERNAL_SERVICE_SECRET: 'test-secret' };
    const result = parseConfig(data) as Record<string, unknown>;
    expect(result['INTERNAL_SERVICE_SECRET']).toBe('test-secret');
  });
});
