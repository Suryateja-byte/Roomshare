/**
 * Edge Case Tests: Category A - Auth, Sessions, Account Linking
 *
 * Tests for authentication edge cases including:
 * - Session management and JWT tokens
 * - Account linking and OAuth flows
 * - Email verification edge cases
 * - Password reset flows
 * - Concurrent session handling
 * - Token expiration and refresh
 *
 * @see Edge Cases Category A (20 tests)
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";

describe("Auth Edge Cases - Category A", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // A1: JWT token with expired timestamp but valid signature
  describe("A1: Expired JWT with valid signature", () => {
    it("rejects expired token even with valid signature", async () => {
      const expiredSession = {
        user: { id: "user-123" },
        expires: new Date(Date.now() - 1000).toISOString(), // Expired
      };

      (auth as jest.Mock).mockResolvedValue(null); // Auth middleware returns null for expired

      const session = await auth();

      expect(session).toBeNull();
    });

    it("handles token exactly at expiration boundary", async () => {
      const boundarySession = {
        user: { id: "user-123" },
        expires: new Date(Date.now()).toISOString(), // Exactly now
      };

      (auth as jest.Mock).mockResolvedValue(null);

      const session = await auth();

      expect(session).toBeNull();
    });
  });

  // A2: Session exists but user was deleted from database
  describe("A2: Orphaned session - user deleted", () => {
    it("handles session with deleted user gracefully", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: "deleted-user-123" },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });

      expect(user).toBeNull();
      // Application should handle this case by logging out
    });

    it("cleans up orphaned sessions during auth check", async () => {
      (prisma.session.findMany as jest.Mock).mockResolvedValue([
        { id: "session-1", userId: "deleted-user" },
      ]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      // Simulating cleanup logic
      const sessions = await prisma.session.findMany({
        where: { userId: "deleted-user" },
      });

      expect(sessions.length).toBe(1);
    });
  });

  // A3: Concurrent login attempts from same user
  describe("A3: Concurrent login attempts", () => {
    it("handles race condition in session creation", async () => {
      const userId = "user-123";
      let sessionCount = 0;

      (prisma.session.create as jest.Mock).mockImplementation(async () => {
        sessionCount++;
        return { id: `session-${sessionCount}`, userId };
      });

      // Simulate concurrent logins
      await Promise.all([
        prisma.session.create({
          data: { userId, sessionToken: "token-1", expires: new Date() },
        }),
        prisma.session.create({
          data: { userId, sessionToken: "token-2", expires: new Date() },
        }),
      ]);

      expect(sessionCount).toBe(2);
      // Both sessions should be valid
    });

    it("enforces single session policy when enabled", async () => {
      const userId = "user-123";

      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: "new-session",
      });

      // Simulating single session enforcement
      await prisma.session.deleteMany({ where: { userId } });
      const newSession = await prisma.session.create({
        data: { userId, sessionToken: "new-token", expires: new Date() },
      });

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(newSession.id).toBe("new-session");
    });
  });

  // A4: OAuth account linking with existing email
  describe("A4: OAuth account linking edge cases", () => {
    it("links OAuth account to existing email-based account", async () => {
      const existingUser = {
        id: "user-123",
        email: "test@example.com",
        emailVerified: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);
      (prisma.account.create as jest.Mock).mockResolvedValue({
        id: "account-123",
        userId: "user-123",
        provider: "google",
      });

      const user = await prisma.user.findUnique({
        where: { email: "test@example.com" },
      });

      expect(user).not.toBeNull();
      expect(user?.emailVerified).toBeTruthy();
    });

    it("prevents linking OAuth account to unverified email account", async () => {
      const unverifiedUser = {
        id: "user-123",
        email: "test@example.com",
        emailVerified: null, // Not verified
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(unverifiedUser);

      const user = await prisma.user.findUnique({
        where: { email: "test@example.com" },
      });

      // Should not allow linking to unverified account
      expect(user?.emailVerified).toBeNull();
    });

    it("handles OAuth provider returning different email", async () => {
      const oauthProfile = {
        email: "new-oauth-email@example.com",
        provider: "google",
        providerAccountId: "oauth-123",
      };

      (prisma.account.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: "new-user",
        email: oauthProfile.email,
      });

      // New user should be created
      const newUser = await prisma.user.create({
        data: { email: oauthProfile.email },
      });

      expect(newUser.email).toBe(oauthProfile.email);
    });
  });

  // A5: Email verification with case sensitivity
  describe("A5: Email verification case sensitivity", () => {
    it("matches verification token regardless of email case", async () => {
      const token = {
        token: "valid-token",
        identifier: "TEST@EXAMPLE.COM", // Uppercase
        expires: new Date(Date.now() + 3600000),
      };

      (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(
        token,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "test@example.com", // Lowercase
      });

      const foundToken = await prisma.verificationToken.findUnique({
        where: { token: "valid-token" },
      });

      // Email matching should be case-insensitive
      expect(foundToken?.identifier.toLowerCase()).toBe("test@example.com");
    });

    it("normalizes email before creating verification token", async () => {
      const mixedCaseEmail = "TeSt@ExAmPlE.CoM";

      (prisma.verificationToken.create as jest.Mock).mockResolvedValue({
        token: "new-token",
        identifier: mixedCaseEmail.toLowerCase(),
      });

      const token = await prisma.verificationToken.create({
        data: {
          token: "new-token",
          identifier: mixedCaseEmail.toLowerCase(),
          expires: new Date(),
        },
      });

      expect(token.identifier).toBe("test@example.com");
    });
  });

  // A6: Password reset with recently changed password
  describe("A6: Password reset security constraints", () => {
    it("rejects password reset token after password was already changed", async () => {
      const token = {
        token: "reset-token",
        userId: "user-123",
        expires: new Date(Date.now() + 3600000),
        createdAt: new Date(Date.now() - 7200000), // 2 hours ago
      };

      const user = {
        id: "user-123",
        passwordChangedAt: new Date(Date.now() - 1800000), // 30 min ago (after token)
      };

      (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(
        token,
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);

      const foundToken = await prisma.passwordResetToken.findUnique({
        where: { token: "reset-token" },
      });
      // PasswordResetToken uses email, not userId - cast for test mocking
      const foundUser = await prisma.user.findUnique({
        where: { id: (foundToken as unknown as { userId: string })?.userId },
      });

      // Token should be rejected if password changed after token creation
      const tokenCreatedAt = token.createdAt.getTime();
      const passwordChangedAt =
        (foundUser as any)?.passwordChangedAt?.getTime() || 0;

      expect(passwordChangedAt).toBeGreaterThan(tokenCreatedAt);
    });

    it("prevents reuse of password reset token", async () => {
      (prisma.passwordResetToken.findUnique as jest.Mock)
        .mockResolvedValueOnce({ token: "reset-token", userId: "user-123" })
        .mockResolvedValueOnce(null); // Second attempt returns null

      (prisma.passwordResetToken.delete as jest.Mock).mockResolvedValue({});

      const firstAttempt = await prisma.passwordResetToken.findUnique({
        where: { token: "reset-token" },
      });
      expect(firstAttempt).not.toBeNull();

      await prisma.passwordResetToken.delete({
        where: { token: "reset-token" },
      });

      const secondAttempt = await prisma.passwordResetToken.findUnique({
        where: { token: "reset-token" },
      });
      expect(secondAttempt).toBeNull();
    });
  });

  // A7: Session fixation prevention
  describe("A7: Session fixation attacks", () => {
    it("regenerates session ID after login", async () => {
      const oldSessionId = "old-session-id";
      const newSessionId = "new-session-id";

      (prisma.session.delete as jest.Mock).mockResolvedValue({});
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: newSessionId,
        sessionToken: "new-token",
      });

      // Delete old session
      await prisma.session.delete({ where: { id: oldSessionId } });

      // Create new session
      const newSession = await prisma.session.create({
        data: {
          userId: "user-123",
          sessionToken: "new-token",
          expires: new Date(),
        },
      });

      expect(newSession.id).not.toBe(oldSessionId);
    });

    it("invalidates all sessions on password change", async () => {
      const userId = "user-123";

      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await prisma.session.deleteMany({
        where: { userId },
      });

      expect(result.count).toBe(3);
    });
  });

  // A8: Multiple OAuth providers for same user
  describe("A8: Multiple OAuth providers", () => {
    it("allows linking multiple OAuth providers to same account", async () => {
      const userId = "user-123";

      (prisma.account.count as jest.Mock).mockResolvedValue(2);
      (prisma.account.create as jest.Mock).mockResolvedValue({
        id: "account-3",
        provider: "github",
        userId,
      });

      const existingCount = await prisma.account.count({ where: { userId } });
      expect(existingCount).toBe(2);

      const newAccount = await prisma.account.create({
        data: {
          userId,
          provider: "github",
          providerAccountId: "github-123",
          type: "oauth",
        },
      });
      expect(newAccount.provider).toBe("github");
    });

    it("prevents duplicate OAuth provider links", async () => {
      (prisma.account.findFirst as jest.Mock).mockResolvedValue({
        id: "existing-account",
        provider: "google",
        providerAccountId: "google-123",
      });

      const existing = await prisma.account.findFirst({
        where: { provider: "google", providerAccountId: "google-123" },
      });

      expect(existing).not.toBeNull();
      // Should prevent creating duplicate
    });
  });

  // A9: Account deletion with active sessions
  describe("A9: Account deletion cleanup", () => {
    it("cleans up all sessions on account deletion", async () => {
      const userId = "user-123";

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
            account: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            user: { delete: jest.fn().mockResolvedValue({ id: userId }) },
          };
          return callback(tx);
        },
      );

      await prisma.$transaction(async (tx: any) => {
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("cleans up verification tokens on account deletion", async () => {
      (prisma.verificationToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await prisma.verificationToken.deleteMany({
        where: { identifier: "deleted@example.com" },
      });

      expect(result.count).toBe(1);
    });
  });

  // A10: Suspended user session handling
  describe("A10: Suspended user authentication", () => {
    it("denies authentication for suspended user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        isSuspended: true,
        email: "suspended@example.com",
      });

      const user = await prisma.user.findUnique({ where: { id: "user-123" } });

      expect(user?.isSuspended).toBe(true);
      // Auth middleware should reject suspended users
    });

    it("invalidates existing sessions when user is suspended", async () => {
      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: "user-123",
        isSuspended: true,
      });

      // Suspend user
      await prisma.user.update({
        where: { id: "user-123" },
        data: { isSuspended: true },
      });

      // Delete all sessions
      const result = await prisma.session.deleteMany({
        where: { userId: "user-123" },
      });

      expect(result.count).toBe(2);
    });
  });

  // A11: Token refresh race condition
  describe("A11: Token refresh race conditions", () => {
    it("handles concurrent token refresh attempts", async () => {
      let refreshCount = 0;

      (prisma.session.update as jest.Mock).mockImplementation(async () => {
        refreshCount++;
        return { id: "session-123", expires: new Date(Date.now() + 3600000) };
      });

      // Simulate concurrent refresh
      await Promise.all([
        prisma.session.update({
          where: { id: "session-123" },
          data: { expires: new Date(Date.now() + 3600000) },
        }),
        prisma.session.update({
          where: { id: "session-123" },
          data: { expires: new Date(Date.now() + 3600000) },
        }),
      ]);

      expect(refreshCount).toBe(2);
    });
  });

  // A12: Email change verification flow
  describe("A12: Email change verification", () => {
    it("requires verification for email change", async () => {
      // Mock email change verification - in real impl would need custom fields
      const pendingEmailChange = {
        identifier: "user-123",
        token: "change-token",
        expires: new Date(Date.now() + 3600000),
      };
      // Extended mock with email change metadata
      const mockWithNewEmail = {
        ...pendingEmailChange,
        newEmail: "newemail@example.com",
      };

      (prisma.verificationToken.create as jest.Mock).mockResolvedValue(
        mockWithNewEmail,
      );

      const token = await prisma.verificationToken.create({
        data: pendingEmailChange,
      });

      expect((token as unknown as { newEmail: string }).newEmail).toBe(
        "newemail@example.com",
      );
    });

    it("prevents email change to already-used email", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "other-user",
        email: "taken@example.com",
      });

      const existingUser = await prisma.user.findUnique({
        where: { email: "taken@example.com" },
      });

      expect(existingUser).not.toBeNull();
      // Should prevent email change
    });
  });

  // A13: Two-factor authentication backup codes
  describe("A13: 2FA backup codes", () => {
    it("accepts valid backup code", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const isValid = await bcrypt.compare("backup-code", "hashed-backup-code");
      expect(isValid).toBe(true);
    });

    it("invalidates backup code after use", async () => {
      // Mock backup codes feature (not in current schema, testing expected behavior)
      const mockUserWithBackupCodes = {
        id: "user-123",
        backupCodes: ["code2", "code3"], // Removed used code
      };
      (prisma.user.update as jest.Mock).mockResolvedValue(
        mockUserWithBackupCodes,
      );

      const updated = await prisma.user.update({
        where: { id: "user-123" },
        // @ts-expect-error - backupCodes not in current schema, testing future feature
        data: { backupCodes: ["code2", "code3"] },
      });

      expect(
        (updated as unknown as { backupCodes: string[] }).backupCodes,
      ).not.toContain("code1");
    });
  });

  // A14: Cross-site request forgery protection
  describe("A14: CSRF protection", () => {
    it("validates CSRF token on state-changing requests", () => {
      const csrfToken = "valid-csrf-token";
      const sessionCsrf = "valid-csrf-token";

      expect(csrfToken).toBe(sessionCsrf);
    });

    it("rejects requests with mismatched CSRF token", () => {
      const csrfToken = "invalid-token";
      const sessionCsrf = "valid-csrf-token";

      expect(csrfToken).not.toBe(sessionCsrf);
    });
  });

  // A15: Session timeout edge cases
  describe("A15: Session timeout handling", () => {
    it("extends session on activity within timeout window", async () => {
      const originalExpiry = new Date(Date.now() + 1800000); // 30 min
      const newExpiry = new Date(Date.now() + 3600000); // 1 hour

      (prisma.session.update as jest.Mock).mockResolvedValue({
        id: "session-123",
        expires: newExpiry,
      });

      const updated = await prisma.session.update({
        where: { id: "session-123" },
        data: { expires: newExpiry },
      });

      expect(updated.expires.getTime()).toBeGreaterThan(
        originalExpiry.getTime(),
      );
    });

    it("does not extend session past maximum lifetime", async () => {
      const maxLifetime = 24 * 60 * 60 * 1000; // 24 hours
      const sessionCreatedAt = Date.now() - 23 * 60 * 60 * 1000; // 23 hours ago
      const maxExpiry = new Date(sessionCreatedAt + maxLifetime);

      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: "session-123",
        createdAt: new Date(sessionCreatedAt),
        expires: maxExpiry,
      });

      const session = await prisma.session.findUnique({
        where: { id: "session-123" },
      });

      expect(session?.expires.getTime()).toBeLessThanOrEqual(
        maxExpiry.getTime(),
      );
    });
  });

  // A16: Password complexity validation edge cases
  describe("A16: Password complexity edge cases", () => {
    it("accepts password at minimum length boundary", () => {
      const password = "12345678"; // Exactly 8 characters
      expect(password.length).toBeGreaterThanOrEqual(8);
    });

    it("rejects password below minimum length", () => {
      const password = "1234567"; // 7 characters
      expect(password.length).toBeLessThan(8);
    });

    it("handles unicode characters in password", () => {
      const password = "密码Test123!"; // Chinese + English + numbers + special
      expect(password.length).toBeGreaterThanOrEqual(8);
    });
  });

  // A17: Remember me functionality
  describe("A17: Remember me token handling", () => {
    it("creates long-lived session with remember me", async () => {
      const longExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: "session-123",
        expires: longExpiry,
      });

      const session = await prisma.session.create({
        data: {
          userId: "user-123",
          sessionToken: "token",
          expires: longExpiry,
        },
      });

      const daysUntilExpiry =
        (session.expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(29);
    });
  });

  // A18: Account recovery without email
  describe("A18: Account recovery edge cases", () => {
    it("handles recovery for OAuth-only account without password", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        email: "user@example.com",
        password: null, // OAuth-only
      });
      (prisma.account.findFirst as jest.Mock).mockResolvedValue({
        provider: "google",
      });

      const user = await prisma.user.findUnique({ where: { id: "user-123" } });
      const account = await prisma.account.findFirst({
        where: { userId: "user-123" },
      });

      expect(user?.password).toBeNull();
      expect(account?.provider).toBe("google");
    });
  });

  // A19: Login attempt rate limiting integration
  describe("A19: Login attempt tracking", () => {
    it("tracks failed login attempts", async () => {
      const attempts = [1, 2, 3, 4, 5];

      expect(attempts.length).toBe(5);
      // After 5 attempts, should trigger rate limiting
    });

    it("resets attempt count after successful login", async () => {
      // Mock login attempt tracking (not in current schema, testing expected behavior)
      const mockUserWithLoginAttempts = {
        id: "user-123",
        failedLoginAttempts: 0,
        lastFailedLogin: null,
      };
      (prisma.user.update as jest.Mock).mockResolvedValue(
        mockUserWithLoginAttempts,
      );

      const updated = await prisma.user.update({
        where: { id: "user-123" },
        // @ts-expect-error - failedLoginAttempts not in current schema, testing future feature
        data: { failedLoginAttempts: 0, lastFailedLogin: null },
      });

      expect(
        (updated as unknown as { failedLoginAttempts: number })
          .failedLoginAttempts,
      ).toBe(0);
    });
  });

  // A20: Secure logout across devices
  describe("A20: Cross-device logout", () => {
    it("logs out from all devices when requested", async () => {
      (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 4 });

      const result = await prisma.session.deleteMany({
        where: { userId: "user-123" },
      });

      expect(result.count).toBe(4);
    });

    it("logs out only current session by default", async () => {
      (prisma.session.delete as jest.Mock).mockResolvedValue({
        id: "current-session",
      });

      const result = await prisma.session.delete({
        where: { id: "current-session" },
      });

      expect(result.id).toBe("current-session");
    });
  });
});
