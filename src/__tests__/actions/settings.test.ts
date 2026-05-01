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
    account: { deleteMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    listing: {
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    report: {
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: { deleteMany: jest.fn() },
    conversationDeletion: { deleteMany: jest.fn() },
    typingStatus: { deleteMany: jest.fn() },
    blockedUser: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    recentlyViewed: { deleteMany: jest.fn() },
    savedListing: { deleteMany: jest.fn() },
    alertDelivery: { deleteMany: jest.fn() },
    alertSubscription: { deleteMany: jest.fn() },
    savedSearch: { deleteMany: jest.fn() },
    verificationUpload: { deleteMany: jest.fn() },
    verificationRequest: { deleteMany: jest.fn() },
    review: { deleteMany: jest.fn() },
    hostContactChannel: { deleteMany: jest.fn() },
    publicCachePushSubscription: { deleteMany: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn() },
    verificationToken: { deleteMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
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

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/listings/canonical-lifecycle", () => ({
  syncListingLifecycleProjectionInTx: jest.fn().mockResolvedValue({
    action: "synced",
  }),
  tombstoneCanonicalInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
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
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { Prisma } from "@prisma/client";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneCanonicalInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";

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
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma)
    );
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: "user-123" }])
      .mockResolvedValueOnce([]);
    (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);

    for (const delegate of [
      prisma.account,
      prisma.session,
      prisma.listing,
      prisma.message,
      prisma.conversationDeletion,
      prisma.typingStatus,
      prisma.blockedUser,
      prisma.notification,
      prisma.recentlyViewed,
      prisma.savedListing,
      prisma.alertDelivery,
      prisma.alertSubscription,
      prisma.savedSearch,
      prisma.verificationUpload,
      prisma.verificationRequest,
      prisma.review,
      prisma.hostContactChannel,
      prisma.publicCachePushSubscription,
      prisma.passwordResetToken,
      prisma.verificationToken,
    ]) {
      for (const value of Object.values(delegate)) {
        if (typeof value === "function") {
          (value as jest.Mock).mockResolvedValue({ count: 0 });
        }
      }
    }
    (prisma.listing.update as jest.Mock).mockResolvedValue({});
    (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });
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
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await changePassword("wrongpass", "newpass123!!");

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

      await changePassword("correctpass", "newpass123!!");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpass",
        "hashedpassword"
      );
    });

    it("hashes new password with bcrypt", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      await changePassword("correctpass", "newpass123!!");

      expect(bcrypt.hash).toHaveBeenCalledWith("newpass123!!", 12);
    });

    it("updates user password in database", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("newhashed");
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: "user-123" });

      const result = await changePassword("correctpass", "newpass123!!");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { password: "newhashed", passwordChangedAt: expect.any(Date) },
      });
      expect(result.success).toBe(true);
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

    it("tombstones user instead of deleting row for OAuth user (no password)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });

      await deleteAccount();

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: expect.objectContaining({
          name: "Deleted User",
          email: null,
          password: null,
          isSuspended: true,
          isAdmin: false,
          isVerified: false,
        }),
      });
    });

    it("returns success: true on successful tombstone for OAuth user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });

      const result = await deleteAccount();

      expect(result.success).toBe(true);
      expect(result).toEqual({ success: true });
    });

    it("requires password for users with password set", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: "hashedpassword",
      });

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password is required to delete your account");
    });

    it("returns error when password is incorrect", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await deleteAccount("wrongpassword");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password is incorrect");
    });

    it("tombstones user when password is correct", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: "hashedpassword",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await deleteAccount("correctpassword");

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpassword",
        "hashedpassword"
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: expect.objectContaining({
          email: null,
          password: null,
          isAdmin: false,
          isSuspended: true,
        }),
      });
      expect(result.success).toBe(true);
    });

    it("returns error on database failure", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("DB Error"));

      const result = await deleteAccount();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to delete account");
    });

    it("suppresses reported owner listings and preserves report evidence", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });
      (prisma.$queryRaw as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce([{ id: "user-123" }])
        .mockResolvedValueOnce([
          { id: "reported-listing", version: 4 },
          { id: "clean-listing", version: 2 },
        ]);
      (prisma.report.groupBy as jest.Mock).mockResolvedValue([
        { listingId: "reported-listing", _count: { _all: 1 } },
      ]);

      const result = await deleteAccount();

      expect(result).toEqual({ success: true });
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.report.deleteMany).not.toHaveBeenCalled();
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "reported-listing" },
        data: {
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 5,
        },
      });
      expect(markListingDirtyInTx).toHaveBeenCalledWith(
        prisma,
        "reported-listing",
        "status_changed"
      );
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        prisma,
        "reported-listing",
        { role: "host", id: "user-123" }
      );
      expect(prisma.listing.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["clean-listing"] } },
      });
      expect(tombstoneCanonicalInventoryInTx).toHaveBeenCalledWith(
        prisma,
        "clean-listing",
        "TOMBSTONE"
      );
    });

    it("hard-deletes unreported owner listings", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });
      (prisma.$queryRaw as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce([{ id: "user-123" }])
        .mockResolvedValueOnce([
          { id: "clean-listing-1", version: 1 },
          { id: "clean-listing-2", version: 3 },
        ]);
      (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await deleteAccount();

      expect(result).toEqual({ success: true });
      expect(prisma.listing.update).not.toHaveBeenCalled();
      expect(markListingDirtyInTx).not.toHaveBeenCalled();
      expect(tombstoneCanonicalInventoryInTx).toHaveBeenCalledWith(
        prisma,
        "clean-listing-1",
        "TOMBSTONE"
      );
      expect(tombstoneCanonicalInventoryInTx).toHaveBeenCalledWith(
        prisma,
        "clean-listing-2",
        "TOMBSTONE"
      );
      expect(prisma.listing.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["clean-listing-1", "clean-listing-2"] } },
      });
    });

    it("does not delete listings when the user has no owned listings", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });

      await deleteAccount();

      expect(prisma.report.groupBy).not.toHaveBeenCalled();
      expect(prisma.listing.deleteMany).not.toHaveBeenCalled();
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });

    it("preserves submitted reports by tombstoning reporter accounts", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "reporter@example.com",
        password: null,
      });

      const result = await deleteAccount();

      expect(result).toEqual({ success: true });
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.report.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: expect.objectContaining({
          name: "Deleted User",
          email: null,
          isSuspended: true,
        }),
      });
    });

    it("clears credentials and non-evidence personal state during tombstone", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
        password: null,
      });

      await deleteAccount();

      expect(prisma.account.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { identifier: "test@example.com" },
      });
      expect(prisma.savedListing.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(prisma.savedSearch.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
      });
      expect(prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { senderId: "user-123" },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: expect.objectContaining({
          email: null,
          emailVerified: null,
          password: null,
          image: null,
          bio: null,
          notificationPreferences: Prisma.DbNull,
          conversations: { set: [] },
        }),
      });
    });

    it("requires re-authentication for OAuth user with stale session", async () => {
      // P0-5: Session older than 5 minutes should be rejected for OAuth users
      (auth as jest.Mock).mockResolvedValue({
        ...mockSession,
        authTime: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        email: "test@example.com",
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
        email: "test@example.com",
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
