/**
 * Tests for POST /api/metrics route
 *
 * Tests the security stack: origin/host enforcement, content-type,
 * rate limiting, body size guard, JSON parsing, schema validation,
 * HMAC computation, conditional logging, success response, and error handling.
 */

// ============ MUTABLE MOCK CONTAINERS ============
// Defined before jest.mock() calls so factories can close over them.

const mockIsOriginAllowed = jest.fn().mockReturnValue(true);
const mockIsHostAllowed = jest.fn().mockReturnValue(true);

const mockCheckMetricsRateLimit = jest.fn().mockResolvedValue({ success: true });
const mockGetClientIP = jest.fn().mockReturnValue('127.0.0.1');

const mockLoggerSyncError = jest.fn();

const mockCaptureException = jest.fn();
const mockWithScope = jest.fn();

// ============ JEST MOCKS (hoisted before imports) ============

jest.mock('@/lib/origin-guard', () => ({
  isOriginAllowed: (...args: unknown[]) => mockIsOriginAllowed(...args),
  isHostAllowed: (...args: unknown[]) => mockIsHostAllowed(...args),
}));

jest.mock('@/lib/rate-limit-redis', () => ({
  checkMetricsRateLimit: (...args: unknown[]) => mockCheckMetricsRateLimit(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  getClientIP: (...args: unknown[]) => mockGetClientIP(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: (...args: unknown[]) => mockLoggerSyncError(...args),
    },
  },
  sanitizeErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  withScope: (...args: unknown[]) => mockWithScope(...args),
}), { virtual: true });

// Mock next/server so NextResponse.json works reliably across all NODE_ENV values in Jest
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const status = init?.status ?? 200;
      const body = JSON.stringify(data);
      return new Response(body, {
        status,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    },
  },
}));

// ============ IMPORTS ============

import { POST } from '@/app/api/metrics/route';

// ============ HELPERS ============

const BASE_URL = 'http://localhost/api/metrics';

const VALID_PAYLOAD = {
  listingId: 'listing-123',
  sid: 'session-456',
  route: 'nearby' as const,
  blocked: false,
  type: 'type' as const,
  types: ['restaurant', 'cafe'],
  count: 5,
};

