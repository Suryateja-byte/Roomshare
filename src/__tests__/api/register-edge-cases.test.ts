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

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
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

import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { normalizeEmail } from "@/lib/normalize-email";
import { createTokenPair } from "@/lib/token-security";
import { sendNotificationEmail } from "@/lib/email";

describe("POST /api/register — edge cases", () => {
  const validBody = {
    name: "Test User",
    email: "Test@Example.COM",
    password: "password12345",
    turnstileToken: "valid-turnstile-token",
  };

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("returns 403 when Turnstile verification fails", async () => {
    (verifyTurnstileToken as jest.Mock).mockResolvedValue({ success: false });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Bot verification failed");
  });

  it("success response contains only { success, verificationEmailSent } and no user data", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
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
    const response = await POST(request);
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
    await POST(request);

    expect(normalizeEmail).toHaveBeenCalledWith("Test@Example.COM");
    // user.findUnique should receive the normalized (lowercased) email
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
    });
  });

  it("creates verification token pair after successful user creation", async () => {
    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    await POST(request);

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

  it("handles email send failure gracefully and still returns 201", async () => {
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: false });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.verificationEmailSent).toBe(false);
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
    const response = await POST(request);

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

  it("returns generic error message when email already exists (does not reveal existence)", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "existing-user",
    });

    const request = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    // Must not say "email already in use" or similar — generic message only
    expect(data.error).toBe(
      "Registration failed. Please try again or use forgot password if you already have an account."
    );
    expect(data.error).not.toContain("exists");
    expect(data.error).not.toContain("taken");
  });
});
