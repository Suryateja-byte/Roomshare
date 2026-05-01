/**
 * Tests for forgot password API route
 */

const mockAfterCallbacks: Array<() => void | Promise<void>> = [];
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn(() => null),
}));

jest.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock("@/lib/normalize-email", () => ({
  normalizeEmail: jest.fn((email: string) => email.toLowerCase()),
}));

jest.mock("@/lib/token-security", () => ({
  createTokenPair: jest.fn(() => ({
    token: "test-plain-token",
    tokenHash: "test-hash-token",
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("next/server", () => ({
  after: jest.fn((callback: () => void | Promise<void>) => {
    mockAfterCallbacks.push(callback);
  }),
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Headers(),
    }),
  },
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { after as nextAfter } from "next/server";
import type { NextRequest } from "next/server";

const mockAfter = nextAfter as jest.MockedFunction<typeof nextAfter>;

describe("Forgot Password API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockAfterCallbacks.length = 0;
  });

  const createRequest = (body: object) =>
    new Request("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ turnstileToken: "test-token", ...body }),
    }) as unknown as NextRequest;

  it("schedules reset email for existing user after returning success", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account with that email exists");
    expect(withRateLimit).toHaveBeenNthCalledWith(1, request, {
      type: "forgotPasswordByIp",
      endpoint: "forgotPasswordByIp",
    });

    expect(verifyTurnstileToken).toHaveBeenCalledWith("test-token");
    expect(withRateLimit).toHaveBeenCalledTimes(2);
    const emailRateLimitOptions = (withRateLimit as jest.Mock).mock.calls[1][1];
    expect(emailRateLimitOptions).toEqual(
      expect.objectContaining({
        type: "forgotPassword",
        endpoint: "forgotPasswordByEmail",
        getIdentifier: expect.any(Function),
      })
    );
    expect(emailRateLimitOptions.getIdentifier(request)).toBe("test@example.com");

    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).not.toHaveBeenCalled();

    await mockAfterCallbacks[0]?.();

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "passwordReset",
      "test@example.com",
      expect.objectContaining({
        userName: "Test User",
        resetLink: expect.stringContaining("token="),
      })
    );
  });

  it("returns same message for non-existent user (prevents enumeration)", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createRequest({ email: "nonexistent@example.com" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account with that email exists");
    expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("enforces a 1000ms minimum duration for nonexistent users", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createRequest({ email: "nonexistent@example.com" });
    const responsePromise = POST(request);
    let settled = false;
    void responsePromise.then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const response = await responsePromise;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account with that email exists");
  });

  it("returns error for missing email", async () => {
    const request = createRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid input");
  });

  it("normalizes email to lowercase", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test",
      email: "test@example.com",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "TEST@EXAMPLE.COM" });
    await POST(request);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: { email: "test@example.com" },
    });
  });

  it("deletes existing tokens before creating new one", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test",
      email: "test@example.com",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    await POST(request);

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
  });

  it("creates token with 1 hour expiration", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test",
      email: "test@example.com",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    await POST(request);

    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "test@example.com",
        tokenHash: expect.any(String),
        expires: expect.any(Date),
      }),
    });

    const createCall = (prisma.passwordResetToken.create as jest.Mock).mock
      .calls[0][0];
    const expires = createCall.data.expires;
    const now = Date.now();
    const oneHourFromNow = now + 60 * 60 * 1000;

    expect(expires.getTime()).toBeGreaterThan(now);
    expect(expires.getTime()).toBeLessThanOrEqual(oneHourFromNow + 1000);
  });

  it("handles database errors gracefully", async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB Error")
    );

    const request = createRequest({ email: "test@example.com" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("An error occurred. Please try again.");
  });

  it("applies both IP and email-scoped rate limiting", async () => {
    const request = createRequest({ email: "test@example.com" });
    await POST(request);

    expect(withRateLimit).toHaveBeenNthCalledWith(1, request, {
      type: "forgotPasswordByIp",
      endpoint: "forgotPasswordByIp",
    });

    expect(withRateLimit).toHaveBeenCalledTimes(2);
    const emailRateLimitOptions = (withRateLimit as jest.Mock).mock.calls[1][1];
    expect(emailRateLimitOptions).toEqual(
      expect.objectContaining({
        type: "forgotPassword",
        endpoint: "forgotPasswordByEmail",
        getIdentifier: expect.any(Function),
      })
    );
  });

  it("does not consume the email-scoped limiter when Turnstile fails", async () => {
    (verifyTurnstileToken as jest.Mock).mockResolvedValueOnce({ success: false });

    const request = createRequest({ email: "test@example.com" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Bot verification failed. Please try again.");
    expect(withRateLimit).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("returns rate limit response when limited", async () => {
    const mockRateLimitResponse = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
    };
    (withRateLimit as jest.Mock).mockResolvedValue(mockRateLimitResponse);

    const request = createRequest({ email: "test@example.com" });
    const response = await POST(request);

    expect(response).toBe(mockRateLimitResponse);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("short-circuits before DB lookup when email rate limited after Turnstile succeeds", async () => {
    const mockRateLimitResponse = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
    };
    (withRateLimit as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockRateLimitResponse);

    const request = createRequest({ email: "test@example.com" });
    const response = await POST(request);

    expect(response).toBe(mockRateLimitResponse);
    expect(verifyTurnstileToken).toHaveBeenCalledWith("test-token");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });
});