function makeRequest(
  body: unknown,
  options: {
    contentType?: string;
    origin?: string;
    host?: string;
  } = {}
): Request {
  const headers: Record<string, string> = {
    'content-type': options.contentType ?? 'application/json',
  };
  if (options.origin !== undefined) headers['origin'] = options.origin;
  if (options.host !== undefined) headers['host'] = options.host;

  return new Request(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ============ TESTS ============

describe('POST /api/metrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset defaults
    mockIsOriginAllowed.mockReturnValue(true);
    mockIsHostAllowed.mockReturnValue(true);
    mockCheckMetricsRateLimit.mockResolvedValue({ success: true });
    mockGetClientIP.mockReturnValue('127.0.0.1');
    // Restore env in case a previous test mutated it
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================================
  // 1. Origin/Host enforcement
  // ============================================================

  describe('origin/host enforcement', () => {
    beforeEach(() => {
      process.env = { ...originalEnv, NODE_ENV: 'production' };
    });

    it('allows request with an allowed origin', async () => {
      mockIsOriginAllowed.mockReturnValue(true);
      const req = makeRequest(VALID_PAYLOAD, { origin: 'https://roomshare.com' });
      const res = await POST(req);
      expect(res.status).not.toBe(403);
    });

    it('blocks request with a disallowed origin (returns 403)', async () => {
      mockIsOriginAllowed.mockReturnValue(false);
      const req = makeRequest(VALID_PAYLOAD, { origin: 'https://evil.com' });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden');
    });

    it('falls back to host check when origin header is absent', async () => {
      mockIsHostAllowed.mockReturnValue(true);
      const req = makeRequest(VALID_PAYLOAD, { host: 'roomshare.com' });
      const res = await POST(req);
      expect(mockIsHostAllowed).toHaveBeenCalled();
      expect(res.status).not.toBe(403);
    });

    it('allows request when host check passes (no origin)', async () => {
      mockIsHostAllowed.mockReturnValue(true);
      const req = makeRequest(VALID_PAYLOAD, { host: 'roomshare.com' });
      const res = await POST(req);
      expect(res.status).not.toBe(403);
    });

    it('blocks request when host check fails and origin is absent (returns 403)', async () => {
      mockIsHostAllowed.mockReturnValue(false);
      const req = makeRequest(VALID_PAYLOAD, { host: 'evil.com' });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden');
    });

    it('skips origin/host checks in non-production (development) mode', async () => {
      process.env = { ...originalEnv, NODE_ENV: 'development' };
      mockIsOriginAllowed.mockReturnValue(false);
      mockIsHostAllowed.mockReturnValue(false);
      const req = makeRequest(VALID_PAYLOAD, { origin: 'https://evil.com' });
      const res = await POST(req);
      expect(res.status).not.toBe(403);
    });
  });

  // ============================================================
  // 2. Content-Type enforcement
  // ============================================================

  describe('content-type enforcement', () => {
    it('accepts requests with application/json content-type', async () => {
      const req = makeRequest(VALID_PAYLOAD, { contentType: 'application/json' });
      const res = await POST(req);
      expect(res.status).not.toBe(415);
    });

    it('returns 415 for text/plain content-type', async () => {
      const req = makeRequest(JSON.stringify(VALID_PAYLOAD), { contentType: 'text/plain' });
      const res = await POST(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.error).toBe('Invalid content type');
    });

    it('returns 415 when content-type header is missing', async () => {
      const req = new Request(BASE_URL, {
        method: 'POST',
        body: JSON.stringify(VALID_PAYLOAD),
        // No content-type header
      });
      const res = await POST(req);
      expect(res.status).toBe(415);
    });
  });

  // ============================================================
  // 3. Rate limiting
  // ============================================================

  describe('rate limiting', () => {
    it('allows requests when rate limit is not exceeded', async () => {
      mockCheckMetricsRateLimit.mockResolvedValue({ success: true });
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).not.toBe(429);
    });

    it('returns 429 when rate limit is exceeded', async () => {
      mockCheckMetricsRateLimit.mockResolvedValue({ success: false, retryAfter: 60 });
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toBe('Too many requests');
    });

    it('includes Retry-After header in 429 response', async () => {
      mockCheckMetricsRateLimit.mockResolvedValue({ success: false, retryAfter: 45 });
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('45');
    });
  });

  // ============================================================
  // 4. Body size guard
  // ============================================================

  describe('body size guard', () => {
    it('accepts a ~5KB body', async () => {
      const body = JSON.stringify({
        ...VALID_PAYLOAD,
        sid: 'a'.repeat(64),
      });
      expect(body.length).toBeLessThan(10_000);
      const req = makeRequest(body);
      const res = await POST(req);
      expect(res.status).not.toBe(413);
    });

    it('returns 413 for a body exceeding 10KB', async () => {
      // A string > 10_000 bytes — body size is checked before JSON parsing
      const oversizedRaw = 'x'.repeat(11_000);
      const req = new Request(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedRaw,
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toBe('Request too large');
    });

    it('uses actual body size, not Content-Length header', async () => {
      // Lie about size with Content-Length; route reads body via request.text()
      const oversizedRaw = 'x'.repeat(11_000);
      const req = new Request(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '50',
        },
        body: oversizedRaw,
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  // ============================================================
  // 5. JSON parsing
  // ============================================================

  describe('JSON parsing', () => {
    it('accepts valid JSON body', async () => {
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).not.toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const req = new Request(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not { valid json',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON');
    });
  });

  // ============================================================
  // 6. Schema validation
  // ============================================================

  describe('schema validation', () => {
    it('accepts a valid full payload', async () => {
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).not.toBe(400);
    });

    it('returns 400 when listingId is missing', async () => {
      const { listingId: _removed, ...rest } = VALID_PAYLOAD;
      const req = makeRequest(rest);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when sid is missing', async () => {
      const { sid: _removed, ...rest } = VALID_PAYLOAD;
      const req = makeRequest(rest);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when route is missing', async () => {
      const { route: _removed, ...rest } = VALID_PAYLOAD;
      const req = makeRequest(rest);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 for invalid route enum value', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, route: 'unknown_route' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when blocked is missing', async () => {
      const { blocked: _removed, ...rest } = VALID_PAYLOAD;
      const req = makeRequest(rest);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when listingId exceeds 64 characters', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, listingId: 'a'.repeat(65) });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when types is not an array', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, types: 'restaurant' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when types array has more than 8 items', async () => {
      const req = makeRequest({
        ...VALID_PAYLOAD,
        types: [
          'restaurant', 'cafe', 'bar', 'gym', 'park',
          'library', 'bank', 'atm', 'pharmacy', // 9 items
        ],
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when a types item is not in the allowlist', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, types: ['church'] });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when count is negative', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, count: -1 });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when count exceeds 100', async () => {
      const req = makeRequest({ ...VALID_PAYLOAD, count: 101 });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid payload');
    });

    it('returns 400 when count is Infinity (1e309 → Infinity in JSON)', async () => {
      // JSON spec does not support Infinity, but 1e309 becomes Infinity in JS
      const raw = `{"listingId":"listing-123","sid":"session-456","route":"nearby","blocked":false,"count":1e309}`;
      const req = new Request(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('accepts a valid minimal payload (only required fields)', async () => {
      const minimalPayload = {
        listingId: 'listing-123',
        sid: 'session-456',
        route: 'llm',
        blocked: true,
      };
      const req = makeRequest(minimalPayload);
      const res = await POST(req);
      expect(res.status).not.toBe(400);
    });

    it('accepts payload with optional fields omitted', async () => {
      const { type: _t, types: _ts, count: _c, ...partial } = VALID_PAYLOAD;
      const req = makeRequest(partial);
      const res = await POST(req);
      expect(res.status).not.toBe(400);
    });
  });

  // ============================================================
  // 7. HMAC computation
  //
  // LOG_HMAC_SECRET is read at module load time, so we use
  // jest.isolateModules() + require() to get a fresh module instance
  // with the secret set. We also need to re-register mocks inside
  // isolateModules so the fresh module gets the mocked dependencies.
  // ============================================================

  describe('HMAC computation', () => {
    function loadFreshHmac(secret: string): (listingId: string) => string {
      let freshHmac!: (listingId: string) => string;
      jest.isolateModules(() => {
        process.env = { ...originalEnv, LOG_HMAC_SECRET: secret };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        freshHmac = require('@/app/api/metrics/hmac').hmacListingId;
      });
      return freshHmac;
    }

    it('produces a 16 hex-character hash when secret is set', () => {
      const hmac = loadFreshHmac('test-secret-value');
      const lid = hmac('listing-123');
      expect(typeof lid).toBe('string');
      expect(lid).toHaveLength(16);
      expect(lid).toMatch(/^[0-9a-f]{16}$/);
    });

    it('produces different hashes for different listingIds', () => {
      const hmac = loadFreshHmac('test-secret-value');
      const lid1 = hmac('listing-aaa');
      const lid2 = hmac('listing-bbb');
      expect(lid1).not.toBe(lid2);
    });

    it('uses the secret — different secrets produce different hashes for same listingId', () => {
      const hmac1 = loadFreshHmac('secret-alpha');
      const hmac2 = loadFreshHmac('secret-beta');
      const hash1 = hmac1('listing-123');
      const hash2 = hmac2('listing-123');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================
  // 8. Conditional logging
  // ============================================================

  describe('no debug logging in production code', () => {
    it('does not emit [SafeMetrics] console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const req = makeRequest(VALID_PAYLOAD);
        await POST(req);
        const metricsCall = consoleSpy.mock.calls.find((c) => c[0] === '[SafeMetrics]');
        expect(metricsCall).toBeUndefined();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('returns 200 when LOG_HMAC_SECRET is missing (skips HMAC computation)', async () => {
      let freshPost!: typeof POST;
      jest.isolateModules(() => {
        jest.mock('@/lib/origin-guard', () => ({ isOriginAllowed: () => true, isHostAllowed: () => true }));
        jest.mock('@/lib/rate-limit-redis', () => ({ checkMetricsRateLimit: () => Promise.resolve({ success: true }) }));
        jest.mock('@/lib/rate-limit', () => ({ getClientIP: () => '127.0.0.1' }));
        jest.mock('@/lib/logger', () => ({ logger: { sync: { error: jest.fn() } }, sanitizeErrorMessage: (e: unknown) => String(e) }));
        jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), withScope: jest.fn() }), { virtual: true });
        jest.mock('next/server', () => ({
          NextResponse: { json: (data: unknown, init?: { status?: number }) => new Response(JSON.stringify(data), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }) },
        }));
        const envWithoutSecret = { ...originalEnv };
        delete (envWithoutSecret as Record<string, string | undefined>).LOG_HMAC_SECRET;
        process.env = envWithoutSecret as NodeJS.ProcessEnv;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        freshPost = require('@/app/api/metrics/route').POST;
      });
      const envWithoutSecret = { ...originalEnv };
      delete (envWithoutSecret as Record<string, string | undefined>).LOG_HMAC_SECRET;
      process.env = envWithoutSecret as NodeJS.ProcessEnv;

      try {
        const req = makeRequest(VALID_PAYLOAD);
        const res = await freshPost(req);
        expect(res.status).toBe(200);
      } finally {
        process.env = originalEnv;
      }
    });
  });

  // ============================================================
  // 9. Success response
  // ============================================================

  describe('success response', () => {
    it('returns { ok: true } in the body', async () => {
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      const data = await res.json();
      expect(data).toEqual({ ok: true });
    });

    it('returns status 200', async () => {
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  // ============================================================
  // 10. Error handling
  // ============================================================

  describe('error handling', () => {
    it('returns 500 when an unexpected error is thrown', async () => {
      mockCheckMetricsRateLimit.mockRejectedValue(new Error('Redis exploded'));
      const req = makeRequest(VALID_PAYLOAD);
      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('Failed');
    });

    it('calls Sentry.captureException when an unexpected error is thrown', async () => {
      const boom = new Error('Unexpected crash');
      mockCheckMetricsRateLimit.mockRejectedValue(boom);
      const req = makeRequest(VALID_PAYLOAD);
      await POST(req);
      expect(mockCaptureException).toHaveBeenCalledWith(
        boom,
        expect.objectContaining({
          tags: expect.objectContaining({ route: '/api/metrics', method: 'POST' }),
        })
      );
    });
  });
});
