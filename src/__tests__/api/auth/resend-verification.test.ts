/**
 * Tests for resend verification email API route
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(() => null),
}));

jest.mock("@/lib/verification-token-store", () => ({
  clearPendingVerificationToken: jest.fn(),
  prepareVerificationTokenRotation: jest.fn(),
  promotePendingVerificationToken: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { POST } from "@/app/api/auth/resend-verification/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import {
  clearPendingVerificationToken,
  prepareVerificationTokenRotation,
  promotePendingVerificationToken,
} from "@/lib/verification-token-store";
import type { NextRequest } from "next/server";

describe("Resend Verification API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prepareVerificationTokenRotation as jest.Mock).mockResolvedValue({
      status: "prepared",
      token: "prepared-token",
      tokenHash: "prepared-token-hash",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    (promotePendingVerificationToken as jest.Mock).mockResolvedValue(true);
    (clearPendingVerificationToken as jest.Mock).mockResolvedValue(true);
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });
  });

  const createRequest = () =>
    new Request("http://localhost:3000/api/auth/resend-verification", {
      method: "POST",
    }) as unknown as NextRequest;

  it("sends verification email for authenticated user with unverified email", async () => {
    const mockSession = { user: { email: "test@example.com" } };
    const mockUser = {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: null,
    };

    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("Verification email sent successfully");
    expect(prepareVerificationTokenRotation).toHaveBeenCalledWith(
      "test@example.com"
    );
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "emailVerification",
      "test@example.com",
      expect.objectContaining({
        userName: "Test User",
        verificationUrl: expect.stringContaining(
          "/verify-email?token=prepared-token"
        ),
      })
    );
    expect(promotePendingVerificationToken).toHaveBeenCalledWith(
      "test@example.com",
      "prepared-token-hash"
    );
  });

  it("returns 409 when another resend is already in flight", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      email: "test@example.com",
      emailVerified: null,
    });
    (prepareVerificationTokenRotation as jest.Mock).mockResolvedValue({
      status: "conflict",
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already being prepared");
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(promotePendingVerificationToken).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(
      "You must be logged in to resend verification email"
    );
  });

  it("returns 401 when session has no email", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: {} });

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe(
      "You must be logged in to resend verification email"
    );
  });

  it("returns 404 when user not found in database", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("User not found");
  });

  it("returns 400 when email is already verified", async () => {
    const mockSession = { user: { email: "test@example.com" } };
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      emailVerified: new Date(),
    };

    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Email is already verified");
  });

  it("uses default user name when user has no name", async () => {
    const mockSession = { user: { email: "test@example.com" } };
    const mockUser = {
      id: "user-123",
      name: null,
      email: "test@example.com",
      emailVerified: null,
    };

    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const request = createRequest();
    await POST(request);

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "emailVerification",
      "test@example.com",
      expect.objectContaining({
        userName: "User",
      })
    );
  });

  it("applies rate limiting", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      email: "test@example.com",
      emailVerified: null,
    });

    const request = createRequest();
    await POST(request);

    expect(withRateLimit).toHaveBeenCalledWith(request, {
      type: "resendVerification",
    });
  });

  it("returns rate limit response when limited", async () => {
    const mockRateLimitResponse = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
    };
    (withRateLimit as jest.Mock).mockResolvedValue(mockRateLimitResponse);

    const request = createRequest();
    const response = await POST(request);

    expect(response).toBe(mockRateLimitResponse);
    expect(auth).not.toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    const mockSession = { user: { email: "test@example.com" } };

    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB Error")
    );

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to send verification email");
  });

  it("clears pending token and returns 503 when email sending fails", async () => {
    const mockSession = { user: { email: "test@example.com" } };
    const mockUser = {
      id: "user-123",
      name: "Test",
      email: "test@example.com",
      emailVerified: null,
    };

    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (sendNotificationEmail as jest.Mock).mockResolvedValue({
      success: false,
      error: "Email Error",
    });

    const request = createRequest();
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Email service temporarily unavailable");
    expect(clearPendingVerificationToken).toHaveBeenCalledWith(
      "test@example.com",
      "prepared-token-hash"
    );
    expect(promotePendingVerificationToken).not.toHaveBeenCalled();
  });

  it("returns success even if promotion fails after email send", async () => {
    const mockSession = { user: { email: "test@example.com" } };
    const mockUser = {
      id: "user-123",
      name: "Test",
      email: "test@example.com",
      emailVerified: null,
    };

    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (promotePendingVerificationToken as jest.Mock).mockRejectedValue(
      new Error("promotion failed")
    );

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("Verification email sent successfully");
  });
});
