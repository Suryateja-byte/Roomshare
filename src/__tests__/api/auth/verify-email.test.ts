/**
 * Tests for verify email API route
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    verificationToken: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(() => null),
}));

jest.mock("@/lib/csrf", () => ({
  validateCsrf: jest.fn(() => null),
}));

jest.mock("@/lib/verification-token-store", () => ({
  clearVerificationTokenSlot: jest.fn(),
  findVerificationTokenByHash: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
    redirect: (url: URL | string) => {
      const urlString = url instanceof URL ? url.toString() : url;
      return {
        status: 307,
        headers: new Map([["location", urlString]]),
        json: async () => ({}),
      };
    },
  },
}));

import { GET, POST } from "@/app/api/auth/verify-email/route";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateCsrf } from "@/lib/csrf";
import { hashToken } from "@/lib/token-security";
import {
  clearVerificationTokenSlot,
  findVerificationTokenByHash,
} from "@/lib/verification-token-store";
import type { NextRequest } from "next/server";

const VALID_TOKEN = "a".repeat(64);
const EXPIRED_TOKEN = "b".repeat(64);
const INVALID_FORMAT_TOKEN = "invalid-token";

function createGetRequest(token: string | null) {
  const url = token
    ? `http://localhost:3000/api/auth/verify-email?token=${token}`
    : "http://localhost:3000/api/auth/verify-email";
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

function createPostRequest(body: object) {
  return new Request("http://localhost:3000/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("Verify Email API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (validateCsrf as jest.Mock).mockReturnValue(null);
  });

  describe("GET /api/auth/verify-email", () => {
    it("redirects legacy links to the confirmation page", async () => {
      const response = await GET(createGetRequest(VALID_TOKEN));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `http://localhost:3000/verify-email?token=${VALID_TOKEN}`
      );
      expect(findVerificationTokenByHash).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(withRateLimit).not.toHaveBeenCalled();
    });

    it("redirects missing tokens to the confirmation page without mutating state", async () => {
      const response = await GET(createGetRequest(null));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/verify-email"
      );
      expect(clearVerificationTokenSlot).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/verify-email", () => {
    it("verifies email successfully with a valid active token", async () => {
      const expires = new Date(Date.now() + 3600000);
      const mockUser = { id: "user-123", email: "test@example.com" };
      const mockTxUserUpdate = jest.fn().mockResolvedValue({});
      const mockTxDeleteMany = jest.fn().mockResolvedValue({ count: 1 });

      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "active",
        expires,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            verificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                identifier: "test@example.com",
                tokenHash: hashToken(VALID_TOKEN),
                expires,
                pendingTokenHash: null,
                pendingExpires: null,
              }),
              deleteMany: mockTxDeleteMany,
            },
            user: { update: mockTxUserUpdate },
          };
          return callback(tx);
        }
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("verified");
      expect(findVerificationTokenByHash).toHaveBeenCalledWith(
        hashToken(VALID_TOKEN)
      );
      expect(mockTxDeleteMany).toHaveBeenCalledWith({
        where: { identifier: "test@example.com" },
      });
      expect(mockTxUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { emailVerified: expect.any(Date) },
      });
      expect(withRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ method: "POST" }),
        { type: "verifyEmail" }
      );
      expect(validateCsrf).toHaveBeenCalled();
    });

    it("verifies email successfully with a valid pending token", async () => {
      const expires = new Date(Date.now() + 3600000);

      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "pending",
        expires,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            verificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                identifier: "test@example.com",
                tokenHash: "active-hash",
                expires: new Date(Date.now() + 1000),
                pendingTokenHash: hashToken(VALID_TOKEN),
                pendingExpires: expires,
              }),
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            user: { update: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("verified");
    });

    it("returns 400 when token is missing", async () => {
      const response = await POST(createPostRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("missing_token");
      expect(findVerificationTokenByHash).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid token format", async () => {
      const response = await POST(
        createPostRequest({ token: INVALID_FORMAT_TOKEN })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("invalid_token");
      expect(findVerificationTokenByHash).not.toHaveBeenCalled();
    });

    it("returns 400 when the token hash does not exist", async () => {
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue(null);

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("invalid_token");
    });

    it("returns 400 for expired active tokens and clears only that slot", async () => {
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "active",
        expires: new Date(Date.now() - 3600000),
      });

      const response = await POST(createPostRequest({ token: EXPIRED_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("expired_token");
      expect(clearVerificationTokenSlot).toHaveBeenCalledWith(
        "test@example.com",
        "active",
        hashToken(EXPIRED_TOKEN)
      );
    });

    it("returns 400 for expired pending tokens and clears only that slot", async () => {
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "pending",
        expires: new Date(Date.now() - 3600000),
      });

      const response = await POST(createPostRequest({ token: EXPIRED_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("expired_token");
      expect(clearVerificationTokenSlot).toHaveBeenCalledWith(
        "test@example.com",
        "pending",
        hashToken(EXPIRED_TOKEN)
      );
    });

    it("returns 404 when the user cannot be found", async () => {
      const expires = new Date(Date.now() + 3600000);
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "missing@example.com" },
        slot: "active",
        expires,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe("user_not_found");
    });

    it("returns already_verified when the token was already consumed", async () => {
      const expires = new Date(Date.now() + 3600000);
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "active",
        expires,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            verificationToken: {
              findUnique: jest.fn().mockResolvedValue(null),
              deleteMany: jest.fn(),
            },
            user: { update: jest.fn() },
          };
          return callback(tx);
        }
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("already_verified");
    });

    it("returns invalid_token when the matched slot was rotated away", async () => {
      const expires = new Date(Date.now() + 3600000);
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "active",
        expires,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            verificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                identifier: "test@example.com",
                tokenHash: "new-active-hash",
                expires,
                pendingTokenHash: null,
                pendingExpires: null,
              }),
              deleteMany: jest.fn(),
            },
            user: { update: jest.fn() },
          };
          return callback(tx);
        }
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("invalid_token");
    });

    it("returns expired_token when the token expires before commit", async () => {
      (findVerificationTokenByHash as jest.Mock).mockResolvedValue({
        record: { identifier: "test@example.com" },
        slot: "pending",
        expires: new Date(Date.now() + 3600000),
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
      });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            verificationToken: {
              findUnique: jest.fn().mockResolvedValue({
                identifier: "test@example.com",
                tokenHash: "active-hash",
                expires: new Date(Date.now() + 7200000),
                pendingTokenHash: hashToken(VALID_TOKEN),
                pendingExpires: new Date(Date.now() - 1000),
              }),
              deleteMany: jest.fn(),
            },
            user: { update: jest.fn() },
          };
          return callback(tx);
        }
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("expired_token");
      expect(clearVerificationTokenSlot).toHaveBeenCalledWith(
        "test@example.com",
        "pending",
        hashToken(VALID_TOKEN)
      );
    });

    it("returns the rate-limit response when limited", async () => {
      const mockRateLimitResponse = {
        status: 429,
        json: async () => ({ error: "Too many requests" }),
      };
      (withRateLimit as jest.Mock).mockResolvedValue(mockRateLimitResponse);

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));

      expect(response).toBe(mockRateLimitResponse);
      expect(findVerificationTokenByHash).not.toHaveBeenCalled();
    });

    it("handles unexpected database errors gracefully", async () => {
      (findVerificationTokenByHash as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const response = await POST(createPostRequest({ token: VALID_TOKEN }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe("verification_failed");
    });
  });
});
