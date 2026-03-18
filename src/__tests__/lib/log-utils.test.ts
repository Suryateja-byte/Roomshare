describe("logSafeId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 16-char hex string when LOG_HMAC_SECRET is set", async () => {
    process.env.LOG_HMAC_SECRET = "test-secret-at-least-32-characters-long";
    const { logSafeId } = await import("@/lib/log-utils");
    const result = logSafeId("user-abc-123");
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic (same input produces same output)", async () => {
    process.env.LOG_HMAC_SECRET = "test-secret-at-least-32-characters-long";
    const { logSafeId } = await import("@/lib/log-utils");
    expect(logSafeId("id-1")).toBe(logSafeId("id-1"));
  });

  it("produces different output for different inputs", async () => {
    process.env.LOG_HMAC_SECRET = "test-secret-at-least-32-characters-long";
    const { logSafeId } = await import("@/lib/log-utils");
    expect(logSafeId("id-1")).not.toBe(logSafeId("id-2"));
  });

  it("returns dev- prefix when LOG_HMAC_SECRET is not set", async () => {
    delete process.env.LOG_HMAC_SECRET;
    const { logSafeId } = await import("@/lib/log-utils");
    const result = logSafeId("user-abc-123");
    expect(result).toBe("dev-user-abc");
  });

  it("output does not contain original ID when secret is set", async () => {
    process.env.LOG_HMAC_SECRET = "test-secret-at-least-32-characters-long";
    const { logSafeId } = await import("@/lib/log-utils");
    const originalId = "sensitive-user-id-12345";
    const result = logSafeId(originalId);
    expect(result).not.toContain("sensitive");
    expect(result).not.toContain(originalId);
  });
});
