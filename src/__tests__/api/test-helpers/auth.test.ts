jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
    }),
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

jest.mock("@/lib/search/normalize-address", () => ({
  normalizeAddress: jest.fn(() => "normalized-address"),
}));

import { DELETE, GET, POST } from "@/app/api/test-helpers/route";

function request(input: {
  authorization?: string;
  body?: unknown;
}): Parameters<typeof POST>[0] {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization"
          ? input.authorization ?? null
          : null,
    },
    json: jest.fn().mockResolvedValue(input.body ?? {}),
  } as unknown as Parameters<typeof POST>[0];
}

describe("test-helpers route auth gate", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      E2E_TEST_HELPERS: "true",
      E2E_TEST_SECRET: "ci-e2e-test-secret-minimum-16-chars",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ["GET", GET],
    ["DELETE", DELETE],
  ] as const)("rejects %s because helpers are POST-only", async (_method, handler) => {
    const response = await handler();

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: "Method not allowed",
    });
  });

  it("returns 404 when the helper gate is disabled", async () => {
    process.env.E2E_TEST_HELPERS = "false";

    const response = await POST(
      request({ authorization: "Bearer ci-e2e-test-secret-minimum-16-chars" })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns 404 when the bearer secret is invalid", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns 410 for retired booking helper actions", async () => {
    const response = await POST(
      request({
        authorization: "Bearer ci-e2e-test-secret-minimum-16-chars",
        body: { action: "createPendingBooking", params: {} },
      })
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Legacy booking test helper retired in Phase 09",
    });
  });
});
