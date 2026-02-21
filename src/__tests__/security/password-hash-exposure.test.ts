/**
 * TEST-04: Password hash exposure regression test
 *
 * Ensures the `password` field is never leaked in API responses or action returns.
 * The User model stores hashed passwords in the `password` column — this must
 * NEVER appear in any client-facing response.
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
  },
}));

jest.mock("crypto", () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue("mock-token"),
  }),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("mock-token-hash"),
  }),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$hashedpassword"),
  compare: jest.fn().mockResolvedValue(true),
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

jest.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: jest.fn().mockResolvedValue({ success: true }),
}));

import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";

describe("Password hash exposure regression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Register API response", () => {
    it("does NOT return the password field in a successful registration response", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: "new-user-id",
        name: "Test User",
        email: "newuser@example.com",
        password: "$2a$12$hashedpassword",
        emailVerified: null,
      });
      (prisma.verificationToken.create as jest.Mock).mockResolvedValue({});

      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "newuser@example.com",
          password: "securePassword123",
          turnstileToken: "mock-token",
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      // The response must not contain any password-like fields
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("hashedPassword");
      expect(body).not.toHaveProperty("passwordHash");

      // Verify the response only contains expected fields
      expect(body).toHaveProperty("success", true);

      // Deep-check: stringified response must not contain the hash
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("$2a$");
      expect(serialized).not.toContain("hashedpassword");
    });

    it("does NOT return user object fields on registration error", async () => {
      // Simulate existing user (registration failure case)
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "existing-user",
        email: "existing@example.com",
        password: "$2a$12$existinghash",
      });

      const request = new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "existing@example.com",
          password: "securePassword123",
          turnstileToken: "mock-token",
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      // Must not contain bcrypt hash patterns or user DB fields
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("$2a$");
      expect(serialized).not.toContain("existinghash");
      // Must not leak user IDs or emails from the looked-up record
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("email");
      expect(body).not.toHaveProperty("password");
    });
  });

  describe("Prisma select patterns", () => {
    it("settings actions only select { password: true } for internal comparison, never return it", async () => {
      // The settings module uses `select: { password: true }` internally
      // for bcrypt.compare, but the function return types are:
      //   { success: boolean; error?: string }
      // It may also convert to a boolean `hasPassword: !!user.password`
      // which is safe (no hash leakage).
      const fs = require("fs");
      const settingsSource = fs.readFileSync(
        require.resolve("@/app/actions/settings"),
        "utf8",
      );

      // All password selects should use narrow selects (not `select: *`)
      const passwordSelects = settingsSource.match(
        /select:\s*\{[^}]*password:\s*true[^}]*\}/g,
      );
      expect(passwordSelects).not.toBeNull();
      expect(passwordSelects!.length).toBeGreaterThan(0);

      // The raw password value must never be returned directly.
      // `hasPassword: !!user.password` (boolean) is safe.
      // A direct `password: user.password` or `password:` in a return would leak the hash.
      const leakyReturnPattern =
        /return\s*\{[^}]*\bpassword\s*:\s*user\.password[^}]*\}/;
      expect(settingsSource).not.toMatch(leakyReturnPattern);
    });

    it("register route does not return the prisma user object to the client", async () => {
      const fs = require("fs");
      const registerSource = fs.readFileSync(
        require.resolve("@/app/api/register/route"),
        "utf8",
      );

      // The register route should NOT return the `user` variable in NextResponse.json.
      // It should return a minimal { success: true } response.
      // Check that NextResponse.json calls don't pass the `user` object directly
      // (note: error messages may mention the word "password" in prose — that's safe)
      const responseLines = registerSource.match(
        /NextResponse\.json\(\s*\{[^}]+\}/g,
      );
      expect(responseLines).not.toBeNull();

      for (const line of responseLines!) {
        // Must not return `password:` as a field key
        expect(line).not.toMatch(/\bpassword\s*:/);
        // Must not spread or pass the full `user` object
        expect(line).not.toContain("...user");
        expect(line).not.toMatch(/NextResponse\.json\(\s*user\b/);
      }
    });

    it("profile action does NOT select or return the password field", async () => {
      const fs = require("fs");
      const profileSource = fs.readFileSync(
        require.resolve("@/app/actions/profile"),
        "utf8",
      );

      // Profile actions should never select the password field
      expect(profileSource).not.toContain("select: { password");
      // And should not return it
      expect(profileSource).not.toMatch(
        /return\s*\{[^}]*password[^}]*\}/,
      );
    });
  });
});
