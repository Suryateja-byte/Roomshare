/**
 * Regression tests: env module import safety and validation behavior
 *
 * These tests ensure:
 * 1. Importing @/lib/env or modules that depend on it does NOT trigger console.error
 * 2. getServerEnv() still validates when explicitly called (validation not skipped)
 */

describe("Environment module import safety", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("does not log console.error when importing @/lib/env", async () => {
    await import("@/lib/env");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not log console.error when importing @/lib/data", async () => {
    await import("@/lib/data");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("getServerEnv() validation behavior", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("validates on explicit call (logs error/warn or throws)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Remove a required var to guarantee validation detects an issue
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    let threw = false;
    try {
      const { getServerEnv } = await import("@/lib/env");
      getServerEnv(); // Explicitly call to trigger validation
    } catch {
      threw = true;
    } finally {
      if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    }

    // Validation must happen: console.error (production) or console.warn (dev) or exception
    const validated = errorSpy.mock.calls.length > 0 || warnSpy.mock.calls.length > 0 || threw;
    expect(validated).toBe(true);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
