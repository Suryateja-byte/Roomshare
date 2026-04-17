/**
 * Tests: Multi-slot booking feature flag cross-validation
 *
 * Uses process.env replacement + jest.resetModules() to isolate
 * each test case (Zod schema is evaluated at module import time).
 */
describe("Multi-slot booking feature flag cross-validation", () => {
  const originalEnv = process.env;

  // All required serverEnvSchema keys (verified from env-turnstile-production.test.ts)
  // Uses NODE_ENV=production so validation errors throw (in dev they only warn)
  const baseEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NEXTAUTH_SECRET: "a".repeat(32),
    NEXTAUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    CRON_SECRET: "b".repeat(32),
    METRICS_SECRET: "m".repeat(32),
    CURSOR_SECRET: "c".repeat(32),
    // Satisfy production Turnstile requirements
    TURNSTILE_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...baseEnv } as unknown as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes with no feature flags set (all undefined)", async () => {
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("passes with valid full combo (all flags enabled correctly)", async () => {
    process.env.ENABLE_MULTI_SLOT_BOOKING = "true";
    process.env.ENABLE_WHOLE_UNIT_MODE = "true";
    process.env.ENABLE_SOFT_HOLDS = "on";
    process.env.ENABLE_BOOKING_AUDIT = "true";
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("passes with MULTI_SLOT only", async () => {
    process.env.ENABLE_MULTI_SLOT_BOOKING = "true";
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("passes with SOFT_HOLDS=drain (does not require MULTI_SLOT)", async () => {
    process.env.ENABLE_SOFT_HOLDS = "drain";
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("throws when WHOLE_UNIT=true without MULTI_SLOT", async () => {
    process.env.ENABLE_WHOLE_UNIT_MODE = "true";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow("Invalid environment configuration");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "ENABLE_WHOLE_UNIT_MODE requires ENABLE_MULTI_SLOT_BOOKING"
      )
    );
    consoleSpy.mockRestore();
  });

  it("throws when BOOKING_AUDIT=true without SOFT_HOLDS=on", async () => {
    process.env.ENABLE_MULTI_SLOT_BOOKING = "true";
    process.env.ENABLE_BOOKING_AUDIT = "true";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow("Invalid environment configuration");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("ENABLE_BOOKING_AUDIT requires ENABLE_SOFT_HOLDS")
    );
    consoleSpy.mockRestore();
  });

  it("throws when SOFT_HOLDS=on without MULTI_SLOT", async () => {
    process.env.ENABLE_SOFT_HOLDS = "on";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow("Invalid environment configuration");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "ENABLE_SOFT_HOLDS=on requires ENABLE_MULTI_SLOT_BOOKING"
      )
    );
    consoleSpy.mockRestore();
  });

  it("feature getters do not throw on unrelated invalid production secrets", async () => {
    process.env.CRON_SECRET = "change-in-production-aaaa-bbbb-cccc-dddd-eeee";
    process.env.ENABLE_MULTI_SLOT_BOOKING = "true";
    process.env.ENABLE_SOFT_HOLDS = "on";

    const { features } = await import("@/lib/env");

    expect(() => features.softHoldsEnabled).not.toThrow();
    expect(features.softHoldsEnabled).toBe(true);
    expect(features.multiSlotBooking).toBe(true);
  });

  it("exposes contact-first listing flag when enabled", async () => {
    process.env.ENABLE_CONTACT_FIRST_LISTINGS = "true";

    const { features } = await import("@/lib/env");

    expect(features.contactFirstListings).toBe(true);
  });

  it("keeps private feedback disabled by default and exposes the flag when enabled", async () => {
    let envModule = await import("@/lib/env");
    expect(envModule.features.privateFeedback).toBe(false);

    jest.resetModules();
    process.env = {
      ...baseEnv,
      ENABLE_PRIVATE_FEEDBACK: "true",
    } as unknown as NodeJS.ProcessEnv;

    envModule = await import("@/lib/env");
    expect(envModule.features.privateFeedback).toBe(true);
  });

  it("disables keyset pagination when CURSOR_SECRET is invalid", async () => {
    process.env.CURSOR_SECRET = "short";

    const { features } = await import("@/lib/env");

    expect(features.searchKeyset).toBe(false);
  });
});
