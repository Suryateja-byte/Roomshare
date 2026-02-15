/**
 * Tests: Turnstile env vars are required in production
 *
 * Uses process.env replacement to isolate from jest.env.js / .env file leaks.
 */
describe("Turnstile production enforcement", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Replace process.env entirely to avoid leaks from jest.env.js / .env files
    process.env = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://prod:prod@localhost:5432/prod",
      NEXTAUTH_SECRET: "a".repeat(32),
      NEXTAUTH_URL: "https://roomshare.app",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      CRON_SECRET: "b".repeat(32),
    } as unknown as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects when TURNSTILE_SECRET_KEY is missing in production", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    // TURNSTILE_SECRET_KEY deliberately absent
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow();
  });

  it("rejects when TURNSTILE_ENABLED is not 'true' in production", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    // TURNSTILE_ENABLED deliberately absent
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow();
  });

  it("succeeds when both Turnstile vars are set in production", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });
});
