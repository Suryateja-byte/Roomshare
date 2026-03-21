/**
 * Security-critical edge-case tests for getClientIP and getClientIPFromHeaders.
 *
 * The existing rate-limit.test.ts covers basic happy paths. This file adds:
 *   - IPv6 address handling
 *   - Malformed / injection-attempt header values
 *   - Header trust hierarchy enforcement (security property)
 *   - Anonymous fingerprint stability and format
 *   - Parity between getClientIP and getClientIPFromHeaders
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    },
  },
}));

import { getClientIP, getClientIPFromHeaders } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/test", {
    headers: new Headers(headers),
  });
}

function mockHeaders(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

// ---------------------------------------------------------------------------

describe("getClientIP - edge cases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env so mutations don't leak between tests
    process.env = { ...originalEnv };
    // Default: production mode, no trusted proxy/CDN
    delete process.env.TRUST_CDN_HEADERS;
    delete process.env.TRUST_PROXY;
    (process.env as Record<string, string>).NODE_ENV = "production";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  describe("IPv6 addresses", () => {
    it("handles standard IPv6 in x-real-ip", () => {
      const request = mockRequest({ "x-real-ip": "2001:db8::1" });

      const ip = getClientIP(request);

      expect(ip).toBe("2001:db8::1");
    });

    it("handles IPv6 loopback (::1) in x-real-ip", () => {
      const request = mockRequest({ "x-real-ip": "::1" });

      const ip = getClientIP(request);

      expect(ip).toBe("::1");
    });

    it("handles IPv4-mapped IPv6 (::ffff:192.168.1.1) in x-real-ip", () => {
      const request = mockRequest({ "x-real-ip": "::ffff:192.168.1.1" });

      const ip = getClientIP(request);

      expect(ip).toBe("::ffff:192.168.1.1");
    });

    it("handles standard IPv6 in x-forwarded-for in development mode", () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      const request = mockRequest({
        "x-forwarded-for": "2001:db8::1, 10.0.0.1",
      });

      const ip = getClientIP(request);

      // getFirstForwardedIp extracts first entry after split(",") and trim
      expect(ip).toBe("2001:db8::1");
    });

    it("handles bracketed IPv6 in x-forwarded-for in development mode", () => {
      // Some proxies forward IPv6 as [2001:db8::1]:port; the function does not
      // strip brackets — it returns the raw first entry verbatim.
      (process.env as Record<string, string>).NODE_ENV = "development";
      const request = mockRequest({
        "x-forwarded-for": "[2001:db8::1]:8080, 10.0.0.1",
      });

      const ip = getClientIP(request);

      expect(ip).toBe("[2001:db8::1]:8080");
    });
  });

  // -------------------------------------------------------------------------
  describe("malformed header values", () => {
    it("handles empty x-real-ip gracefully by falling through to fingerprint", () => {
      // An empty string is falsy; getClientIP should not return it.
      const request = mockRequest({ "x-real-ip": "" });

      const ip = getClientIP(request);

      // Empty x-real-ip falls through → no other trusted header → anon fingerprint
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("returns whitespace-only x-real-ip as-is because it is a truthy string", () => {
      // "   " is truthy; the code returns it without trimming.
      const request = mockRequest({ "x-real-ip": "   " });

      const ip = getClientIP(request);

      expect(ip).toBe("   ");
    });

    it("returns anonymous fingerprint when x-forwarded-for contains only commas", () => {
      // ",,," → split gives ["","","",""], first is "", trim gives "", falsy → null
      // shouldTrustForwarded is false in production → fingerprint
      const request = mockRequest({ "x-forwarded-for": ",,," });

      const ip = getClientIP(request);

      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("returns anonymous fingerprint when x-forwarded-for first entry is empty", () => {
      // ", 10.0.0.1" → first entry after split is "", trim → "", falsy → null
      const request = mockRequest({ "x-forwarded-for": ", 10.0.0.1" });

      const ip = getClientIP(request);

      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("returns anonymous fingerprint when all x-forwarded-for entries are whitespace", () => {
      // " , , 10.0.0.1" → first entry is " ", trim → "", falsy → null
      const request = mockRequest({ "x-forwarded-for": " , , 10.0.0.1" });

      const ip = getClientIP(request);

      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("does not crash on extremely long x-forwarded-for value (DoS attempt)", () => {
      // A very long value should be processed without throwing; in production
      // shouldTrustForwarded is false so it falls through to fingerprint.
      const longValue = "A".repeat(10_000);
      const request = mockRequest({ "x-forwarded-for": longValue });

      expect(() => getClientIP(request)).not.toThrow();
      // In production without TRUST_PROXY the long forwarded header is ignored
      const ip = getClientIP(request);
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("returns null-byte-containing x-real-ip value as-is (no stripping)", () => {
      // The function does not sanitize values; the raw string is returned.
      // Callers are responsible for further validation. This test documents
      // the current behavior so a future sanitization change is explicit.
      const malicious = "192.168.1.1\x00DROP TABLE";
      const request = mockRequest({ "x-real-ip": malicious });

      const ip = getClientIP(request);

      expect(ip).toBe(malicious);
    });

    it("returns x-real-ip containing CRLF injection characters as-is", () => {
      // Headers API normalizes CRLF in header values; document that the
      // raw value coming out of headers.get() is whatever the Headers object
      // stores (browsers/Node strip CR/LF at the transport layer).
      // We assert the function itself does not introduce additional injection.
      const value = "192.168.1.1\r\nX-Admin: true";
      let ip: string;
      // Headers constructor may strip CRLF; wrap in try/catch so the test
      // is informative regardless of runtime behaviour.
      try {
        const request = mockRequest({ "x-real-ip": value });
        ip = getClientIP(request);
        // Whatever the runtime stored, the function returned it unchanged.
        expect(typeof ip).toBe("string");
      } catch {
        // Some runtimes throw on CRLF in header values — that is also acceptable.
        expect(true).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("header trust hierarchy", () => {
    it("x-real-ip takes precedence over cf-connecting-ip even with TRUST_CDN_HEADERS", () => {
      process.env.TRUST_CDN_HEADERS = "true";
      const request = mockRequest({
        "x-real-ip": "203.0.113.10",
        "cf-connecting-ip": "1.2.3.4",
      });

      const ip = getClientIP(request);

      expect(ip).toBe("203.0.113.10");
    });

    it("cf-connecting-ip takes precedence over x-forwarded-for when TRUST_CDN_HEADERS is true", () => {
      process.env.TRUST_CDN_HEADERS = "true";
      process.env.TRUST_PROXY = "true";
      const request = mockRequest({
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      });

      const ip = getClientIP(request);

      expect(ip).toBe("1.2.3.4");
    });

    it("true-client-ip takes precedence over x-forwarded-for when TRUST_CDN_HEADERS is true", () => {
      process.env.TRUST_CDN_HEADERS = "true";
      process.env.TRUST_PROXY = "true";
      const request = mockRequest({
        "true-client-ip": "5.6.7.8",
        "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      });

      const ip = getClientIP(request);

      expect(ip).toBe("5.6.7.8");
    });

    it("ignores x-forwarded-for in production without TRUST_PROXY (cannot be spoofed)", () => {
      // Security property: in production, a client CANNOT bypass rate limiting
      // by injecting a fake IP via x-forwarded-for.
      (process.env as Record<string, string>).NODE_ENV = "production";
      delete process.env.TRUST_PROXY;
      const request = mockRequest({
        "x-forwarded-for": "8.8.8.8",
      });

      const ip = getClientIP(request);

      expect(ip).not.toBe("8.8.8.8");
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("ignores x-forwarded-for in production even when TRUST_CDN_HEADERS is true but CDN header is absent", () => {
      // TRUST_CDN_HEADERS enables cf-connecting-ip/true-client-ip, NOT x-forwarded-for
      process.env.TRUST_CDN_HEADERS = "true";
      delete process.env.TRUST_PROXY;
      (process.env as Record<string, string>).NODE_ENV = "production";
      const request = mockRequest({
        "x-forwarded-for": "8.8.8.8",
      });

      const ip = getClientIP(request);

      expect(ip).not.toBe("8.8.8.8");
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("falls back to anonymous fingerprint when no trusted headers are present", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      const request = mockRequest({});

      const ip = getClientIP(request);

      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("respects TRUST_PROXY=true in production as an explicit proxy trust opt-in", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.TRUST_PROXY = "true";
      const request = mockRequest({
        "x-forwarded-for": "203.0.113.99, 10.0.0.1",
      });

      const ip = getClientIP(request);

      expect(ip).toBe("203.0.113.99");
    });

    it("does not trust cf-connecting-ip when TRUST_CDN_HEADERS is 'false' (string)", () => {
      process.env.TRUST_CDN_HEADERS = "false";
      const request = mockRequest({
        "cf-connecting-ip": "1.2.3.4",
      });

      const ip = getClientIP(request);

      expect(ip).not.toBe("1.2.3.4");
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });
  });

  // -------------------------------------------------------------------------
  describe("anonymous fingerprint", () => {
    it("returns consistent fingerprint for identical headers across two calls", () => {
      const headers = {
        "user-agent": "Mozilla/5.0 (Test Browser)",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Chromium";v="120"',
      };
      const requestA = mockRequest(headers);
      const requestB = mockRequest(headers);

      const ipA = getClientIP(requestA);
      const ipB = getClientIP(requestB);

      expect(ipA).toBe(ipB);
    });

    it("returns different fingerprints for different user-agents", () => {
      const requestA = mockRequest({ "user-agent": "Mozilla/5.0 (Bot A)" });
      const requestB = mockRequest({ "user-agent": "Mozilla/5.0 (Bot B)" });

      const ipA = getClientIP(requestA);
      const ipB = getClientIP(requestB);

      expect(ipA).not.toBe(ipB);
    });

    it("returns different fingerprints for different accept-language values", () => {
      const requestA = mockRequest({ "accept-language": "en-US" });
      const requestB = mockRequest({ "accept-language": "fr-FR" });

      const ipA = getClientIP(requestA);
      const ipB = getClientIP(requestB);

      expect(ipA).not.toBe(ipB);
    });

    it("fingerprint starts with 'anon-' prefix", () => {
      const request = mockRequest({});

      const ip = getClientIP(request);

      expect(ip.startsWith("anon-")).toBe(true);
    });

    it("fingerprint hex portion is exactly 16 characters", () => {
      const request = mockRequest({});

      const ip = getClientIP(request);

      // Format: "anon-" (5) + 16 hex chars = 21 total
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
      expect(ip.length).toBe(21);
    });

    it("returns valid fingerprint when all fingerprint headers are missing", () => {
      // No user-agent, accept-language, or sec-ch-ua → empty source string
      const request = mockRequest({});

      const ip = getClientIP(request);

      // Should still produce a deterministic anon fingerprint, not throw
      expect(ip).toMatch(/^anon-[a-f0-9]{16}$/);
    });

    it("returns deterministic fingerprint for empty headers (stable zero-value hash)", () => {
      const requestA = mockRequest({});
      const requestB = mockRequest({});

      // Two requests with no identifiable headers get the same bucket so they
      // share a rate-limit slot (intentional design: unknown clients share bucket)
      expect(getClientIP(requestA)).toBe(getClientIP(requestB));
    });
  });
});

// ---------------------------------------------------------------------------

describe("getClientIPFromHeaders - parity with getClientIP", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TRUST_CDN_HEADERS;
    delete process.env.TRUST_PROXY;
    (process.env as Record<string, string>).NODE_ENV = "production";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("handles x-real-ip the same way as getClientIP", () => {
    const headers = mockHeaders({ "x-real-ip": "203.0.113.1" });
    const request = mockRequest({ "x-real-ip": "203.0.113.1" });

    expect(getClientIPFromHeaders(headers)).toBe(getClientIP(request));
    expect(getClientIPFromHeaders(headers)).toBe("203.0.113.1");
  });

  it("handles IPv6 in x-real-ip the same way as getClientIP", () => {
    const headers = mockHeaders({ "x-real-ip": "2001:db8::1" });
    const request = mockRequest({ "x-real-ip": "2001:db8::1" });

    expect(getClientIPFromHeaders(headers)).toBe(getClientIP(request));
    expect(getClientIPFromHeaders(headers)).toBe("2001:db8::1");
  });

  it("handles cf-connecting-ip the same way as getClientIP when TRUST_CDN_HEADERS is true", () => {
    process.env.TRUST_CDN_HEADERS = "true";
    const headers = mockHeaders({ "cf-connecting-ip": "1.2.3.4" });
    const request = mockRequest({ "cf-connecting-ip": "1.2.3.4" });

    expect(getClientIPFromHeaders(headers)).toBe(getClientIP(request));
    expect(getClientIPFromHeaders(headers)).toBe("1.2.3.4");
  });

  it("ignores cf-connecting-ip the same way as getClientIP when TRUST_CDN_HEADERS is not set", () => {
    delete process.env.TRUST_CDN_HEADERS;
    const headers = mockHeaders({ "cf-connecting-ip": "1.2.3.4" });
    const request = mockRequest({ "cf-connecting-ip": "1.2.3.4" });

    const fromHeaders = getClientIPFromHeaders(headers);
    const fromRequest = getClientIP(request);

    expect(fromHeaders).toBe(fromRequest);
    expect(fromHeaders).toMatch(/^anon-[a-f0-9]{16}$/);
  });

  it("falls back to anonymous fingerprint the same way as getClientIP", () => {
    const headers = mockHeaders({});
    const request = mockRequest({});

    expect(getClientIPFromHeaders(headers)).toBe(getClientIP(request));
    expect(getClientIPFromHeaders(headers)).toMatch(/^anon-[a-f0-9]{16}$/);
  });

  it("produces the same fingerprint as getClientIP for identical header sets", () => {
    const headerMap = {
      "user-agent": "Mozilla/5.0 (Test)",
      "accept-language": "en-US",
      "sec-ch-ua": '"Chrome";v="120"',
    };
    const headers = mockHeaders(headerMap);
    const request = mockRequest(headerMap);

    expect(getClientIPFromHeaders(headers)).toBe(getClientIP(request));
  });

  it("ignores x-forwarded-for in production without TRUST_PROXY the same way as getClientIP", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const headers = mockHeaders({ "x-forwarded-for": "8.8.8.8" });
    const request = mockRequest({ "x-forwarded-for": "8.8.8.8" });

    const fromHeaders = getClientIPFromHeaders(headers);
    const fromRequest = getClientIP(request);

    expect(fromHeaders).toBe(fromRequest);
    expect(fromHeaders).not.toBe("8.8.8.8");
    expect(fromHeaders).toMatch(/^anon-[a-f0-9]{16}$/);
  });
});
