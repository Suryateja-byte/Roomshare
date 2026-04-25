/**
 * Tests for POST /api/reports route
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v));
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: headersMap,
      };
    },
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    report: { findFirst: jest.fn(), create: jest.fn() },
    conversation: { findFirst: jest.fn() },
  },
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));
jest.mock("@/lib/env", () => ({
  features: { privateFeedback: false },
}));
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn().mockReturnValue(null),
}));
jest.mock("@/lib/reports/private-feedback-telemetry", () => ({
  recordPrivateFeedbackDenied: jest.fn(),
  recordPrivateFeedbackSubmission: jest.fn(),
}));
jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn().mockImplementation(() => {
    const { NextResponse } = require("next/server");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }),
}));

import { POST } from "@/app/api/reports/route";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { withRateLimit } from "@/lib/with-rate-limit";

function createRequest(body?: object, url = "http://localhost/api/reports") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      emailVerified: new Date("2026-04-01T12:00:00.000Z"),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "other-user",
    });
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const res = await POST(createRequest({ listingId: "l1", reason: "spam" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 for Zod failure: empty reason", async () => {
    const res = await POST(createRequest({ listingId: "l1", reason: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for Zod failure: missing listingId", async () => {
    const res = await POST(createRequest({ reason: "spam" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 404 when listing not found", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(createRequest({ listingId: "l1", reason: "spam" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Listing not found");
  });

  it("returns 400 for self-reporting own listing", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "user-123",
    });
    const res = await POST(createRequest({ listingId: "l1", reason: "spam" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("You cannot report your own listing");
  });

  it("returns 409 for duplicate OPEN report", async () => {
    (prisma.report.findFirst as jest.Mock).mockResolvedValue({
      id: "existing",
      status: "OPEN",
    });
    const res = await POST(createRequest({ listingId: "l1", reason: "spam" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already reported");
  });

  it("allows re-report when previous was DISMISSED", async () => {
    // When previous report was DISMISSED, findFirst (which filters for OPEN/RESOLVED) returns null
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.create as jest.Mock).mockResolvedValue({
      id: "new-report",
      reason: "spam",
    });
    const res = await POST(
      createRequest({
        listingId: "l1",
        reason: "spam",
        details: "Fake listing",
      })
    );
    expect(res.status).toBe(200);
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        listingId: "l1",
        reporterId: "user-123",
        reason: "spam",
        details: "Fake listing",
        kind: "ABUSE_REPORT",
      },
    });
  });

  it("creates report successfully", async () => {
    (prisma.report.create as jest.Mock).mockResolvedValue({ id: "report-1" });
    const res = await POST(
      createRequest({
        listingId: "l1",
        reason: "spam",
        details: "Details here",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("report-1");
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        listingId: "l1",
        reporterId: "user-123",
        reason: "spam",
        details: "Details here",
        kind: "ABUSE_REPORT",
      },
    });
  });

  it("returns rate limit response when rate limited", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Rate limited" }, { status: 429 })
    );
    const res = await POST(createRequest({ listingId: "l1", reason: "spam" }));
    expect(res.status).toBe(429);
    // Rate limiting happens before auth check
    expect(auth).not.toHaveBeenCalled();
  });
});
