/**
 * Edge-case tests for POST /api/register route
 * Covers features NOT tested in the existing register.test.ts:
 * Turnstile verification, email normalization, token-security, response shape
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
}));

jest.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: jest.fn(),
}));

jest.mock("@/lib/normalize-email", () => ({
  normalizeEmail: jest.fn((e: string) => e.toLowerCase()),
}));

jest.mock("@/lib/token-security", () => ({
  createTokenPair: jest
    .fn()
    .mockReturnValue({ token: "mock-token", tokenHash: "mock-hash" }),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((_error: unknown, _context: unknown) => ({
    status: 500,
    json: async () => ({ error: "Internal server error" }),
    headers: new Map(),
  })),
}));

jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

const mockAfter = jest.fn();

jest.mock("next/server", () => ({
  after: (task: unknown) => mockAfter(task),
  NextResponse: {
    json: (data: any, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { normalizeEmail } from "@/lib/normalize-email";
import { createTokenPair } from "@/lib/token-security";
import { sendNotificationEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

async function resolveAcceptedRegistration<T>(promise: Promise<T>): Promise<T> {
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

describe("POST /api/register — edge cases", () => {
  const validBody = {
    name: "Test User",
    email: "Test@Example.COM",
    password: "password12345",
    turnstileToken: "valid-turnstile-token",
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    jest.clearAllMocks();
    jest.spyOn(Math, "random").mockReturnValue(0);
    (validateCsrf as jest.Mock).mockReturnValue(null);
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (verifyTurnstileToken as jest.Mock).mockResolvedValue({ success: true });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: "new-user-123",
      name: "Test User",
      email: "test@example.com",
    });
    (prisma.verificationToken.create as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      { id: "new-user-123", name: "Test User", email: "test@example.com" },
      {},
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns 403 when Turnstile verification fails", async () => {
    (verifyTurnstileToken as jest.Mock).mockResolvedValue({ success: false });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Bot verification failed");
  });

  it("success response contains only { success, verificationEmailSent } and no user data", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(["success", "verificationEmailSent"])
    );
    expect(data.id).toBeUndefined();
    expect(data.email).toBeUndefined();
    expect(data.name).toBeUndefined();
  });

  it("password is never included in response body", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(data.password).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("password12345");
    expect(JSON.stringify(data)).not.toContain("hashed_password");
  });

  it("normalizes email to lowercase before lookup and user creation", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await resolveAcceptedRegistration(POST(request));

    expect(normalizeEmail).toHaveBeenCalledWith("Test@Example.COM");
    // user.findUnique should receive the normalized (lowercased) email
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
      select: { id: true },
    });
  });

  it("creates verification token pair after successful user creation", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await resolveAcceptedRegistration(POST(request));

    expect(createTokenPair).toHaveBeenCalled();
    expect(prisma.verificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: "mock-hash",
          identifier: "test@example.com",
        }),
      })
    );
  });

  it("schedules welcome email after the accepted response", async () => {
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: false });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.verificationEmailSent).toBe(true);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);

    const afterTask = mockAfter.mock.calls[0][0] as () => Promise<void>;
    await afterTask();

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      "welcomeEmail",
      "test@example.com",
      expect.objectContaining({
        userName: "Test User",
        verificationUrl: expect.stringContaining(
          "/api/auth/verify-email?token=mock-token"
        ),
      })
    );
    expect(logger.sync.error).toHaveBeenCalledWith(
      "Failed to send welcome email",
      {
        route: "/api/register",
        method: "POST",
      }
    );
  });

  it("returns 400 for password shorter than 12 characters", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify({ ...validBody, password: "short" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("creates user and verification token atomically via $transaction", async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      { id: "new-user-123", name: "Test User", email: "test@example.com" },
      {},
    ]);

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));

    expect(response.status).toBe(201);
    // Must use $transaction, not separate create calls
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(), // prisma.user.create(...)
      expect.anything(), // prisma.verificationToken.create(...)
    ]);
    // Individual creates should NOT be awaited directly
    // (they are passed as promises to $transaction)
  });

  it("keeps existing and new valid signup attempts pending until the same timing floor", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "existing-user",
    });
    const existingRequest = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await expectAcceptedTimingFloor(POST(existingRequest));

    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const newRequest = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify({ ...validBody, email: "new@example.com" }),
    });
    await expectAcceptedTimingFloor(POST(newRequest));
  });

  it("accepts existing valid email without revealing existence or causing side effects", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "existing-user",
    });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ success: true, verificationEmailSent: true });
    expect(bcrypt.hash).toHaveBeenCalledWith("password12345", 12);
    expect(createTokenPair).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("returns accepted response for duplicate-create races without sending email", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockRejectedValue({ code: "P2002" });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await resolveAcceptedRegistration(POST(request));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ success: true, verificationEmailSent: true });
    expect(mockAfter).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("does not delay malformed, CSRF, Turnstile, or rate-limit failures", async () => {
    const malformedResponse = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ ...validBody, password: "short" }),
      })
    );
    expect(malformedResponse.status).toBe(400);

    (validateCsrf as jest.Mock).mockReturnValueOnce({
      status: 403,
      json: async () => ({ error: "Invalid CSRF token" }),
      headers: new Map(),
    });
    const csrfResponse = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify(validBody),
      })
    );
    expect(csrfResponse.status).toBe(403);

    (verifyTurnstileToken as jest.Mock).mockResolvedValueOnce({
      success: false,
    });
    const turnstileResponse = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify(validBody),
      })
    );
    expect(turnstileResponse.status).toBe(403);

    (withRateLimit as jest.Mock).mockResolvedValueOnce({
      status: 429,
      json: async () => ({ error: "Too many requests" }),
      headers: new Map(),
    });
    const rateLimitResponse = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify(validBody),
      })
    );
    expect(rateLimitResponse.status).toBe(429);
  });
});
