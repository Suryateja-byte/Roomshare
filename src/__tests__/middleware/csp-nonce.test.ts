/**
 * Tests for CSP middleware helper (applySecurityHeaders)
 */

describe("applySecurityHeaders", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.resetModules();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  function createMockRequest(url = "https://example.com/test"): {
    headers: Headers;
    nextUrl: URL;
  } {
    return {
      headers: new Headers(),
      nextUrl: new URL(url),
    };
  }

  describe("production", () => {
    beforeEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      });
    });

    it("sets CSP on request headers with nonce", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const request = createMockRequest();
      const { requestHeaders, nonce } = applySecurityHeaders(request);

      expect(nonce).toBeDefined();
      expect(nonce!.length).toBeGreaterThan(0);
      const csp = requestHeaders.get("content-security-policy");
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it("sets CSP on response headers", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const request = createMockRequest();
      const { responseHeaders } = applySecurityHeaders(request);

      expect(responseHeaders.get("Content-Security-Policy")).toBeDefined();
    });

    it("does not include unsafe-inline in script-src", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const request = createMockRequest();
      const { responseHeaders } = applySecurityHeaders(request);

      const csp = responseHeaders.get("Content-Security-Policy")!;
      const scriptSrc = csp
        .split(";")
        .find((d: string) => d.trim().startsWith("script-src"));
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("generates unique nonce per call", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const req1 = createMockRequest();
      const req2 = createMockRequest();
      const { nonce: nonce1 } = applySecurityHeaders(req1);
      const { nonce: nonce2 } = applySecurityHeaders(req2);

      expect(nonce1).not.toBe(nonce2);
    });

    it("includes security headers", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const request = createMockRequest();
      const { responseHeaders } = applySecurityHeaders(request);

      expect(responseHeaders.get("X-Frame-Options")).toBe("DENY");
      expect(responseHeaders.get("X-Content-Type-Options")).toBe("nosniff");
      expect(responseHeaders.get("Referrer-Policy")).toBe(
        "origin-when-cross-origin",
      );
      expect(responseHeaders.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(responseHeaders.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    });
  });

  describe("development", () => {
    beforeEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        writable: true,
        configurable: true,
      });
    });

    it("uses unsafe-inline in development (no nonce)", () => {
      jest.resetModules();
      const {
        applySecurityHeaders,
      } = require("@/lib/csp-middleware");
      const request = createMockRequest();
      const { nonce, responseHeaders } = applySecurityHeaders(request);

      expect(nonce).toBeUndefined();
      const csp = responseHeaders.get("Content-Security-Policy")!;
      const scriptSrc = csp
        .split(";")
        .find((d: string) => d.trim().startsWith("script-src"));
      expect(scriptSrc).toContain("'unsafe-inline'");
    });
  });
});
