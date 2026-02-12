/**
 * Unit tests for Turnstile server-side verification
 */

// Mock logger before importing module under test
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  },
}));

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  // Reset env to known state
  delete process.env.TURNSTILE_ENABLED;
  delete process.env.TURNSTILE_SECRET_KEY;
  global.fetch = jest.fn();
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

function enableTurnstile() {
  process.env.TURNSTILE_ENABLED = "true";
  process.env.TURNSTILE_SECRET_KEY = "test-secret-key";
}

async function importModule() {
  return import("@/lib/turnstile");
}

describe("isTurnstileEnabled", () => {
  it("returns false when TURNSTILE_ENABLED is not set", async () => {
    const { isTurnstileEnabled } = await importModule();
    expect(isTurnstileEnabled()).toBe(false);
  });

  it("returns false when TURNSTILE_ENABLED=false", async () => {
    process.env.TURNSTILE_ENABLED = "false";
    process.env.TURNSTILE_SECRET_KEY = "some-key";
    const { isTurnstileEnabled } = await importModule();
    expect(isTurnstileEnabled()).toBe(false);
  });

  it("returns false when secret key is missing", async () => {
    process.env.TURNSTILE_ENABLED = "true";
    const { isTurnstileEnabled } = await importModule();
    expect(isTurnstileEnabled()).toBe(false);
  });

  it("returns true when enabled and secret key present", async () => {
    enableTurnstile();
    const { isTurnstileEnabled } = await importModule();
    expect(isTurnstileEnabled()).toBe(true);
  });
});

describe("verifyTurnstileToken", () => {
  it("bypasses verification when Turnstile is disabled (kill switch)", async () => {
    // Do NOT call enableTurnstile()
    const { verifyTurnstileToken } = await importModule();
    const result = await verifyTurnstileToken("any-token");
    expect(result).toEqual({ success: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects missing token", async () => {
    enableTurnstile();
    const { verifyTurnstileToken } = await importModule();

    const result = await verifyTurnstileToken(undefined);
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain("missing-input-response");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects null token", async () => {
    enableTurnstile();
    const { verifyTurnstileToken } = await importModule();

    const result = await verifyTurnstileToken(null);
    expect(result.success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns success for valid token", async () => {
    enableTurnstile();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, "error-codes": [] }),
    });

    const { verifyTurnstileToken } = await importModule();
    const result = await verifyTurnstileToken("valid-token");

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Verify POST body contains correct params
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(options.method).toBe("POST");
    const body = options.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret-key");
    expect(body.get("response")).toBe("valid-token");
  });

  it("returns failure for invalid token", async () => {
    enableTurnstile();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });

    const { verifyTurnstileToken } = await importModule();
    const result = await verifyTurnstileToken("bad-token");

    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain("invalid-input-response");
  });

  it("fails closed on network error", async () => {
    enableTurnstile();
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network failure"));

    const { verifyTurnstileToken } = await importModule();
    const result = await verifyTurnstileToken("some-token");

    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain("network-error");
  });

  it("fails closed on HTTP error status", async () => {
    enableTurnstile();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { verifyTurnstileToken } = await importModule();
    const result = await verifyTurnstileToken("some-token");

    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain("http-error");
  });

  it("includes remoteip when provided", async () => {
    enableTurnstile();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { verifyTurnstileToken } = await importModule();
    await verifyTurnstileToken("token", "1.2.3.4");

    const body = (global.fetch as jest.Mock).mock.calls[0][1]
      .body as URLSearchParams;
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });
});
