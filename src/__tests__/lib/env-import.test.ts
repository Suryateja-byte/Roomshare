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

  it("validates on explicit call (logs error or throws)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let threw = false;

    try {
      const { getServerEnv } = await import("@/lib/env");
      getServerEnv(); // Explicitly call to trigger validation
    } catch {
      threw = true;
    }

    // Validation must happen: either console.error was called or an exception was thrown
    const validated = errorSpy.mock.calls.length > 0 || threw;
    expect(validated).toBe(true);

    errorSpy.mockRestore();
  });
});
