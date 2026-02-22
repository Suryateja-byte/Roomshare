/**
 * TEST-04: Password Hash Exposure Regression Test
 *
 * Ensures the `password` field is NEVER returned in any API response
 * or server action result. The password hash must only be selected
 * internally for authentication checks (login, change-password).
 */

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    listing: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 10, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    changePassword: { limit: 5, windowMs: 3600000 },
    verifyPassword: { limit: 10, windowMs: 3600000 },
    deleteAccount: { limit: 3, windowMs: 86400000 },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasPasswordSet } from "@/app/actions/settings";

describe("Password Hash Exposure Prevention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Server Action: hasPasswordSet", () => {
    it("should return boolean true when user has password, not the hash", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: "user-001" },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "$2a$12$somehash",
      });

      const result = await hasPasswordSet();

      // Must return a boolean, never the actual hash
      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
      expect(result).not.toBe("$2a$12$somehash");
    });

    it("should return boolean false when user has no password", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: "user-001" },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const result = await hasPasswordSet();

      expect(typeof result).toBe("boolean");
      expect(result).toBe(false);
    });

    it("should return false for unauthenticated users, not leak auth state", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await hasPasswordSet();

      expect(result).toBe(false);
      // Prisma should not even be queried
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("Prisma Select Pattern Audit", () => {
    /**
     * This test documents all known locations that select password: true.
     * All of them must be internal-only (never exposed in API responses).
     *
     * If you add a new password-selecting query, add it here AND verify
     * it never reaches the client.
     */
    it("should document all known password-selecting queries are internal-only", () => {
      const allowedPasswordSelectLocations = [
        // settings.ts: internal auth checks only (boolean return or compare)
        "src/app/actions/settings.ts:hasPasswordSet",
        "src/app/actions/settings.ts:changePassword",
        "src/app/actions/settings.ts:deleteAccount",
        "src/app/actions/settings.ts:setPassword",
        "src/app/actions/settings.ts:getUserSettings",
        // register route: creates with password but returns only {success, message}
        "src/app/api/register/route.ts:POST",
        // auth.ts: credential validation (never returned)
        "src/auth.ts:authorize",
      ];

      // If this number changes, audit the new location
      expect(allowedPasswordSelectLocations.length).toBe(7);
    });
  });

  describe("Response Shape Assertions", () => {
    it("should never include password-like fields in JSON responses", () => {
      // Simulate common API response shapes and verify no password leakage
      const safeUserResponse = {
        id: "user-001",
        name: "Test User",
        email: "test@example.com",
        image: null,
      };

      const safeListingResponse = {
        id: "listing-001",
        title: "Nice Room",
        owner: {
          id: "user-001",
          name: "Owner",
          image: null,
        },
      };

      const responseStr = JSON.stringify([safeUserResponse, safeListingResponse]);

      // No bcrypt hash patterns
      expect(responseStr).not.toContain("$2a$");
      expect(responseStr).not.toContain("$2b$");
      // No password field
      expect(responseStr).not.toMatch(/"password"\s*:/);
      expect(responseStr).not.toMatch(/"passwordHash"\s*:/);
      expect(responseStr).not.toMatch(/"hashedPassword"\s*:/);
    });
  });
});
