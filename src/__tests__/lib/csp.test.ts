/**
 * Tests for CSP header builder
 */

describe("buildCspHeader", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    // Restore NODE_ENV
    jest.resetModules();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  describe("production (with nonce)", () => {
    beforeEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      });
    });

    it("includes nonce in script-src", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      expect(buildCspHeader("abc123")).toContain("'nonce-abc123'");
    });

    it("does NOT include unsafe-inline in script-src", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      const csp = buildCspHeader("abc123");
      const scriptSrc = csp
        .split(";")
        .find((d: string) => d.trim().startsWith("script-src"));
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("includes strict-dynamic for dynamically loaded scripts", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      const scriptSrc = buildCspHeader("abc123")
        .split(";")
        .find((d: string) => d.trim().startsWith("script-src"));
      expect(scriptSrc).toContain("'strict-dynamic'");
    });

    it("keeps unsafe-inline in style-src (CSS-in-JS)", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      const styleSrc = buildCspHeader("abc123")
        .split(";")
        .find((d: string) => d.trim().startsWith("style-src"));
      expect(styleSrc).toContain("'unsafe-inline'");
    });

    it("includes Google Maps origin", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      expect(buildCspHeader("abc123")).toContain(
        "https://maps.googleapis.com",
      );
    });

    it("includes upgrade-insecure-requests", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      expect(buildCspHeader("abc123")).toContain("upgrade-insecure-requests");
    });
  });

  describe("development (no nonce)", () => {
    beforeEach(() => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        writable: true,
        configurable: true,
      });
    });

    it("uses unsafe-inline + unsafe-eval", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      const csp = buildCspHeader();
      const scriptSrc = csp
        .split(";")
        .find((d: string) => d.trim().startsWith("script-src"));
      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).toContain("'unsafe-eval'");
      expect(csp).not.toContain("'nonce-");
    });

    it("does NOT include upgrade-insecure-requests", () => {
      jest.resetModules();
      const { buildCspHeader } = require("@/lib/csp");
      expect(buildCspHeader()).not.toContain("upgrade-insecure-requests");
    });
  });
});
