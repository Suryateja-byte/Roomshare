/**
 * Tests for origin-guard utility
 * Validates allowed-origin/host parsing and enforcement.
 */

describe("origin-guard", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("getAllowedOrigins", () => {
    it("parses a comma-separated ALLOWED_ORIGINS env variable", async () => {
      process.env.ALLOWED_ORIGINS =
        "https://example.com,https://api.example.com";
      (process.env as any).NODE_ENV = "production";
      const { getAllowedOrigins } = await import("@/lib/origin-guard");
      expect(getAllowedOrigins()).toEqual([
        "https://example.com",
        "https://api.example.com",
      ]);
    });

    it("adds localhost:3000 in development mode", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      (process.env as any).NODE_ENV = "development";
      const { getAllowedOrigins } = await import("@/lib/origin-guard");
      expect(getAllowedOrigins()).toContain("http://localhost:3000");
    });

    it("returns an empty array when ALLOWED_ORIGINS is unset and not in development", async () => {
      delete process.env.ALLOWED_ORIGINS;
      (process.env as any).NODE_ENV = "production";
      const { getAllowedOrigins } = await import("@/lib/origin-guard");
      expect(getAllowedOrigins()).toEqual([]);
    });

    it("adds the exact Vercel deployment origin when VERCEL_URL is set", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      process.env.VERCEL_URL = "roomshare-random.vercel.app";
      (process.env as any).NODE_ENV = "production";

      const { getAllowedOrigins } = await import("@/lib/origin-guard");

      expect(getAllowedOrigins()).toEqual([
        "https://example.com",
        "https://roomshare-random.vercel.app",
      ]);
    });

    it("adds the production-domain origin from VERCEL_PROJECT_PRODUCTION_URL", async () => {
      delete process.env.ALLOWED_ORIGINS;
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "roomshare.com";
      (process.env as any).NODE_ENV = "production";

      const { getAllowedOrigins } = await import("@/lib/origin-guard");

      expect(getAllowedOrigins()).toEqual(["https://roomshare.com"]);
    });
  });

  describe("isOriginAllowed", () => {
    it("returns true for an origin in the allowed list", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      (process.env as any).NODE_ENV = "production";
      const { isOriginAllowed } = await import("@/lib/origin-guard");
      expect(isOriginAllowed("https://example.com")).toBe(true);
    });

    it("returns false for an origin not in the allowed list", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      (process.env as any).NODE_ENV = "production";
      const { isOriginAllowed } = await import("@/lib/origin-guard");
      expect(isOriginAllowed("https://evil.com")).toBe(false);
    });

    it("returns false for a null origin", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      (process.env as any).NODE_ENV = "production";
      const { isOriginAllowed } = await import("@/lib/origin-guard");
      expect(isOriginAllowed(null)).toBe(false);
    });

    it("allows only the exact Vercel deployment origin from VERCEL_URL", async () => {
      delete process.env.ALLOWED_ORIGINS;
      process.env.VERCEL_URL = "roomshare-random.vercel.app";
      (process.env as any).NODE_ENV = "production";

      const { isOriginAllowed } = await import("@/lib/origin-guard");

      expect(isOriginAllowed("https://roomshare-random.vercel.app")).toBe(
        true
      );
      expect(isOriginAllowed("https://other-preview.vercel.app")).toBe(false);
    });
  });

  describe("isSameOrigin", () => {
    it("returns true when the origin host matches the request host", async () => {
      const { isSameOrigin } = await import("@/lib/origin-guard");
      expect(isSameOrigin("https://roomshare.com", "roomshare.com")).toBe(true);
    });

    it("returns true for a matching host that includes a port (local prod build)", async () => {
      const { isSameOrigin } = await import("@/lib/origin-guard");
      expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    });

    it("returns false for a cross-origin request", async () => {
      const { isSameOrigin } = await import("@/lib/origin-guard");
      expect(isSameOrigin("https://evil.com", "roomshare.com")).toBe(false);
      expect(isSameOrigin("https://evil.com", "localhost:3000")).toBe(false);
    });

    it("returns false when origin or host is null", async () => {
      const { isSameOrigin } = await import("@/lib/origin-guard");
      expect(isSameOrigin(null, "roomshare.com")).toBe(false);
      expect(isSameOrigin("https://roomshare.com", null)).toBe(false);
    });

    it("returns false for a malformed origin", async () => {
      const { isSameOrigin } = await import("@/lib/origin-guard");
      expect(isSameOrigin("not a url", "roomshare.com")).toBe(false);
    });
  });

  describe("getAllowedHosts", () => {
    it("parses a comma-separated ALLOWED_HOSTS env variable", async () => {
      process.env.ALLOWED_HOSTS = "example.com,api.example.com";
      (process.env as any).NODE_ENV = "production";
      const { getAllowedHosts } = await import("@/lib/origin-guard");
      expect(getAllowedHosts()).toEqual(["example.com", "api.example.com"]);
    });

    it("adds the exact Vercel deployment host when VERCEL_URL is set", async () => {
      process.env.ALLOWED_HOSTS = "example.com";
      process.env.VERCEL_URL = "roomshare-random.vercel.app";
      (process.env as any).NODE_ENV = "production";

      const { getAllowedHosts } = await import("@/lib/origin-guard");

      expect(getAllowedHosts()).toEqual([
        "example.com",
        "roomshare-random.vercel.app",
      ]);
    });

    it("adds the production-domain host from VERCEL_PROJECT_PRODUCTION_URL", async () => {
      delete process.env.ALLOWED_HOSTS;
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "roomshare.com";
      (process.env as any).NODE_ENV = "production";

      const { getAllowedHosts } = await import("@/lib/origin-guard");

      expect(getAllowedHosts()).toEqual(["roomshare.com"]);
    });
  });

  describe("isHostAllowed", () => {
    it("strips port and matches host-only entry", async () => {
      process.env.ALLOWED_HOSTS = "example.com";
      (process.env as any).NODE_ENV = "production";
      const { isHostAllowed } = await import("@/lib/origin-guard");
      // Host header includes port — should still match bare hostname entry
      expect(isHostAllowed("example.com:443")).toBe(true);
    });

    it("returns false for a null host", async () => {
      process.env.ALLOWED_HOSTS = "example.com";
      (process.env as any).NODE_ENV = "production";
      const { isHostAllowed } = await import("@/lib/origin-guard");
      expect(isHostAllowed(null)).toBe(false);
    });

    it("matches an exact host:port entry", async () => {
      process.env.ALLOWED_HOSTS = "example.com:8080";
      (process.env as any).NODE_ENV = "production";
      const { isHostAllowed } = await import("@/lib/origin-guard");
      expect(isHostAllowed("example.com:8080")).toBe(true);
    });

    it("matches localhost in development without a port", async () => {
      delete process.env.ALLOWED_HOSTS;
      (process.env as any).NODE_ENV = "development";
      const { isHostAllowed } = await import("@/lib/origin-guard");
      expect(isHostAllowed("localhost")).toBe(true);
    });

    it("allows only the exact Vercel deployment host from VERCEL_URL", async () => {
      delete process.env.ALLOWED_HOSTS;
      process.env.VERCEL_URL = "roomshare-random.vercel.app";
      (process.env as any).NODE_ENV = "production";

      const { isHostAllowed } = await import("@/lib/origin-guard");

      expect(isHostAllowed("roomshare-random.vercel.app")).toBe(true);
      expect(isHostAllowed("roomshare-random.vercel.app:443")).toBe(true);
      expect(isHostAllowed("other-preview.vercel.app")).toBe(false);
    });
  });
});
