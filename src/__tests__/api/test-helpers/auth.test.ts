/**
 * Tests for POST /api/test-helpers — Bearer token auth gate.
 *
 * Verifies that the test-helpers route requires a valid Bearer token
 * matching E2E_TEST_SECRET, using timing-safe comparison.
 * Unauthorized requests return 404 (stealth denial).
 */

// --- Mocks (must be before imports) ---

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
  },
}));

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
    }),
  },
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Use a secret that is >= 16 characters
const TEST_SECRET = "test-e2e-secret-value-1234";

function makeRequest(
  action: string,
  params: Record<string, unknown> = {},
  authHeader?: string
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authHeader) {
    headers["authorization"] = authHeader;
  }
  return new NextRequest("http://localhost:3000/api/test-helpers", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, params }),
  });
}

describe("test-helpers auth", () => {
  const originalEnv = process.env;
  let POST: (request: NextRequest) => Promise<any>;

  beforeAll(async () => {
    const mod = await import("@/app/api/test-helpers/route");
    POST = mod.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      E2E_TEST_HELPERS: "true",
      NODE_ENV: "test",
      E2E_TEST_SECRET: TEST_SECRET,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 404 when no Authorization header is provided", async () => {
    const request = makeRequest("getListingSlots", { listingId: "test-id" });
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when Authorization header has wrong token", async () => {
    const request = makeRequest(
      "getListingSlots",
      { listingId: "test-id" },
      "Bearer wrong-token-value-here"
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });

  it("returns success when Authorization header has correct token", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      id: "test-id",
      totalSlots: 5,
      availableSlots: 3,
      bookingMode: "SHARED",
      title: "Test Listing",
      ownerId: "owner-1",
    });

    const request = makeRequest(
      "getListingSlots",
      { listingId: "test-id" },
      `Bearer ${TEST_SECRET}`
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("test-id");
  });

  it("returns 404 when E2E_TEST_SECRET env var is not set", async () => {
    delete process.env.E2E_TEST_SECRET;

    const request = makeRequest(
      "getListingSlots",
      { listingId: "test-id" },
      `Bearer ${TEST_SECRET}`
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when E2E_TEST_SECRET is too short (< 16 chars)", async () => {
    process.env.E2E_TEST_SECRET = "short";

    const request = makeRequest(
      "getListingSlots",
      { listingId: "test-id" },
      "Bearer short"
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when token length mismatches secret length", async () => {
    const request = makeRequest(
      "getListingSlots",
      { listingId: "test-id" },
      "Bearer different-length"
    );
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Not found");
  });
});
