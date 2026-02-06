/**
 * Tests for settings server actions
 */

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
import bcrypt from "bcryptjs";

describe("settings actions", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
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
        new Error("DB Error"),
      );

      const result = await updateNotificationPreferences(defaultPreferences);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to update preferences");
    });
  });

  describe("changePassword", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await changePassword("oldpass", "newpass123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not authenticated");
    });

    it("returns error when new password is too short", async () => {
      const result = await changePassword("oldpass", "12345");

      expect(result.success).toBe(false);
      expect(result.error).toBe("New password must be at least 12 characters");
    });

    it("returns error when user has no password (OAuth account)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const result = await changePassword("oldpass", "newpass123");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Password login not available for this account",
      );
    });

    it("returns error when current password is incorrect", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await changePassword("wrongpass", "newpass123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Current password is incorrect");
    });

    it("validates current password with bcrypt.compare", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await changePassword("correctpass", "newpass123");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpass",
        "hashedpassword",
      );
    });

    it("hashes new password with bcrypt", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await changePassword("correctpass", "newpass123");

      expect(bcrypt.hash).toHaveBeenCalledWith("newpass123", 10);
    });

    it("updates user password in database", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await changePassword("correctpass", "newpass123");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { password: "newhashed" },
      });
      expect(result.success).toBe(true);
    });

    it("returns error on database failure", async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error"),
      );

      const result = await changePassword("correctpass", "newpass123");

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
        "hashedpassword",
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
        new Error("DB Error"),
      );

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to delete account");
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
