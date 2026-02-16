/**
 * Tests for /api/agent route — Security hardening (Issue #11)
 * Covers: origin/host enforcement, content-type, body size guard, existing behavior.
 */

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn() },
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from '@/app/api/agent/route';

function createRequest(
  body: any,
  opts: { origin?: string | null; host?: string | null; contentType?: string | null } = {}
): Request {
  const headers: Record<string, string> = {};
  if (opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json';
  if (opts.origin !== undefined && opts.origin !== null) headers['origin'] = opts.origin;
  if (opts.host !== undefined && opts.host !== null) headers['host'] = opts.host;
  return new Request('http://localhost/api/agent', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = { question: 'Is this area safe?', lat: 37.7749, lng: -122.4194 };

describe('POST /api/agent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      N8N_WEBHOOK_URL: 'https://n8n.example.com/webhook/agent',
      NODE_ENV: 'test',
    } as unknown as NodeJS.ProcessEnv;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'Nice neighborhood.' }),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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

  // ── Existing validation (no regression) ──

  describe('existing validation', () => {
    it('returns 400 when question missing', async () => {
      const res = await POST(createRequest({ lat: 37.7, lng: -122.4 }) as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid coordinates', async () => {
      const res = await POST(createRequest({ question: 'Safe?', lat: 999, lng: 0 }) as any);
      expect(res.status).toBe(400);
    });

    it('returns 503 when N8N_WEBHOOK_URL not configured', async () => {
      delete process.env.N8N_WEBHOOK_URL;
      const res = await POST(createRequest(validBody) as any);
      expect(res.status).toBe(503);
    });
  });

  // ── Happy path ──

  describe('successful request', () => {
    it('forwards to n8n and returns answer', async () => {
      const res = await POST(createRequest(validBody) as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.answer).toBe('Nice neighborhood.');
    });

    it('returns fallback on n8n error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 502 });
      const res = await POST(createRequest(validBody) as any);
      const data = await res.json();
      expect(data.fallback).toBe(true);
    });

    it('returns fallback on timeout', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      const res = await POST(createRequest(validBody) as any);
      const data = await res.json();
      expect(data.fallback).toBe(true);
    });
  });
});
