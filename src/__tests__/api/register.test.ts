/**
 * Tests for register API route
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

jest.mock("crypto", () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue("mock-verification-token"),
  }),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("mock-verification-token-hash"),
  }),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
}));

const mockAfter = jest.fn();

jest.mock("next/server", () => ({
  after: (task: unknown) => mockAfter(task),
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      };
    },
  },
}));

import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

describe("Register API", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    jest.clearAllMocks();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("POST", () => {
    it("returns 400 for invalid input - missing name", async () => {
      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          email: "test@test.com",
          password: "password12345",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid input - invalid email", async () => {
      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          email: "invalid",
          password: "password12345",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid input - short password", async () => {
      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          email: "test@test.com",
          password: "123",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns accepted response when user already exists", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "existing-user",
      });

      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "existing@test.com",
          password: "password12345",
        }),
      });
      const response = await resolveAcceptedRegistration(POST(request));

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toEqual({ success: true, verificationEmailSent: true });
      expect(bcrypt.hash).toHaveBeenCalledWith("password12345", 12);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it("creates user successfully", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const mockUser = {
        id: "new-user-123",
        name: "Test User",
        email: "new@test.com",
        password: "hashed_password",
      };
      (prisma.$transaction as jest.Mock).mockResolvedValue([mockUser, {}]);

      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "new@test.com",
          password: "password12345",
        }),
      });
      const response = await resolveAcceptedRegistration(POST(request));

      expect(response.status).toBe(201);
      expect(bcrypt.hash).toHaveBeenCalledWith("password12345", 12);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockAfter).toHaveBeenCalledTimes(1);

      // Verify password is not in response
      const data = await response.json();
      expect(data.password).toBeUndefined();
    });

    it("handles database errors", async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "test@test.com",
          password: "password12345",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
