import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

const mockJwtVerify = vi.fn();

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn().mockReturnValue({}),
  jwtVerify: mockJwtVerify,
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    AUTH0_ISSUER: 'https://test.auth0.com/',
    AUTH0_AUDIENCE: 'https://api.test/',
    AUTH0_JWKS_URI: 'https://test.auth0.com/.well-known/jwks.json',
    AUTH0_ALLOWED_AZP: 'client-a,client-b',
  },
  allowedAzpList: ['client-a', 'client-b'],
}));

vi.mock('../../src/errors/index.js', () => ({
  Unauthenticated: (msg: string) => {
    const err = new Error(msg) as Error & { name: string };
    err.name = 'AppError';
    return err;
  },
}));

function makeRequest(authHeader: string | undefined): FastifyRequest {
  return {
    headers: { authorization: authHeader },
    log: { warn: vi.fn() },
  } as unknown as FastifyRequest;
}

const mockReply = {} as FastifyReply;

describe('verifyServiceToken — azp allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a token whose azp matches the first value in a multi-value list', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'sub-1', azp: 'client-a' } });
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest('Bearer valid.token.here');
    await expect(verifyServiceToken(req, mockReply)).resolves.toBeUndefined();
    expect((req as Record<string, unknown>).callerServiceId).toBe('client-a');
  });

  it('accepts a token whose azp matches the second value in a multi-value list', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'sub-2', azp: 'client-b' } });
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest('Bearer valid.token.here');
    await expect(verifyServiceToken(req, mockReply)).resolves.toBeUndefined();
    expect((req as Record<string, unknown>).callerServiceId).toBe('client-b');
  });

  it('rejects a token whose azp is not in the allowed list', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'sub-x', azp: 'unknown-client' } });
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest('Bearer valid.token.here');
    await expect(verifyServiceToken(req, mockReply)).rejects.toThrow('Unauthorized client');
  });

  it('rejects a token with no azp claim', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'sub-x' } });
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest('Bearer valid.token.here');
    await expect(verifyServiceToken(req, mockReply)).rejects.toThrow('Token missing azp claim');
  });

  it('rejects a request with no Authorization header', async () => {
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest(undefined);
    await expect(verifyServiceToken(req, mockReply)).rejects.toThrow('Authorization header required');
  });

  it('rejects a token whose azp is an empty string (treated as missing)', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'sub-x', azp: '' } });
    const { verifyServiceToken } = await import('../../src/auth/verify-token.js');
    const req = makeRequest('Bearer valid.token.here');
    await expect(verifyServiceToken(req, mockReply)).rejects.toThrow('Token missing azp claim');
  });
});
