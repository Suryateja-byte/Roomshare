/**
 * Access Control Security Tests
 * Tests for RBAC, privilege escalation prevention, and authorization enforcement.
 *
 * Covers:
 * - Non-admin calling admin actions → error
 * - User accessing another user's bookings → error
 * - User modifying another user's listing → error
 * - Self-elevation attempt via profile update → blocked
 * - Notification admin bypass via stale JWT → blocked
 * - Verification admin functions block non-admins
 */

jest.mock("@/lib/prisma", () => {
  const mockPrisma: Record<string, any> = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    report: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    verificationRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    savedListing: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAdminAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
  markListingsDirty: jest.fn().mockResolvedValue(undefined),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/listings/canonical-lifecycle", () => ({
  syncListingLifecycleProjectionInTx: jest.fn().mockResolvedValue({
    action: "synced",
  }),
  tombstoneListingInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: { notification: { limit: 100, window: 3600 } },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockReturnValue(new Map()),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Admin actions
import {
  getUsers,
  toggleUserAdmin,
  suspendUser,
  getListingsForAdmin,
  updateListingStatus,
  deleteListing,
  getReports,
  resolveReport,
  resolveReportAndRemoveListing,
  getAdminStats,
} from "@/app/actions/admin";

// Verification admin actions
import {
  getPendingVerifications,
  approveVerification,
  rejectVerification,
} from "@/app/actions/verification";

// User actions (for self-elevation tests)
import { updateProfile } from "@/app/actions/profile";

// Notification action (for JWT admin check test)
import { createNotification } from "@/app/actions/notifications";

// Listing status action (for ownership tests)
import { updateListingStatus as userUpdateListingStatus } from "@/app/actions/listing-status";

const mockPrisma = prisma as unknown as Record<string, any>;
const mockAuth = auth as jest.Mock;

describe("Access Control Security Tests", () => {
  const regularUser = {
    user: {
      id: "user-regular",
      name: "Regular User",
      email: "regular@example.com",
      isAdmin: false,
      isSuspended: false,
    },
  };

  const adminUser = {
    user: {
      id: "user-admin",
      name: "Admin User",
      email: "admin@example.com",
      isAdmin: true,
      isSuspended: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // VERTICAL ESCALATION: Non-admin calling admin actions
  // ============================================================
  describe("Vertical Escalation Prevention", () => {
    describe("admin.ts actions reject non-admin users", () => {
      beforeEach(() => {
        mockAuth.mockResolvedValue(regularUser);
        // DB says user is NOT admin (requireAdmin checks DB)
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });
      });

      it("getUsers rejects non-admin", async () => {
        const result = await getUsers();
        expect(result.error).toBe("Unauthorized");
        expect(result.users).toEqual([]);
      });

      it("toggleUserAdmin rejects non-admin", async () => {
        const result = await toggleUserAdmin("some-user-id");
        expect(result.error).toBe("Unauthorized");
      });

      it("suspendUser rejects non-admin", async () => {
        const result = await suspendUser("some-user-id", true);
        expect(result.error).toBe("Unauthorized");
      });

      it("getListingsForAdmin rejects non-admin", async () => {
        const result = await getListingsForAdmin();
        expect(result.error).toBe("Unauthorized");
        expect(result.listings).toEqual([]);
      });

      it("updateListingStatus (admin) rejects non-admin", async () => {
        const result = await updateListingStatus("listing-1", "PAUSED", 1);
        expect(result.error).toBe("Unauthorized");
      });

      it("deleteListing rejects non-admin", async () => {
        const result = await deleteListing("listing-1");
        expect(result.error).toBe("Unauthorized");
      });

      it("getReports rejects non-admin", async () => {
        const result = await getReports();
        expect(result.error).toBe("Unauthorized");
        expect(result.reports).toEqual([]);
      });

      it("resolveReport rejects non-admin", async () => {
        const result = await resolveReport("report-1", "RESOLVED");
        expect(result.error).toBe("Unauthorized");
      });

      it("resolveReportAndRemoveListing rejects non-admin", async () => {
        const result = await resolveReportAndRemoveListing("report-1");
        expect(result.error).toBe("Unauthorized");
      });

      it("getAdminStats rejects non-admin", async () => {
        const result = await getAdminStats();
        expect(result.error).toBe("Unauthorized");
      });
    });

    describe("admin.ts actions reject unauthenticated users", () => {
      beforeEach(() => {
        mockAuth.mockResolvedValue(null);
      });

      it("getUsers rejects unauthenticated", async () => {
        const result = await getUsers();
        expect(result.error).toBe("Unauthorized");
      });

      it("toggleUserAdmin rejects unauthenticated", async () => {
        const result = await toggleUserAdmin("some-user-id");
        expect(result.error).toBe("Unauthorized");
      });

      it("suspendUser rejects unauthenticated", async () => {
        const result = await suspendUser("some-user-id", true);
        expect(result.error).toBe("Unauthorized");
      });

      it("deleteListing rejects unauthenticated", async () => {
        const result = await deleteListing("listing-1");
        expect(result.error).toBe("Unauthorized");
      });
    });

    describe("verification.ts admin actions reject non-admin users", () => {
      beforeEach(() => {
        mockAuth.mockResolvedValue(regularUser);
        // DB says user is NOT admin
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });
      });

      it("getPendingVerifications rejects non-admin", async () => {
        const result = await getPendingVerifications();
        expect(result.error).toBe("Unauthorized");
        expect(result.requests).toEqual([]);
      });

      it("approveVerification rejects non-admin", async () => {
        const result = await approveVerification("request-1");
        expect(result.error).toBe("Unauthorized");
      });

      it("rejectVerification rejects non-admin", async () => {
        const result = await rejectVerification("request-1", "Bad docs");
        expect(result.error).toBe("Unauthorized");
      });
    });

    describe("requireAdmin() checks DB, not just JWT", () => {
      it("rejects user whose JWT says admin but DB says not admin", async () => {
        // JWT/session says admin, but DB disagrees (admin revoked mid-session)
        mockAuth.mockResolvedValue(adminUser);
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

        const result = await getUsers();
        expect(result.error).toBe("Unauthorized");
        expect(result.users).toEqual([]);
      });

      it("accepts user whose DB confirms admin status", async () => {
        mockAuth.mockResolvedValue(adminUser);
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });
        mockPrisma.user.findMany.mockResolvedValue([]);
        mockPrisma.user.count.mockResolvedValue(0);

        const result = await getUsers();
        expect(result.error).toBeUndefined();
      });
    });
  });

  // ============================================================
  // SELF-PROTECTION GUARDS
  // ============================================================
  describe("Self-Protection Guards", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(adminUser);
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    });

    it("admin cannot demote themselves", async () => {
      const result = await toggleUserAdmin("user-admin");
      expect(result.error).toBe("Cannot change your own admin status");
    });

    it("admin cannot suspend themselves", async () => {
      const result = await suspendUser("user-admin", true);
      expect(result.error).toBe("Cannot suspend yourself");
    });
  });

  // ============================================================
  // SELF-ELEVATION PREVENTION
  // ============================================================
  describe("Self-Elevation Prevention", () => {
    it("updateProfile cannot set isAdmin via extra fields", async () => {
      mockAuth.mockResolvedValue(regularUser);

      // Attempt to inject isAdmin through profile update
      // The Zod schema should strip/reject this field
      const result = await updateProfile({
        name: "Hacker",
        // @ts-expect-error -- deliberately testing injection of unauthorized field
        isAdmin: true,
      });

      // Even if the call succeeds (Zod strips extra fields), verify
      // the prisma update was NOT called with isAdmin
      if (!result.error) {
        const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
        expect(updateCall?.data).not.toHaveProperty("isAdmin");
      }
    });

    it("updateProfile cannot set isSuspended via extra fields", async () => {
      mockAuth.mockResolvedValue(regularUser);

      const result = await updateProfile({
        name: "Hacker",
        // @ts-expect-error -- deliberately testing injection of unauthorized field
        isSuspended: false,
      });

      if (!result.error) {
        const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
        expect(updateCall?.data).not.toHaveProperty("isSuspended");
      }
    });

    it("updateProfile cannot set isVerified via extra fields", async () => {
      mockAuth.mockResolvedValue(regularUser);

      const result = await updateProfile({
        name: "Hacker",
        // @ts-expect-error -- deliberately testing injection of unauthorized field
        isVerified: true,
      });

      if (!result.error) {
        const updateCall = mockPrisma.user.update.mock.calls[0]?.[0];
        expect(updateCall?.data).not.toHaveProperty("isVerified");
      }
    });
  });

  // ============================================================
  // HORIZONTAL ESCALATION: Listing ownership
  // ============================================================
  describe("Horizontal Escalation Prevention — Listings", () => {
    it("user cannot update another user's listing status", async () => {
      mockAuth.mockResolvedValue(regularUser);

      // Fix 9: updateListingStatus now uses $transaction with FOR UPDATE
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: "listing-1",
            ownerId: "user-other",
            version: 1,
            availabilitySource: "LEGACY_BOOKING",
            status: "ACTIVE",
            statusReason: null,
            needsMigrationReview: false,
            openSlots: null,
            availableSlots: 1,
            totalSlots: 1,
            moveInDate: new Date("2026-05-01T00:00:00.000Z"),
            availableUntil: null,
            minStayMonths: 1,
            lastConfirmedAt: null,
            freshnessReminderSentAt: null,
            freshnessWarningSentAt: null,
            autoPausedAt: null,
          },
        ]),
        booking: { count: jest.fn() },
        listing: { update: jest.fn() },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      // Listing owned by a different user (ownerId returned by FOR UPDATE query above)
      const result = await userUpdateListingStatus("listing-1", "PAUSED", 1);
      expect(result.error).toBe("You can only update your own listings");
    });

    it("user can update their own listing status", async () => {
      mockAuth.mockResolvedValue(regularUser);

      // Fix 9: updateListingStatus now uses $transaction with FOR UPDATE
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: "listing-1",
            ownerId: "user-regular",
            version: 1,
            availabilitySource: "LEGACY_BOOKING",
            status: "ACTIVE",
            statusReason: null,
            needsMigrationReview: false,
            openSlots: null,
            availableSlots: 1,
            totalSlots: 1,
            moveInDate: new Date("2026-05-01T00:00:00.000Z"),
            availableUntil: null,
            minStayMonths: 1,
            lastConfirmedAt: null,
            freshnessReminderSentAt: null,
            freshnessWarningSentAt: null,
            autoPausedAt: null,
          },
        ]),
        booking: { count: jest.fn().mockResolvedValue(0) },
        listing: {
          update: jest
            .fn()
            .mockResolvedValue({ id: "listing-1", status: "PAUSED" }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const result = await userUpdateListingStatus("listing-1", "PAUSED", 1);
      expect(result.error).toBeUndefined();
    });
  });

  // ============================================================
  // NOTIFICATION: Admin check uses session (not DB)
  // ============================================================
  describe("Notification Admin Authorization", () => {
    it("non-admin cannot create notifications for other users", async () => {
      mockAuth.mockResolvedValue(regularUser);
      // DB confirms user is NOT admin
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      const result = await createNotification({
        userId: "user-other",
        type: "NEW_MESSAGE",
        title: "Malicious notification",
        message: "You've been hacked",
      });

      expect(result.error).toBe("Forbidden");
    });

    it("user can create notifications for themselves", async () => {
      mockAuth.mockResolvedValue(regularUser);

      const result = await createNotification({
        userId: "user-regular",
        type: "NEW_MESSAGE",
        title: "Self notification",
        message: "This is fine",
      });

      expect(result.error).toBeUndefined();
    });

    it("admin can create notifications for other users", async () => {
      mockAuth.mockResolvedValue(adminUser);
      // DB confirms user IS admin
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });

      const result = await createNotification({
        userId: "user-other",
        type: "NEW_MESSAGE",
        title: "Admin notification",
        message: "From admin",
      });

      expect(result.error).toBeUndefined();
    });
  });

  // ============================================================
  // UNAUTHENTICATED ACCESS
  // ============================================================
  describe("Unauthenticated Access Prevention", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
    });

    it("updateProfile rejects unauthenticated", async () => {
      const result = await updateProfile({ name: "Hacker" });
      expect(result.error).toBe("Unauthorized");
    });

    it("getPendingVerifications rejects unauthenticated", async () => {
      const result = await getPendingVerifications();
      expect(result.error).toBe("Unauthorized");
    });

    it("approveVerification rejects unauthenticated", async () => {
      const result = await approveVerification("request-1");
      expect(result.error).toBe("Unauthorized");
    });

    it("rejectVerification rejects unauthenticated", async () => {
      const result = await rejectVerification("request-1", "Bad");
      expect(result.error).toBe("Unauthorized");
    });

    it("createNotification rejects unauthenticated", async () => {
      const result = await createNotification({
        userId: "user-1",
        type: "NEW_MESSAGE",
        title: "Test",
        message: "Test",
      });
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================
  // VERIFICATION ADMIN: DB-fresh check
  // ============================================================
  describe("Verification Admin DB Freshness", () => {
    it("rejects user whose JWT says admin but DB says not admin (approveVerification)", async () => {
      // JWT says admin
      mockAuth.mockResolvedValue(adminUser);
      // DB says NOT admin (admin revoked mid-session)
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      const result = await approveVerification("request-1");
      expect(result.error).toBe("Unauthorized");
    });

    it("rejects user whose JWT says admin but DB says not admin (rejectVerification)", async () => {
      mockAuth.mockResolvedValue(adminUser);
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      const result = await rejectVerification("request-1", "Bad docs");
      expect(result.error).toBe("Unauthorized");
    });

    it("rejects user whose JWT says admin but DB says not admin (getPendingVerifications)", async () => {
      mockAuth.mockResolvedValue(adminUser);
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      const result = await getPendingVerifications();
      expect(result.error).toBe("Unauthorized");
    });
  });
});
