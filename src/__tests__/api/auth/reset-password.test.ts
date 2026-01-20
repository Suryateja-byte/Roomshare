/**
 * Tests for reset password API route
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(() => Promise.resolve("hashed_password")),
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

// Mock rate limiting to not interfere with tests
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(() => null),
}));

import { POST, GET } from "@/app/api/auth/reset-password/route";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

describe("Reset Password API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/reset-password", () => {
    const createRequest = (body: object) =>
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
      }) as unknown as NextRequest;

    it("resets password successfully with valid token", async () => {
      const validToken = {
        id: "token-123",
        token: "valid-token",
        email: "test@example.com",
        expires: new Date(Date.now() + 3600000),
      };
      const mockUser = { id: "user-123", email: "test@example.com" };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        validToken,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.passwordResetToken.delete as jest.Mock).mockResolvedValue({});

      const request = createRequest({
        token: "valid-token",
        password: "newpassword123",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Password has been reset successfully");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { password: "hashed_password" },
      });
      expect(prisma.passwordResetToken.delete).toHaveBeenCalled();
    });

    it("returns error for missing token", async () => {
      const request = createRequest({ password: "newpassword123" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("returns error for missing password", async () => {
      const request = createRequest({ token: "valid-token" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("returns error for short password", async () => {
      const request = createRequest({
        token: "valid-token",
        password: "12345",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Password must be at least 6 characters");
    });

    it("returns error for invalid token", async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const request = createRequest({
        token: "invalid-token",
        password: "newpassword123",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid or expired reset link");
    });

    it("returns error for expired token", async () => {
      const expiredToken = {
        id: "token-123",
        token: "expired-token",
        email: "test@example.com",
        expires: new Date(Date.now() - 3600000),
      };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        expiredToken,
      );
      (prisma.passwordResetToken.delete as jest.Mock).mockResolvedValue({});

      const request = createRequest({
        token: "expired-token",
        password: "newpassword123",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(
        "Reset link has expired. Please request a new one.",
      );
      expect(prisma.passwordResetToken.delete).toHaveBeenCalled();
    });

    it("returns error when user not found", async () => {
      const validToken = {
        id: "token-123",
        token: "valid-token",
        email: "nonexistent@example.com",
        expires: new Date(Date.now() + 3600000),
      };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        validToken,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const request = createRequest({
        token: "valid-token",
        password: "newpassword123",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("User not found");
    });

    it("handles database errors gracefully", async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error"),
      );

      const request = createRequest({
        token: "valid-token",
        password: "newpassword123",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("An error occurred. Please try again.");
    });

    it("deletes token after successful reset", async () => {
      const validToken = {
        id: "token-123",
        token: "valid-token",
        email: "test@example.com",
        expires: new Date(Date.now() + 3600000),
      };
      const mockUser = { id: "user-123", email: "test@example.com" };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        validToken,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.passwordResetToken.delete as jest.Mock).mockResolvedValue({});

      const request = createRequest({
        token: "valid-token",
        password: "newpassword123",
      });
      await POST(request);

      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: "token-123" },
      });
    });
  });

  describe("GET /api/auth/reset-password", () => {
    const createRequest = (token: string | null) => {
      const url = token
        ? `http://localhost:3000/api/auth/reset-password?token=${token}`
        : "http://localhost:3000/api/auth/reset-password";
      return new Request(url, { method: "GET" }) as unknown as NextRequest;
    };

    it("returns valid true for valid token", async () => {
      const validToken = {
        token: "valid-token",
        expires: new Date(Date.now() + 3600000),
      };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        validToken,
      );

      const request = createRequest("valid-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
    });

    it("returns error for missing token", async () => {
      const request = createRequest(null);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toBe("Token is required");
    });

    it("returns error for invalid token", async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const request = createRequest("invalid-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toBe("Invalid reset link");
    });

    it("returns error for expired token", async () => {
      const expiredToken = {
        token: "expired-token",
        expires: new Date(Date.now() - 3600000),
      };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        expiredToken,
      );

      const request = createRequest("expired-token");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toBe("Reset link has expired");
    });
  });
});
