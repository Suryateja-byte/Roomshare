/**
 * Tests for validateCronAuth utility
 * Validates Bearer token verification, secret configuration checks,
 * and timing-safe comparison behavior.
 */

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  },
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body: data,
    }),
  },
}));

const VALID_SECRET = "a".repeat(32); // exactly 32 chars, no placeholder

describe("validateCronAuth", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: VALID_SECRET };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function makeRequest(authHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (authHeader !== undefined) {
      headers["authorization"] = authHeader;
    }
    return new Request("https://example.com/api/cron/test", { headers });
  }

  it("returns null (success) when a valid Bearer token is provided", async () => {
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest(`Bearer ${VALID_SECRET}`);
    const result = validateCronAuth(request);
    expect(result).toBeNull();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest(); // no auth header
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });

  it("returns 401 when the token does not match the secret", async () => {
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest(
      "Bearer wrong-secret-value-that-is-long-enough"
    );
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest(`Bearer ${VALID_SECRET}`);
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });

  it("returns 500 when CRON_SECRET is shorter than 32 characters", async () => {
    process.env.CRON_SECRET = "tooshort";
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest("Bearer tooshort");
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });

  it("returns 500 when CRON_SECRET contains a placeholder value", async () => {
    process.env.CRON_SECRET = "generate-me-a-proper-secret-here";
    const { validateCronAuth } = await import("@/lib/cron-auth");
    const request = makeRequest(`Bearer generate-me-a-proper-secret-here`);
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });

  it("uses timing-safe comparison (wrong length token returns 401, not 500)", async () => {
    const { validateCronAuth } = await import("@/lib/cron-auth");
    // A token of a different length than `Bearer ${VALID_SECRET}` should return 401,
    // not cause an error — the length check must happen before timingSafeEqual.
    const shortToken = "Bearer short";
    const request = makeRequest(shortToken);
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });

  it('returns 401 when the raw secret is provided without the "Bearer " prefix', async () => {
    const { validateCronAuth } = await import("@/lib/cron-auth");
    // Providing the raw secret without the prefix should fail
    const request = makeRequest(VALID_SECRET);
    const result = validateCronAuth(request) as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });
});
