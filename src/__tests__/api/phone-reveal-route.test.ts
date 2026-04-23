/**
 * @jest-environment node
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headers.set(key, value);
        }
      }
      return {
        status: init?.status ?? 200,
        json: async () => data,
        headers: {
          get: (key: string) => headers.get(key),
          set: (key: string, value: string) => headers.set(key, value),
        },
      };
    },
  },
}));

const mockAuth = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetClientIPFromHeaders = jest.fn();
const mockRevealHostPhoneForListing = jest.fn();

jest.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIPFromHeaders: (...args: unknown[]) =>
    mockGetClientIPFromHeaders(...args),
  RATE_LIMITS: {
    phoneReveal: { limit: 10, windowMs: 60 * 60 * 1000 },
  },
}));

jest.mock("@/lib/contact/phone-reveal", () => ({
  revealHostPhoneForListing: (...args: unknown[]) =>
    mockRevealHostPhoneForListing(...args),
}));

import { POST } from "@/app/api/phone-reveal/route";

describe("POST /api/phone-reveal", () => {
  const request = (body: unknown) =>
    new Request("http://localhost/api/phone-reveal", {
      method: "POST",
      headers: { "x-real-ip": "127.0.0.1" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "renter-1" } });
    mockGetClientIPFromHeaders.mockReturnValue("127.0.0.1");
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockRevealHostPhoneForListing.mockResolvedValue({
      ok: true,
      phoneNumber: "+15551234567",
      phoneLast4: "4567",
    });
  });

  it("requires authentication", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await POST(request({ listingId: "listing-1" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "Unauthorized",
      code: "SESSION_EXPIRED",
    });
  });

  it("fails closed when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(request({ listingId: "listing-1" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toEqual({
      error: "Phone reveal is unavailable right now.",
      code: "RATE_LIMITED",
    });
    expect(mockRevealHostPhoneForListing).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(request({ listingId: "" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "Invalid phone reveal payload",
      code: "INVALID_PAYLOAD",
    });
  });

  it("returns revealed phone data without caching", async () => {
    const response = await POST(
      request({
        listingId: "listing-1",
        clientIdempotencyKey: "reveal-idem-1",
        unitIdentityEpochObserved: 1,
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      phoneNumber: "+15551234567",
      phoneLast4: "4567",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockRevealHostPhoneForListing).toHaveBeenCalledWith({
      viewerUserId: "renter-1",
      listingId: "listing-1",
      clientIdempotencyKey: "reveal-idem-1",
      unitIdentityEpochObserved: 1,
    });
  });

  it("passes through neutral reveal failures", async () => {
    mockRevealHostPhoneForListing.mockResolvedValueOnce({
      ok: false,
      status: 423,
      code: "HOST_NOT_ACCEPTING_CONTACT",
      error: "This host is not accepting contact right now.",
    });

    const response = await POST(request({ listingId: "listing-1" }) as never);
    const payload = await response.json();

    expect(response.status).toBe(423);
    expect(payload).toEqual({
      error: "This host is not accepting contact right now.",
      code: "HOST_NOT_ACCEPTING_CONTACT",
    });
  });
});
