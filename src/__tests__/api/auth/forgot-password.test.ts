/**
 * Tests for forgot password API route
 */

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

const mockAfter = jest.fn();

jest.mock("next/server", () => ({
  after: (task: unknown) => mockAfter(task),
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateCsrf } from "@/lib/csrf";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createTokenPair } from "@/lib/token-security";
import { logger } from "@/lib/logger";
import type { NextRequest } from "next/server";

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

async function resolveAcceptedPasswordReset<T>(promise: Promise<T>): Promise<T> {
  await flushMicrotasks();
  await jest.advanceTimersByTimeAsync(1000);
  return promise;
}

async function expectAcceptedTimingFloor(promise: Promise<unknown>) {
  let settled = false;
  promise.then(() => {
    settled = true;
  });

  await flushMicrotasks();
  expect(settled).toBe(false);

  await jest.advanceTimersByTimeAsync(999);
  await flushMicrotasks();
  expect(settled).toBe(false);

  await jest.advanceTimersByTimeAsync(1);
  await promise;
  expect(settled).toBe(true);
}

describe("Forgot Password API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    jest.clearAllMocks();
    jest.spyOn(Math, "random").mockReturnValue(0);
    process.env = { ...originalEnv };
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    (validateCsrf as jest.Mock).mockReturnValue(null);
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (verifyTurnstileToken as jest.Mock).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
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

  it("schedules reset email for existing user after accepted response", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test User",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    const response = await resolveAcceptedPasswordReset(POST(request));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account with that email exists");
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);

    const afterTask = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await afterTask();

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "passwordReset",
      "test@example.com",
      expect.objectContaining({
        userName: "Test User",
        resetLink: expect.stringContaining("token="),
      })
    );
  });

  it("logs background reset email failures without changing response", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      name: "Test User",
    });
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({
      success: false,
      error: "provider failed",
    });

    const response = await resolveAcceptedPasswordReset(
      POST(createRequest({ email: "test@example.com" }))
    );

    expect(response.status).toBe(200);
    const afterTask = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await afterTask();

    expect(logger.sync.error).toHaveBeenCalledWith(
      "Failed to send password reset email",
      {
        error: "provider failed",
        route: "/api/auth/forgot-password",
      }
    );
  });

  it("uses AUTH_URL before NEXTAUTH_URL for reset links", async () => {
    process.env.AUTH_URL = "https://auth.example.com";
    process.env.NEXTAUTH_URL = "https://nextauth.example.com";
    const mockUser = {
      id: "user-123",
      name: "Test User",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    await resolveAcceptedPasswordReset(POST(request));

    const afterTask = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await afterTask();

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "passwordReset",
      "test@example.com",
      expect.objectContaining({
        resetLink:
          "https://auth.example.com/reset-password?token=test-plain-token",
      })
    );
  });

  it("returns same message for non-existent user without side effects", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const request = createRequest({ email: "nonexistent@example.com" });
    const response = await resolveAcceptedPasswordReset(POST(request));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account with that email exists");
    expect(createTokenPair).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("keeps existing and non-existent valid requests pending until the same timing floor", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "user-123",
      name: "Test User",
    });
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});

    await expectAcceptedTimingFloor(
      POST(createRequest({ email: "test@example.com" }))
    );

    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expectAcceptedTimingFloor(
      POST(createRequest({ email: "missing@example.com" }))
    );
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
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "TEST@EXAMPLE.COM" });
    await resolveAcceptedPasswordReset(POST(request));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
      select: { id: true, name: true },
    });
  });

  it("deletes existing tokens before creating new one", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    await resolveAcceptedPasswordReset(POST(request));

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
  });

  it("creates token with 1 hour expiration", async () => {
    const mockUser = {
      id: "user-123",
      name: "Test",
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({});
    (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });

    const request = createRequest({ email: "test@example.com" });
    await resolveAcceptedPasswordReset(POST(request));

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

  it("applies rate limiting", async () => {
    const request = createRequest({ email: "test@example.com" });
    const promise = POST(request);
    await flushMicrotasks();

    expect(withRateLimit).toHaveBeenCalledWith(request, {
      type: "forgotPassword",
    });

    await jest.advanceTimersByTimeAsync(1000);
    await promise;
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

  it("does not delay CSRF, Turnstile, or production-unavailable failures", async () => {
    (validateCsrf as jest.Mock).mockReturnValueOnce({
      status: 403,
      json: async () => ({ error: "Invalid CSRF token" }),
      headers: new Map(),
    });
    const csrfResponse = await POST(createRequest({ email: "test@example.com" }));
    expect(csrfResponse.status).toBe(403);

    (verifyTurnstileToken as jest.Mock).mockResolvedValueOnce({
      success: false,
    });
    const turnstileResponse = await POST(
      createRequest({ email: "test@example.com" })
    );
    expect(turnstileResponse.status).toBe(403);

    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });
    delete process.env.RESEND_API_KEY;
    const unavailableResponse = await POST(
      createRequest({ email: "test@example.com" })
    );
    expect(unavailableResponse.status).toBe(503);
  });
});
