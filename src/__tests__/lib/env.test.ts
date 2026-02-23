describe("getCursorSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache so _cursorSecretDevWarned is fresh
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the secret when CURSOR_SECRET is set", () => {
    process.env.CURSOR_SECRET = "test-secret-value";
    const { getCursorSecret: fn } = require("@/lib/env");
    expect(fn()).toBe("test-secret-value");
  });

  it("throws on EVERY call in production when CURSOR_SECRET is missing", () => {
    delete process.env.CURSOR_SECRET;
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    const { getCursorSecret: fn } = require("@/lib/env");

    // First call should throw
    expect(() => fn()).toThrow("[SECURITY] CURSOR_SECRET is required in production");

    // Second call should ALSO throw (no silent degradation)
    expect(() => fn()).toThrow("[SECURITY] CURSOR_SECRET is required in production");
  });

  it("returns empty string in development when CURSOR_SECRET is missing", () => {
    delete process.env.CURSOR_SECRET;
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    const { getCursorSecret: fn } = require("@/lib/env");
    expect(fn()).toBe("");
  });
});
