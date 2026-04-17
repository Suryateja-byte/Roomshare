/**
 * Edge-case tests for POST /api/reports route
 * Covers scenarios NOT in the existing reports.test.ts
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

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

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((_error: unknown, _context: unknown) => ({
    status: 500,
    json: async () => ({ error: "Internal server error" }),
    headers: new Map(),
  })),
}));

import { POST } from "@/app/api/reports/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

describe("POST /api/reports — edge cases", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: new Date("2026-04-01T12:00:00.000Z"),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "other-owner",
    });
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.create as jest.Mock).mockResolvedValue({
      id: "report-new",
      listingId: "listing-123",
      reporterId: "user-123",
      reason: "Spam",
    });
  });

  it("returns 409 when an OPEN report already exists for the same listing", async () => {
    (prisma.report.findFirst as jest.Mock).mockResolvedValue({
      id: "report-existing",
      status: "OPEN",
    });

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({ listingId: "listing-123", reason: "Spam" }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already reported");
  });

  it("returns 409 when a RESOLVED report already exists for the same listing", async () => {
    (prisma.report.findFirst as jest.Mock).mockResolvedValue({
      id: "report-resolved",
      status: "RESOLVED",
    });

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({ listingId: "listing-123", reason: "Spam" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
  });

  it("allows re-report when previous report was DISMISSED (findFirst returns null)", async () => {
    // The route queries for status IN [OPEN, RESOLVED]; DISMISSED is excluded
    // so findFirst correctly returns null when only a DISMISSED report exists
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({ listingId: "listing-123", reason: "Spam" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(prisma.report.create).toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: "{ this is not valid json",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON");
  });

  it("returns 400 when details exceeds 2000 characters", async () => {
    const longDetails = "a".repeat(2001);

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({
        listingId: "listing-123",
        reason: "Spam",
        details: longDetails,
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when reason exceeds 100 characters", async () => {
    const longReason = "a".repeat(101);

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({
        listingId: "listing-123",
        reason: longReason,
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("does not leak internal error messages in error responses", async () => {
    (prisma.report.create as jest.Mock).mockRejectedValue(
      new Error("SELECT * FROM report — syntax error near 'FROM'")
    );

    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify({ listingId: "listing-123", reason: "Spam" }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(data)).not.toContain("SELECT");
    expect(JSON.stringify(data)).not.toContain("syntax error");
  });
});
