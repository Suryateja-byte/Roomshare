/**
 * Tests for POST /api/reports
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([key, value]) =>
          headersMap.set(key, value)
        );
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
    report: { create: jest.fn(), findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/env", () => ({
  features: {
    privateFeedback: false,
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn().mockImplementation(() => {
    const { NextResponse } = require("next/server");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }),
}));

jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/reports/private-feedback-telemetry", () => ({
  recordPrivateFeedbackDenied: jest.fn(),
  recordPrivateFeedbackSubmission: jest.fn(),
}));

import { POST } from "@/app/api/reports/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { features } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import {
  recordPrivateFeedbackDenied,
  recordPrivateFeedbackSubmission,
} from "@/lib/reports/private-feedback-telemetry";
import {
  PRIVATE_FEEDBACK_DISABLED_CODE,
  PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH,
} from "@/lib/reports/private-feedback";

function createRequest(body?: object) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockedFeatures = features as { privateFeedback: boolean };

describe("POST /api/reports", () => {
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
    mockedFeatures.privateFeedback = false;
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "owner-456",
    });
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: "conversation-1",
    });
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.create as jest.Mock).mockResolvedValue({ id: "report-1" });
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      createRequest({ listingId: "listing-1", reason: "spam" })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("keeps the abuse-report path working while private feedback is disabled", async () => {
    const response = await POST(
      createRequest({
        listingId: "listing-1",
        reason: "spam",
        details: "Existing abuse report path",
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        reporterId: "user-123",
        reason: "spam",
        details: "Existing abuse report path",
        kind: "ABUSE_REPORT",
      },
    });
  });

  it("rejects suspended users on the abuse-report path before report writes", async () => {
    (checkSuspension as jest.Mock).mockResolvedValue({
      suspended: true,
      error: "Account suspended",
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        reason: "spam",
        details: "Existing abuse report path",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Account suspended",
      code: "ACCOUNT_SUSPENDED",
    });
    expect(prisma.listing.findUnique).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it("blocks reporting your own listing on the existing abuse-report path", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "user-123",
    });

    const response = await POST(
      createRequest({ listingId: "listing-1", reason: "spam" })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("You cannot report your own listing");
  });

  it("returns 403 with a feature-disabled code when private feedback is off", async () => {
    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe(PRIVATE_FEEDBACK_DISABLED_CODE);
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "feature_disabled",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "owner-456",
    });
  });

  it("validates the private-feedback category, target, and body", async () => {
    mockedFeatures.privateFeedback = true;

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        kind: "PRIVATE_FEEDBACK",
        reason: "not-allowed",
        details: "",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request");
    expect(body.details.reason).toEqual(["Invalid private feedback category"]);
    expect(body.details.details).toEqual(["details is required"]);
    expect(body.details.targetUserId).toEqual(["targetUserId is required"]);
  });

  it("rejects suspended users on the private-feedback path", async () => {
    mockedFeatures.privateFeedback = true;
    (checkSuspension as jest.Mock).mockResolvedValue({
      suspended: true,
      error: "Account suspended",
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Account suspended",
      code: "ACCOUNT_SUSPENDED",
    });
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "suspended",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "owner-456",
    });
  });

  it("rejects unverified users on the private-feedback path", async () => {
    mockedFeatures.privateFeedback = true;
    (auth as jest.Mock).mockResolvedValue({
      user: { ...mockSession.user, emailVerified: null },
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Email verification required");
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "unverified_email",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "owner-456",
    });
  });

  it("rejects feedback when the user has no reporter-authored message", async () => {
    mockedFeatures.privateFeedback = true;
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("after contacting this host");
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        listingId: "listing-1",
        AND: [
          { participants: { some: { id: "user-123" } } },
          { participants: { some: { id: "owner-456" } } },
        ],
        messages: { some: { senderId: "user-123" } },
      },
      select: { id: true },
    });
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "no_prior_conversation",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "owner-456",
    });
  });

  it("rejects self-targeted private feedback", async () => {
    mockedFeatures.privateFeedback = true;

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "user-123",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("You cannot submit feedback about yourself");
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "self_target",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "user-123",
    });
  });

  it("rejects targets that do not match the listing owner", async () => {
    mockedFeatures.privateFeedback = true;

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "not-the-owner",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Private feedback can only target the listing owner");
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "invalid_target",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "not-the-owner",
    });
  });

  it("scopes duplicate prevention by report kind", async () => {
    mockedFeatures.privateFeedback = true;
    (prisma.report.findFirst as jest.Mock).mockResolvedValue({
      id: "existing-private-feedback",
      status: "OPEN",
      kind: "PRIVATE_FEEDBACK",
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );

    expect(response.status).toBe(409);
    expect(prisma.report.findFirst).toHaveBeenCalledWith({
      where: {
        reporterId: "user-123",
        listingId: "listing-1",
        kind: "PRIVATE_FEEDBACK",
        status: { in: ["OPEN", "RESOLVED"] },
      },
    });
  });

  it("maps active-report unique constraint races to the duplicate response", async () => {
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: "Report_active_reporter_listing_kind_unique_idx" },
      })
    );

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        reason: "spam",
        details: "Race duplicate",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already reported/i);
  });

  it("creates a private feedback report when every gate passes", async () => {
    mockedFeatures.privateFeedback = true;
    (prisma.report.create as jest.Mock).mockResolvedValue({
      id: "private-feedback-1",
      kind: "PRIVATE_FEEDBACK",
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "pressure_tactics",
        details: "The host kept pressuring me to decide immediately.",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("private-feedback-1");
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        listingId: "listing-1",
        AND: [
          { participants: { some: { id: "user-123" } } },
          { participants: { some: { id: "owner-456" } } },
        ],
        messages: { some: { senderId: "user-123" } },
      },
      select: { id: true },
    });
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        reporterId: "user-123",
        reason: "pressure_tactics",
        details: "The host kept pressuring me to decide immediately.",
        kind: "PRIVATE_FEEDBACK",
        targetUserId: "owner-456",
      },
    });
    expect(recordPrivateFeedbackSubmission).toHaveBeenCalledWith({
      category: "pressure_tactics",
      listingId: "listing-1",
      reporterId: "user-123",
      targetUserId: "owner-456",
    });
  });

  it("records a rate-limit denial for private feedback using the existing bucket", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({
      status: 429,
      json: async () => ({ error: "Rate limited" }),
      headers: new Map(),
    });

    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "Private feedback body",
      })
    );

    expect(response.status).toBe(429);
    expect(recordPrivateFeedbackDenied).toHaveBeenCalledWith({
      reason: "rate_limit",
      listingId: "listing-1",
      targetUserId: "owner-456",
    });
  });

  it("keeps the private-feedback body length cap at 2000 characters", async () => {
    mockedFeatures.privateFeedback = true;
    const response = await POST(
      createRequest({
        listingId: "listing-1",
        targetUserId: "owner-456",
        kind: "PRIVATE_FEEDBACK",
        reason: "general_concern",
        details: "x".repeat(PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH + 1),
      })
    );

    expect(response.status).toBe(400);
  });
});
