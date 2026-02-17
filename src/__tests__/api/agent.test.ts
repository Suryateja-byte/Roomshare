/**
 * Tests for POST /api/agent route
 *
 * Covers: origin/host enforcement, content-type, body size guard,
 * rate limiting, auth, input validation, coordinate validation,
 * webhook forwarding, timeout handling, and graceful fallback responses.
 */

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}));

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { POST } from '@/app/api/agent/route';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import { NextRequest } from 'next/server';

describe('POST /api/agent', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  };

  const validBody = {
    question: 'What restaurants are nearby?',
    lat: 37.7749,
    lng: -122.4194,
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    process.env = {
      ...originalEnv,
      N8N_WEBHOOK_URL: 'https://n8n.example.com/webhook/agent',
      NODE_ENV: 'test',
    } as unknown as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createRequest(
    body: unknown,
    opts: { origin?: string | null; host?: string | null; contentType?: string | null } = {},
  ): NextRequest {
    const headers: Record<string, string> = {};
    if (opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json';
    if (opts.origin !== undefined && opts.origin !== null) headers['origin'] = opts.origin;
    if (opts.host !== undefined && opts.host !== null) headers['host'] = opts.host;
    return new NextRequest('http://localhost:3000/api/agent', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  // ── Origin/Host enforcement (production) ──

  describe('origin/host enforcement (production)', () => {
    beforeEach(() => {
      process.env = {
        ...process.env,
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://roomshare.app',
        ALLOWED_HOSTS: 'roomshare.app',
      } as unknown as NodeJS.ProcessEnv;
    });

    it('returns 403 when origin not in allowlist', async () => {
      const res = await POST(createRequest(validBody, { origin: 'https://evil.com' }) as any);
      expect(res.status).toBe(403);
    });

    it('returns 403 when no origin and host not in allowlist', async () => {
      const res = await POST(createRequest(validBody, { host: 'evil.com' }) as any);
      expect(res.status).toBe(403);
    });

    it('allows valid origin', async () => {
      const res = await POST(createRequest(validBody, { origin: 'https://roomshare.app', host: 'roomshare.app' }) as any);
      expect(res.status).toBe(200);
    });

    it('allows valid host with port', async () => {
      const res = await POST(createRequest(validBody, { host: 'roomshare.app:443' }) as any);
      expect(res.status).toBe(200);
    });
  });

  describe('origin/host enforcement (development)', () => {
    it('skips enforcement in development', async () => {
      process.env = { ...process.env, NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv;
      const res = await POST(createRequest(validBody, { origin: 'https://evil.com' }) as any);
      expect(res.status).not.toBe(403);
    });
  });

  // ── Content-Type enforcement ──

  describe('content-type enforcement', () => {
    it('returns 415 for non-JSON content type', async () => {
      const res = await POST(createRequest(validBody, { contentType: 'text/plain' }) as any);
      expect(res.status).toBe(415);
    });

    it('returns 415 when content-type missing', async () => {
      const res = await POST(createRequest(validBody, { contentType: null }) as any);
      expect(res.status).toBe(415);
    });

    it('accepts application/json with charset', async () => {
      const res = await POST(createRequest(validBody, { contentType: 'application/json; charset=utf-8' }) as any);
      expect(res.status).toBe(200);
    });
  });

  // ── Rate limiting ──

  describe('rate limiting', () => {
    it('applies rate limiting', async () => {
      const request = createRequest(validBody);
      await POST(request);

      expect(withRateLimit).toHaveBeenCalledWith(request, { type: 'agent' });
    });

    it('returns 429 when rate limited', async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: 'Too many requests' }),
        headers: new Map(),
      };
      (withRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(429);
    });
  });

  // ── Authentication ──

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('returns 401 when user id is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { name: 'Test' } });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(401);
    });
  });

  // ── Body size guard ──

  describe('body size guard', () => {
    it('returns 413 for oversized body', async () => {
      const res = await POST(createRequest({ question: 'x'.repeat(11000), lat: 0, lng: 0 }) as any);
      expect(res.status).toBe(413);
    });

    it('returns 413 for multibyte payload exceeding byte limit', async () => {
      // 5,000 emoji = 5,000 UTF-16 code units but 20,000 UTF-8 bytes
      const res = await POST(createRequest({ question: '😀'.repeat(5000), lat: 0, lng: 0 }) as any);
      expect(res.status).toBe(413);
    });
  });

  // ── JSON parse ──

  describe('JSON parsing', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await POST(createRequest('not-json{{{') as any);
      expect(res.status).toBe(400);
    });
  });

  // ── Input validation ──

  describe('input validation', () => {
    it('returns 400 when question is missing', async () => {
      const response = await POST(createRequest({ lat: 37.7749, lng: -122.4194 }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Question is required');
    });

    it('returns 400 when question is not a string', async () => {
      const response = await POST(createRequest({ question: 123, lat: 37.7749, lng: -122.4194 }));

      expect(response.status).toBe(400);
    });

    it('returns 400 when question is too short (<2 chars)', async () => {
      const response = await POST(createRequest({ question: 'a', lat: 37.7749, lng: -122.4194 }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Question is too short');
    });

    it('returns 400 when question is too long (>500 chars)', async () => {
      const response = await POST(createRequest({
        question: 'x'.repeat(501),
        lat: 37.7749,
        lng: -122.4194,
      }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Question is too long (max 500 characters)');
    });

    it('returns 400 for invalid coordinates', async () => {
      const response = await POST(createRequest({
        question: 'What is nearby?',
        lat: 91,
        lng: -122.4194,
      }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid coordinates');
    });

    it('returns 400 for NaN coordinates', async () => {
      const response = await POST(createRequest({
        question: 'What is nearby?',
        lat: NaN,
        lng: -122.4194,
      }));

      expect(response.status).toBe(400);
    });
  });

  // ── Webhook configuration ──

  describe('webhook configuration', () => {
    it('returns 503 when N8N_WEBHOOK_URL is not configured', async () => {
      delete process.env.N8N_WEBHOOK_URL;

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toBe('Service temporarily unavailable');
    });
  });

  // ── Webhook forwarding ──

  describe('webhook forwarding', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('forwards request to n8n webhook and returns answer', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'There are several restaurants nearby.' }),
      });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.answer).toBe('There are several restaurants nearby.');
    });

    it('trims question whitespace before forwarding', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Response' }),
      });

      await POST(createRequest({
        question: '  What is nearby?  ',
        lat: 37.7749,
        lng: -122.4194,
      }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          body: JSON.stringify({
            question: 'What is nearby?',
            lat: 37.7749,
            lng: -122.4194,
          }),
        }),
      );
    });

    it('returns graceful fallback when webhook returns non-OK response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fallback).toBe(true);
      expect(data.answer).toBeDefined();
    });

    it('returns graceful fallback on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = jest.fn().mockRejectedValue(abortError);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fallback).toBe(true);
    });

    it('returns graceful fallback on connection failure', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fallback).toBe(true);
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('returns 500 on unexpected errors (e.g. JSON parse failure)', async () => {
      // Passing a request whose .text() method throws
      const badRequest = {
        text: jest.fn().mockRejectedValue(new Error('Read failed')),
        headers: {
          get: jest.fn().mockImplementation((name: string) => {
            if (name === 'content-type') return 'application/json';
            return null;
          }),
        },
        url: 'http://localhost:3000/api/agent',
      } as unknown as NextRequest;

      const response = await POST(badRequest);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  // ── Additional edge cases ──

  describe('coordinate boundary values', () => {
    it('accepts exact boundary coordinates (-90, -180)', async () => {
      const res = await POST(createRequest({ question: 'What is nearby?', lat: -90, lng: -180 }));
      expect(res.status).toBe(200);
    });

    it('accepts exact boundary coordinates (90, 180)', async () => {
      const res = await POST(createRequest({ question: 'What is nearby?', lat: 90, lng: 180 }));
      expect(res.status).toBe(200);
    });

    it('rejects lat just outside range (90.001)', async () => {
      const res = await POST(createRequest({ question: 'What is nearby?', lat: 90.001, lng: 0 }));
      expect(res.status).toBe(400);
    });

    it('rejects lng just outside range (-180.001)', async () => {
      const res = await POST(createRequest({ question: 'What is nearby?', lat: 0, lng: -180.001 }));
      expect(res.status).toBe(400);
    });

    it('rejects Infinity coordinates', async () => {
      const res = await POST(createRequest({ question: 'What is nearby?', lat: Infinity, lng: 0 }));
      expect(res.status).toBe(400);
    });
  });

  describe('origin validation edge cases (production)', () => {
    beforeEach(() => {
      process.env = {
        ...process.env,
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://roomshare.app,https://www.roomshare.app',
        ALLOWED_HOSTS: 'roomshare.app,www.roomshare.app',
      } as unknown as NodeJS.ProcessEnv;
    });

    it('allows second origin in comma-separated list', async () => {
      const res = await POST(createRequest(validBody, {
        origin: 'https://www.roomshare.app',
        host: 'www.roomshare.app',
      }) as any);
      expect(res.status).toBe(200);
    });

    it('allows valid host fallback when origin is absent', async () => {
      const res = await POST(createRequest(validBody, { host: 'www.roomshare.app' }) as any);
      expect(res.status).toBe(200);
    });

    it('rejects when both origin and host are missing in production', async () => {
      const res = await POST(createRequest(validBody, {}) as any);
      expect(res.status).toBe(403);
    });
  });

  describe('question edge cases', () => {
    it('returns 400 for whitespace-only question (too short after trim)', async () => {
      const res = await POST(createRequest({ question: '   ', lat: 37.7749, lng: -122.4194 }));
      expect(res.status).toBe(400);
    });

    it('accepts exactly 2-char question', async () => {
      const res = await POST(createRequest({ question: 'Hi', lat: 37.7749, lng: -122.4194 }));
      expect(res.status).toBe(200);
    });

    it('accepts exactly 500-char question', async () => {
      const res = await POST(createRequest({
        question: 'x'.repeat(500),
        lat: 37.7749,
        lng: -122.4194,
      }));
      expect(res.status).toBe(200);
    });
  });
});
