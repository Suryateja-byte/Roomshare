/**
 * Tests for register API route
 */

import { Prisma } from "@prisma/client";

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

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((_error: unknown, _context: unknown) => ({
    status: 500,
    json: async () => ({ error: "Internal server error" }),
    headers: new Map(),
  })),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
}));

jest.mock("next/server", () => ({
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
import { captureApiError } from "@/lib/api-error-handler";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const DUPLICATE_REGISTRATION_ERROR =
  "Registration failed. Please try again or use forgot password if you already have an account.";

describe("Register API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    it("returns 400 when user already exists", async () => {
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
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      // P1-06/P1-07: Generic message prevents user enumeration
      expect(data.error).toBe(DUPLICATE_REGISTRATION_ERROR);
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
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(bcrypt.hash).toHaveBeenCalledWith("password12345", 12);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify password is not in response
      const data = await response.json();
      expect(data.password).toBeUndefined();
    });

    it("returns 400 when transaction loses the email uniqueness race", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`email`)",
          {
            code: "P2002",
            clientVersion: "test",
            meta: { modelName: "User", target: ["email"] },
          }
        )
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
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(DUPLICATE_REGISTRATION_ERROR);
      expect(captureApiError).not.toHaveBeenCalled();
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
      expect(captureApiError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ route: "/api/register", method: "POST" })
      );
    });
  });
});
