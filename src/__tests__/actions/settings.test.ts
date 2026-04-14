/**
 * Tests for settings server actions
 */

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        passwordResetToken: {
          deleteMany: (prisma as any).passwordResetToken.deleteMany,
        },
        user: {
          update: (prisma as any).user.update,
        },
      };
      return fn(tx);
    }),
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

// Mock rate limiting to allow all requests
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 10, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    changePassword: { limit: 5, windowMs: 3600000 },
    verifyPassword: { limit: 10, windowMs: 3600000 },
    deleteAccount: { limit: 3, windowMs: 86400000 },
  },
}));

// Mock next/headers
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

jest.mock("@/lib/auth-helpers", () => ({
  invalidateLiveSecurityStatusCache: jest.fn(),
}));

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  changePassword,
  deleteAccount,
  getUserSettings,
} from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { invalidateLiveSecurityStatusCache } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";

describe("settings actions", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
    // P0-5: Fresh authTime for OAuth account deletion tests
    authTime: Math.floor(Date.now() / 1000),
  };

  const defaultPreferences = {
    emailBookingRequests: true,
    emailBookingUpdates: true,
    emailMessages: true,
    emailReviews: true,
    emailSearchAlerts: true,
    emailMarketing: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          passwordResetToken: {
            deleteMany: (...args: unknown[]) =>
              (prisma.passwordResetToken.deleteMany as jest.Mock)(...args),
          },
          user: {
            update: (...args: unknown[]) =>
              (prisma.user.update as jest.Mock)(...args),
          },
        };
        return fn(tx);
      }
    );
  });

  describe("getNotificationPreferences", () => {
    it("returns default preferences when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getNotificationPreferences();

      expect(result).toEqual(defaultPreferences);
    });

    it("returns default preferences when user has no preferences set", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        notificationPreferences: null,
      });

      const result = await getNotificationPreferences();

      expect(result).toEqual(defaultPreferences);
    });

    it("returns user preferences merged with defaults", async () => {
      const customPrefs = {
        emailMarketing: true,
        emailMessages: false,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        notificationPreferences: customPrefs,
      });

      const result = await getNotificationPreferences();

      expect(result).toEqual({
        ...defaultPreferences,
        ...customPrefs,
      });
    });

    it("returns complete preferences object", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        notificationPreferences: defaultPreferences,
      });

      const result = await getNotificationPreferences();

      expect(result).toHaveProperty("emailBookingRequests");
      expect(result).toHaveProperty("emailBookingUpdates");
      expect(result).toHaveProperty("emailMessages");
      expect(result).toHaveProperty("emailReviews");
      expect(result).toHaveProperty("emailSearchAlerts");
      expect(result).toHaveProperty("emailMarketing");
    });
  });

  describe("updateNotificationPreferences", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await updateNotificationPreferences(defaultPreferences);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not authenticated");
    });

    it("updates preferences successfully", async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      const newPrefs = { ...defaultPreferences, emailMarketing: true };
      const result = await updateNotificationPreferences(newPrefs);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { notificationPreferences: newPrefs },
      });
    });

    it("revalidates /settings path", async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await updateNotificationPreferences(defaultPreferences);

      expect(revalidatePath).toHaveBeenCalledWith("/settings");
    });

    it("returns error on database failure", async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await updateNotificationPreferences(defaultPreferences);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to update preferences");
    });

    it("rejects extra properties via .strict() (G5.3)", async () => {
      const prefsWithExtra = {
        ...defaultPreferences,
        extraField: true,
      } as unknown as Parameters<typeof updateNotificationPreferences>[0];

      const result = await updateNotificationPreferences(prefsWithExtra);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid notification preferences");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("changePassword", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await changePassword("oldpass", "newpass123!!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not authenticated");
    });

    it("returns error when new password is too short", async () => {
      const result = await changePassword("oldpass", "12345");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Password must be between 12 and 128 characters"
      );
    });

    it("returns error when user has no password (OAuth account)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
        email: "test@example.com",
      });

      const result = await changePassword("oldpass", "newpass123!!");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Password login not available for this account"
      );
    });

    it("returns error when current password is incorrect", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
        email: "test@example.com",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await changePassword("wrongpass", "newpass123!!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Current password is incorrect");
    });

    it("validates current password with bcrypt.compare", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
        email: "test@example.com",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await changePassword("correctpass", "newpass123!!");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpass",
        "hashedpassword"
      );
    });

    it("runs the password change inside a transaction", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
        email: "test@example.com",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await changePassword("correctpass", "newpass123!!");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect((bcrypt.hash as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (prisma.$transaction as jest.Mock).mock.invocationCallOrder[0]
      );
    });

    it("updates user password in database", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
        email: "test@example.com",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 2,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await changePassword("correctpass", "newpass123!!");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { password: "newhashed", passwordChangedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(invalidateLiveSecurityStatusCache).toHaveBeenCalledWith(
        "user-123"
      );
      expect(result.success).toBe(true);
    });

    it("skips reset token revocation when the user has no email", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
        email: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await changePassword("correctpass", "newpass123!!");

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(invalidateLiveSecurityStatusCache).toHaveBeenCalledWith(
        "user-123"
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { password: "newhashed", passwordChangedAt: expect.any(Date) },
      });
    });

    it("returns error on database failure", async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await changePassword("correctpass", "newpass123!!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to change password");
    });
  });

  describe("deleteAccount", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not authenticated");
    });

    it("deletes user from database for OAuth user (no password)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: "user-123" });

      await deleteAccount();

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: "user-123" },
      });
    });

    it("returns success: true on successful deletion for OAuth user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await deleteAccount();

      expect(result.success).toBe(true);
    });

    it("requires password for users with password set", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password is required to delete your account");
    });

    it("returns error when password is incorrect", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await deleteAccount("wrongpassword");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password is incorrect");
    });

    it("deletes user when password is correct", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await deleteAccount("correctpassword");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpassword",
        "hashedpassword"
      );
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: "user-123" },
      });
      expect(result.success).toBe(true);
    });

    it("returns error on database failure", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });
      (prisma.user.delete as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to delete account");
    });

    it("requires re-authentication for OAuth user with stale session", async () => {
      // P0-5: Session older than 5 minutes should be rejected for OAuth users
      (auth as jest.Mock).mockResolvedValue({
        ...mockSession,
        authTime: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.code).toBe("SESSION_FRESHNESS_REQUIRED");
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("requires re-authentication for OAuth user with no authTime", async () => {
      // P0-5: Sessions without authTime (pre-existing) should require re-auth
      (auth as jest.Mock).mockResolvedValue({
        user: mockSession.user,
        // No authTime field
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.code).toBe("SESSION_FRESHNESS_REQUIRED");
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("getUserSettings", () => {
    it("returns null when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getUserSettings();

      expect(result).toBeNull();
    });

    it("returns null when user not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getUserSettings();

      expect(result).toBeNull();
    });

    it("returns user data with hasPassword flag", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        password: "hashedpassword",
        notificationPreferences: null,
      });

      const result = await getUserSettings();

      expect(result).not.toBeNull();
      expect(result?.hasPassword).toBe(true);
    });

    it("returns hasPassword as false for OAuth users", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        password: null,
        notificationPreferences: null,
      });

      const result = await getUserSettings();

      expect(result?.hasPassword).toBe(false);
    });

    it("returns merged notification preferences", async () => {
      const customPrefs = { emailMarketing: true };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        password: "hash",
        notificationPreferences: customPrefs,
      });

      const result = await getUserSettings();

      expect(result?.notificationPreferences).toEqual({
        ...defaultPreferences,
        ...customPrefs,
      });
    });
  });
});
