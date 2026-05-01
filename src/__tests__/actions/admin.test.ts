/**
 * Tests for admin server actions
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    report: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    verificationRequest: {
      count: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({
    success: true,
    remaining: 19,
    resetAt: new Date(),
  }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    adminWrite: { limit: 20, windowMs: 60_000 },
    adminDelete: { limit: 5, windowMs: 3_600_000 },
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
  tombstoneCanonicalInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
}));

jest.mock("@/lib/payments/contact-restoration", () => ({
  restoreConsumptionsForHostBan: jest.fn().mockResolvedValue({ restored: 0 }),
}));

import {
  getUsers,
  toggleUserAdmin,
  suspendUser,
  getListingsForAdmin,
  updateListingStatus,
  unsuppressListing,
  reviewListingMigration,
  deleteListing,
  getReports,
  resolveReport,
  resolveReportAndRemoveListing,
  getAdminStats,
} from "@/app/actions/admin";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneCanonicalInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";

describe("admin actions", () => {
  const mockAdminSession = {
    user: { id: "admin-123", name: "Admin User", email: "admin@example.com" },
  };

  const mockAdminUser = {
    isAdmin: true,
    isSuspended: false,
  };

  const mockRegularUser = {
    id: "user-123",
    name: "Regular User",
    email: "user@example.com",
    isAdmin: false,
    isSuspended: false,
    isVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockAdminSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser);
  });

  describe("requireAdmin helper", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getUsers();

      expect(result.error).toBe("Unauthorized");
    });

    it("returns error when user is not admin", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isAdmin: false,
        isSuspended: false,
      });

      const result = await getUsers();

      expect(result.error).toBe("Unauthorized");
    });

    it("returns ACCOUNT_SUSPENDED when admin account is suspended", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        isAdmin: true,
        isSuspended: true,
      });

      const result = await getUsers();

      expect(result.error).toBe("Account suspended");
    });

    it("allows admin users", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      const result = await getUsers();

      expect(result.error).toBeUndefined();
    });
  });

  describe("getUsers", () => {
    it("returns users with pagination", async () => {
      const users = [mockRegularUser];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const result = await getUsers({ page: 1, limit: 20 });

      expect(result.users).toEqual(users);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("filters by search term", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await getUsers({ search: "test" });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: "test", mode: "insensitive" } },
              { email: { contains: "test", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });

    it("filters by verified status", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await getUsers({ isVerified: true });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVerified: true }),
        })
      );
    });

    it("filters by admin status", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await getUsers({ isAdmin: true });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isAdmin: true }),
        })
      );
    });

    it("filters by suspended status", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await getUsers({ isSuspended: true });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isSuspended: true }),
        })
      );
    });

    it("returns error on database failure", async () => {
      (prisma.user.findMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await getUsers();

      expect(result.error).toBe("Failed to fetch users");
    });
  });

  describe("toggleUserAdmin", () => {
    it("prevents self-demotion", async () => {
      const result = await toggleUserAdmin("admin-123");

      expect(result.error).toBe("Cannot change your own admin status");
    });

    it("returns error when user not found", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce(null); // user lookup

      const result = await toggleUserAdmin("nonexistent");

      expect(result.error).toBe("User not found");
    });

    it("toggles admin status from false to true", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce({ ...mockRegularUser, isAdmin: false }); // user lookup
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await toggleUserAdmin("user-123");

      expect(result.success).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { isAdmin: true },
      });
    });

    it("toggles admin status from true to false", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce({ ...mockRegularUser, isAdmin: true }); // user lookup
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await toggleUserAdmin("user-123");

      expect(result.success).toBe(true);
      expect(result.isAdmin).toBe(false);
    });

    it("logs admin action", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await toggleUserAdmin("user-123");

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: "admin-123",
          action: "ADMIN_GRANTED",
          targetType: "User",
          targetId: "user-123",
        })
      );
    });

    it("revalidates admin users path", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await toggleUserAdmin("user-123");

      expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    });
  });

  describe("suspendUser", () => {
    it("prevents self-suspension", async () => {
      const result = await suspendUser("admin-123", true);

      expect(result.error).toBe("Cannot suspend yourself");
    });

    it("returns error when user not found", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(null);

      const result = await suspendUser("nonexistent", true);

      expect(result.error).toBe("User not found");
    });

    it("suspends user", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await suspendUser("user-123", true);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { isSuspended: true },
      });
    });

    it("unsuspends user", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce({ ...mockRegularUser, isSuspended: true });
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await suspendUser("user-123", false);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { isSuspended: false },
      });
    });

    it("logs suspend action", async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await suspendUser("user-123", true);

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "USER_SUSPENDED",
        })
      );
    });
  });

  describe("getListingsForAdmin", () => {
    const mockListing = {
      id: "listing-123",
      title: "Test Listing",
      price: 1000,
      status: "ACTIVE",
    };

    it("returns listings with pagination", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([mockListing]);
      (prisma.listing.count as jest.Mock).mockResolvedValue(1);

      const result = await getListingsForAdmin({ page: 1, limit: 20 });

      expect(result.listings).toEqual([mockListing]);
      expect(result.total).toBe(1);
    });

    it("filters by search term", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);

      await getListingsForAdmin({ search: "test" });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: "test", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });

    it("filters by status", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);

      await getListingsForAdmin({ status: "PAUSED" });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "PAUSED" }),
        })
      );
    });

    it("filters by owner", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);

      await getListingsForAdmin({ ownerId: "owner-123" });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: "owner-123" }),
        })
      );
    });
  });

  describe("updateListingStatus", () => {
    function makeStatusListing(
      overrides: Partial<{
        id: string;
        status: "ACTIVE" | "PAUSED" | "RENTED";
        title: string;
        ownerId: string;
        version: number;
        availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
        statusReason: string | null;
        needsMigrationReview: boolean;
        openSlots: number | null;
        availableSlots: number;
        totalSlots: number;
        moveInDate: Date | null;
        availableUntil: Date | null;
        minStayMonths: number;
        lastConfirmedAt: Date | null;
        freshnessReminderSentAt: Date | null;
        freshnessWarningSentAt: Date | null;
        autoPausedAt: Date | null;
        pendingBookingCount: number;
        acceptedBookingCount: number;
        heldBookingCount: number;
        futureInventoryRowCount: number;
        futurePeakReservedLoad: number;
      }> = {}
    ) {
      return {
        id: "listing-123",
        status: "ACTIVE" as const,
        title: "Test Listing",
        ownerId: "owner-123",
        version: 7,
        availabilitySource: "LEGACY_BOOKING" as const,
        statusReason: null,
        needsMigrationReview: false,
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
        freshnessReminderSentAt: null,
        freshnessWarningSentAt: null,
        autoPausedAt: null,
        pendingBookingCount: 0,
        acceptedBookingCount: 0,
        heldBookingCount: 0,
        futureInventoryRowCount: 0,
        futurePeakReservedLoad: 0,
        ...overrides,
      };
    }

    function mockListingStatusTx(
      listingRow: ReturnType<typeof makeStatusListing> | null,
      overrides?: {
        update?: jest.Mock;
      }
    ) {
      const update = overrides?.update ?? jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $queryRaw: jest
              .fn()
              .mockResolvedValue(listingRow ? [listingRow] : []),
            listing: { update },
          })
      );
      return { update };
    }

    it("returns error when listing not found", async () => {
      mockListingStatusTx(null);

      const result = await updateListingStatus("nonexistent", "PAUSED", 7);

      expect(result.error).toBe("Listing not found");
    });

    it("updates listing status", async () => {
      const { update } = mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await updateListingStatus("listing-123", "PAUSED", 7);

      expect(result.success).toBe(true);
      expect(update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: {
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
          version: 8,
        },
      });
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        { role: "moderator", id: "admin-123" }
      );
    });

    it("logs action with previous status", async () => {
      mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await updateListingStatus("listing-123", "PAUSED", 7);

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_HIDDEN",
          details: expect.objectContaining({
            previousStatus: "ACTIVE",
            newStatus: "PAUSED",
          }),
        })
      );
    });

    it("logs LISTING_HIDDEN action for PAUSED status", async () => {
      mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await updateListingStatus("listing-123", "PAUSED", 7);

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LISTING_HIDDEN" })
      );
    });

    it("logs LISTING_RESTORED action for ACTIVE status", async () => {
      mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await updateListingStatus("listing-123", "ACTIVE", 7);

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LISTING_RESTORED" })
      );
    });

    it("logs LISTING_RENTED action for RENTED status", async () => {
      mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await updateListingStatus("listing-123", "RENTED", 7);

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LISTING_RENTED" })
      );
    });

    it("revalidates admin listings path", async () => {
      mockListingStatusTx(makeStatusListing());
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await updateListingStatus("listing-123", "ACTIVE", 7);

      expect(revalidatePath).toHaveBeenCalledWith("/admin/listings");
    });

    it("returns version conflict on stale expectedVersion", async () => {
      mockListingStatusTx(makeStatusListing());

      const result = await updateListingStatus("listing-123", "PAUSED", 6);

      expect(result).toEqual({
        error: "This listing was updated elsewhere. Reload and try again.",
        code: "VERSION_CONFLICT",
      });
    });

    it("requires explicit unsuppress for moderation-locked activation", async () => {
      const { update } = mockListingStatusTx({
        ...makeStatusListing(),
        availabilitySource: "HOST_MANAGED",
        status: "PAUSED",
        statusReason: "ADMIN_PAUSED",
        openSlots: 2,
        availableSlots: 2,
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await updateListingStatus("listing-123", "ACTIVE", 7);

      expect(result).toEqual({
        error:
          "This listing is moderation-locked. Use Unsuppress Listing to restore it.",
        code: "LISTING_REQUIRES_UNSUPPRESS",
        lockReason: "ADMIN_PAUSED",
      });
      expect(update).not.toHaveBeenCalled();
      expect(syncListingLifecycleProjectionInTx).not.toHaveBeenCalled();
    });

    it("ignores retired legacy booking migration flags when activating", async () => {
      mockListingStatusTx({
        ...makeStatusListing(),
        needsMigrationReview: true,
        status: "PAUSED",
      });

      const result = await updateListingStatus("listing-123", "ACTIVE", 7);

      expect(result.success).toBe(true);
    });
  });

  describe("unsuppressListing", () => {
    function makeUnsuppressListing(
      overrides: Partial<{
        id: string;
        status: "ACTIVE" | "PAUSED" | "RENTED";
        title: string;
        ownerId: string;
        version: number;
        statusReason: string | null;
      }> = {}
    ) {
      return {
        id: "listing-123",
        status: "PAUSED" as const,
        title: "Test Listing",
        ownerId: "owner-123",
        version: 7,
        statusReason: "SUPPRESSED",
        ...overrides,
      };
    }

    function mockUnsuppressTx(
      listingRow: ReturnType<typeof makeUnsuppressListing> | null,
      overrides?: { update?: jest.Mock }
    ) {
      const update = overrides?.update ?? jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $queryRaw: jest
              .fn()
              .mockResolvedValue(listingRow ? [listingRow] : []),
            listing: { update },
          })
      );
      return { update };
    }

    it("clears moderation lock, restores active status, syncs projections, and audits", async () => {
      const { update } = mockUnsuppressTx({
        ...makeUnsuppressListing(),
        status: "PAUSED",
        statusReason: "SUPPRESSED",
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await unsuppressListing("listing-123", 7);

      expect(result).toEqual({
        success: true,
        status: "ACTIVE",
        statusReason: null,
        version: 8,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: {
          status: "ACTIVE",
          statusReason: null,
          version: 8,
        },
      });
      expect(markListingDirtyInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        "status_changed"
      );
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        { role: "moderator", id: "admin-123" }
      );
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_RESTORED",
          details: expect.objectContaining({
            previousStatusReason: "SUPPRESSED",
            newStatus: "ACTIVE",
            newStatusReason: null,
            restoredLockReason: "SUPPRESSED",
          }),
        })
      );
    });

    it("does not restore rows without a moderation lock", async () => {
      const { update } = mockUnsuppressTx({
        ...makeUnsuppressListing(),
        status: "PAUSED",
        statusReason: "HOST_PAUSED",
      });

      const result = await unsuppressListing("listing-123", 7);

      expect(result).toEqual({
        error: "This listing is not moderation-locked.",
        code: "LISTING_NOT_MODERATION_LOCKED",
      });
      expect(update).not.toHaveBeenCalled();
      expect(syncListingLifecycleProjectionInTx).not.toHaveBeenCalled();
    });
  });

  describe("reviewListingMigration", () => {
    it("returns the retired migration-review response", async () => {
      const result = await reviewListingMigration("listing-123", 7);

      expect(result).toEqual({
        error:
          "Listing migration review was retired with the contact-first cutover.",
        code: "MIGRATION_REVIEW_RETIRED",
      });
      expect(logAdminAction).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_MIGRATION_REVIEWED",
        })
      );
    });
  });

  describe("deleteListing", () => {
    const mockListing = {
      id: "listing-123",
      title: "Test Listing",
      ownerId: "owner-123",
      status: "ACTIVE",
      statusReason: null,
      version: 3,
    };

    // Helper to set up interactive transaction mock
    function mockInteractiveTx(overrides: Record<string, unknown> = {}) {
      const queryRaw = jest.fn().mockResolvedValue([mockListing]);
      const reportCount = jest.fn().mockResolvedValue(0);
      const listingDelete = jest.fn().mockResolvedValue({});
      const listingUpdate = jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: queryRaw,
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            listing: { delete: listingDelete, update: listingUpdate },
            report: {
              count: reportCount,
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({}),
            },
            ...overrides,
          };
          return fn(tx);
        }
      );
      return { queryRaw, reportCount, listingDelete, listingUpdate };
    }

    it("returns error when listing not found", async () => {
      mockInteractiveTx({
        $queryRaw: jest.fn().mockResolvedValue([]),
      });

      const result = await deleteListing("nonexistent");

      expect(result.error).toBe("Listing not found");
    });

    it("does not block deletion on retired booking-era state", async () => {
      mockInteractiveTx({
        booking: {
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await deleteListing("listing-123");

      expect(result.success).toBe(true);
      expect(result.action).toBe("deleted");
      expect(result.notifiedTenants).toBe(0);
    });

    it("uses interactive transaction with FOR UPDATE lock", async () => {
      mockInteractiveTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await deleteListing("listing-123");

      // Verify interactive transaction was used (function, not array)
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("deletes listing without booking-era tenant notifications", async () => {
      const mockNotifCreateMany = jest.fn().mockResolvedValue({ count: 1 });
      mockInteractiveTx({
        booking: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: "booking-1", tenantId: "tenant-1" }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        notification: { createMany: mockNotifCreateMany },
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await deleteListing("listing-123");

      expect(result.success).toBe(true);
      expect(result.action).toBe("deleted");
      expect(result.notifiedTenants).toBe(0);
      expect(mockNotifCreateMany).not.toHaveBeenCalled();
    });

    it("logs deletion action", async () => {
      mockInteractiveTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await deleteListing("listing-123");

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_DELETED",
        })
      );
    });

    it("hard-deletes unreported listings", async () => {
      const { listingDelete, listingUpdate, reportCount } = mockInteractiveTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await deleteListing("listing-123");

      expect(result.success).toBe(true);
      expect(result.action).toBe("deleted");
      expect(reportCount).toHaveBeenCalledWith({
        where: { listingId: "listing-123" },
      });
      expect(listingDelete).toHaveBeenCalledWith({
        where: { id: "listing-123" },
      });
      expect(tombstoneCanonicalInventoryInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        "TOMBSTONE"
      );
      expect(
        (tombstoneCanonicalInventoryInTx as jest.Mock).mock
          .invocationCallOrder[0]
      ).toBeLessThan(listingDelete.mock.invocationCallOrder[0]);
      expect(listingUpdate).not.toHaveBeenCalled();
      expect(markListingDirtyInTx).not.toHaveBeenCalled();
    });

    it("suppresses reported listings instead of deleting them", async () => {
      const { reportCount, listingDelete, listingUpdate } = mockInteractiveTx();
      reportCount.mockResolvedValue(2);
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await deleteListing("listing-123");

      expect(result).toEqual({
        success: true,
        action: "suppressed",
        notifiedTenants: 0,
        status: "PAUSED",
        statusReason: "SUPPRESSED",
        version: 4,
      });
      expect(listingUpdate).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: {
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 4,
        },
      });
      expect(listingDelete).not.toHaveBeenCalled();
      expect(markListingDirtyInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        "status_changed"
      );
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        { role: "moderator", id: "admin-123" }
      );
    });

    it("logs non-PII suppression details for reported listings", async () => {
      const { reportCount } = mockInteractiveTx();
      reportCount.mockResolvedValue(3);
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await deleteListing("listing-123");

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_HIDDEN",
          targetType: "Listing",
          targetId: "listing-123",
          details: expect.objectContaining({
            previousStatus: "ACTIVE",
            previousStatusReason: null,
            newStatus: "PAUSED",
            newStatusReason: "SUPPRESSED",
            reportCount: 3,
            suppressedDueToAdminDelete: true,
            version: 4,
          }),
        })
      );
      const details = (logAdminAction as jest.Mock).mock.calls[0][0].details;
      expect(details.reason).toBeUndefined();
      expect(details.reporterId).toBeUndefined();
      expect(details.details).toBeUndefined();
    });
  });

  describe("getReports", () => {
    const mockReport = {
      id: "report-123",
      reason: "INAPPROPRIATE",
      status: "OPEN",
    };

    it("returns reports with pagination", async () => {
      (prisma.report.findMany as jest.Mock).mockResolvedValue([mockReport]);
      (prisma.report.count as jest.Mock).mockResolvedValue(1);

      const result = await getReports({ page: 1, limit: 20 });

      expect(result.reports).toEqual([mockReport]);
      expect(result.total).toBe(1);
    });

    it("filters by status", async () => {
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.report.count as jest.Mock).mockResolvedValue(0);

      await getReports({ status: "OPEN" });

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "OPEN" }),
        })
      );
    });
  });

  describe("resolveReport", () => {
    const mockReport = {
      status: "OPEN",
      reason: "INAPPROPRIATE",
      listingId: "listing-123",
      reporterId: "reporter-123",
    };

    function mockResolveReportTx(
      reportRow: typeof mockReport | null = mockReport,
      update = jest.fn().mockResolvedValue({})
    ) {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValue(reportRow ? [reportRow] : []),
            report: { update },
          };
          return fn(tx);
        }
      );
      return { update };
    }

    it("returns error when report not found", async () => {
      mockResolveReportTx(null);

      const result = await resolveReport("nonexistent", "RESOLVED");

      expect(result).toEqual({ error: "Report not found", code: "NOT_FOUND" });
    });

    it("resolves report", async () => {
      const { update } = mockResolveReportTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await resolveReport("report-123", "RESOLVED", "Addressed");

      expect(result.success).toBe(true);
      expect(update).toHaveBeenCalledWith({
        where: { id: "report-123" },
        data: expect.objectContaining({
          status: "RESOLVED",
          adminNotes: "Addressed",
        }),
      });
    });

    it("dismisses report", async () => {
      const { update } = mockResolveReportTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReport("report-123", "DISMISSED");

      expect(update).toHaveBeenCalledWith({
        where: { id: "report-123" },
        data: expect.objectContaining({
          status: "DISMISSED",
        }),
      });
    });

    it("logs appropriate action type", async () => {
      mockResolveReportTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReport("report-123", "DISMISSED");

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPORT_DISMISSED",
        })
      );
    });

    it("does not reprocess an already reviewed report", async () => {
      const { update } = mockResolveReportTx({
        ...mockReport,
        status: "RESOLVED",
      });

      const result = await resolveReport("report-123", "DISMISSED");

      expect(result).toEqual({
        error: "This report has already been reviewed.",
        code: "STATE_CONFLICT",
      });
      expect(update).not.toHaveBeenCalled();
      expect(logAdminAction).not.toHaveBeenCalled();
    });
  });

  describe("resolveReportAndRemoveListing", () => {
    const mockReport = {
      listingId: "listing-123",
      reason: "INAPPROPRIATE",
      reporterId: "reporter-123",
      status: "OPEN",
    };

    const mockListing = {
      id: "listing-123",
      title: "Test Listing",
      ownerId: "owner-123",
      status: "ACTIVE",
      statusReason: null,
      version: 3,
    };

    function mockInteractiveTxForResolve({
      reportRow = mockReport,
      listingRow = mockListing,
      reportUpdate = jest.fn().mockResolvedValue({}),
      listingUpdate = jest.fn().mockResolvedValue({}),
      listingDelete = jest.fn().mockResolvedValue({}),
      txOverrides = {},
    }: {
      reportRow?: typeof mockReport | null;
      listingRow?: typeof mockListing | null;
      reportUpdate?: jest.Mock;
      listingUpdate?: jest.Mock;
      listingDelete?: jest.Mock;
      txOverrides?: Record<string, unknown>;
    } = {}) {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce(reportRow ? [reportRow] : [])
        .mockResolvedValueOnce(listingRow ? [listingRow] : []);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: queryRaw,
            report: {
              update: reportUpdate,
            },
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            listing: { update: listingUpdate, delete: listingDelete },
            ...txOverrides,
          };
          return fn(tx);
        }
      );
      return { queryRaw, reportUpdate, listingUpdate, listingDelete };
    }

    it("does not block suppression on retired booking-era state", async () => {
      mockInteractiveTxForResolve({
        txOverrides: {
          booking: {
            count: jest.fn().mockResolvedValue(1),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        },
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await resolveReportAndRemoveListing("report-123");

      expect(result).toEqual({ success: true, affectedBookings: 0 });
    });

    it("suppresses listing when no active bookings", async () => {
      const mockListingUpdate = jest.fn().mockResolvedValue({});
      const mockListingDelete = jest.fn().mockResolvedValue({});
      const mockReportUpdate = jest.fn().mockResolvedValue({});
      mockInteractiveTxForResolve({
        listingUpdate: mockListingUpdate,
        listingDelete: mockListingDelete,
        reportUpdate: mockReportUpdate,
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await resolveReportAndRemoveListing(
        "report-123",
        "Policy violation"
      );

      expect(result.success).toBe(true);
      expect(mockListingUpdate).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: {
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 4,
        },
      });
      expect(mockListingDelete).not.toHaveBeenCalled();
      expect(markListingDirtyInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        "status_changed"
      );
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-123",
        { role: "moderator", id: "admin-123" }
      );
      expect(mockReportUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "report-123" },
          data: expect.objectContaining({
            status: "RESOLVED",
          }),
        })
      );
    });

    it("returns error when report not found", async () => {
      mockInteractiveTxForResolve({
        reportRow: null,
      });

      const result = await resolveReportAndRemoveListing("nonexistent-report");

      expect(result).toEqual({ error: "Report not found", code: "NOT_FOUND" });
    });

    it("does not suppress listings for already reviewed reports", async () => {
      const { reportUpdate, listingUpdate, listingDelete } =
        mockInteractiveTxForResolve({
          reportRow: { ...mockReport, status: "DISMISSED" },
        });

      const result = await resolveReportAndRemoveListing("report-123");

      expect(result).toEqual({
        error: "This report has already been reviewed.",
        code: "STATE_CONFLICT",
      });
      expect(reportUpdate).not.toHaveBeenCalled();
      expect(listingUpdate).not.toHaveBeenCalled();
      expect(listingDelete).not.toHaveBeenCalled();
      expect(logAdminAction).not.toHaveBeenCalled();
    });

    it("logs audit event on successful suppression", async () => {
      mockInteractiveTxForResolve();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReportAndRemoveListing("report-123", "Spam listing");

      // Should log both report resolution and listing suppression
      expect(logAdminAction).toHaveBeenCalledTimes(2);
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPORT_RESOLVED",
          targetType: "Report",
          targetId: "report-123",
        })
      );
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_HIDDEN",
          targetType: "Listing",
          targetId: "listing-123",
          details: expect.objectContaining({
            previousStatus: "ACTIVE",
            newStatus: "PAUSED",
            newStatusReason: "SUPPRESSED",
            suppressedDueToReport: "report-123",
          }),
        })
      );
    });
  });

  describe("getAdminStats", () => {
    it("returns all stats", async () => {
      (prisma.user.count as jest.Mock)
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80) // verifiedUsers
        .mockResolvedValueOnce(5); // suspendedUsers
      (prisma.listing.count as jest.Mock)
        .mockResolvedValueOnce(50) // totalListings
        .mockResolvedValueOnce(40); // activeListings
      (prisma.verificationRequest.count as jest.Mock).mockResolvedValue(10);
      (prisma.report.count as jest.Mock).mockResolvedValue(3);
      (prisma.message.count as jest.Mock).mockResolvedValue(1000);

      const result = await getAdminStats();

      expect(result.totalUsers).toBe(100);
      expect(result.verifiedUsers).toBe(80);
      expect(result.suspendedUsers).toBe(5);
      expect(result.totalListings).toBe(50);
      expect(result.activeListings).toBe(40);
      expect(result.pendingVerifications).toBe(10);
      expect(result.openReports).toBe(3);
      expect(result.totalBookings).toBe(0);
      expect(result.totalMessages).toBe(1000);
    });

    it("returns error on database failure", async () => {
      (prisma.user.count as jest.Mock).mockRejectedValue(new Error("DB Error"));

      const result = await getAdminStats();

      expect(result.error).toBe("Failed to fetch stats");
    });
  });

  describe("admin rate limiting", () => {
    beforeEach(() => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: true,
        remaining: 19,
        resetAt: new Date(),
      });
    });

    it("rate-limits toggleUserAdmin", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await toggleUserAdmin("user-123");

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("rate-limits suspendUser", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await suspendUser("user-123", true);

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("rate-limits updateListingStatus", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await updateListingStatus("listing-123", "PAUSED", 7);

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("rate-limits deleteListing", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await deleteListing("listing-123");

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("rate-limits resolveReport", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await resolveReport("report-123", "RESOLVED");

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("rate-limits resolveReportAndRemoveListing", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });

      const result = await resolveReportAndRemoveListing("report-123");

      expect(result.error).toBe("Too many requests. Please slow down.");
      expect(checkRateLimit).toHaveBeenCalled();
    });

    it("does NOT rate-limit getUsers (read action)", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await getUsers();

      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("does NOT rate-limit getListingsForAdmin (read action)", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);

      await getListingsForAdmin();

      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("does NOT rate-limit getReports (read action)", async () => {
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.report.count as jest.Mock).mockResolvedValue(0);

      await getReports();

      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("does NOT rate-limit getAdminStats (read action)", async () => {
      (prisma.user.count as jest.Mock).mockResolvedValue(0);
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);
      (prisma.verificationRequest.count as jest.Mock).mockResolvedValue(0);
      (prisma.report.count as jest.Mock).mockResolvedValue(0);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await getAdminStats();

      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("uses adminDelete config for deleteListing", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      });

      // Need to set up the transaction mock for deleteListing to proceed past rate limit
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                id: "listing-123",
                title: "Test",
                ownerId: "owner-123",
                status: "ACTIVE",
              },
            ]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            listing: { delete: jest.fn().mockResolvedValue({}) },
          };
          return fn(tx);
        }
      );
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await deleteListing("listing-123");

      expect(checkRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        "adminDelete",
        expect.objectContaining({ limit: 5, windowMs: 3_600_000 })
      );
    });

    it("uses adminDelete config for resolveReportAndRemoveListing", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: new Date(),
      });

      // Need to set up the transaction mock
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                {
                  listingId: "listing-123",
                  reason: "INAPPROPRIATE",
                  reporterId: "reporter-123",
                  status: "OPEN",
                },
              ])
              .mockResolvedValueOnce([
                {
                  id: "listing-123",
                  title: "Test",
                  ownerId: "owner-123",
                  status: "ACTIVE",
                  statusReason: null,
                  version: 3,
                },
              ]),
            report: {
              update: jest.fn().mockResolvedValue({}),
            },
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            listing: { update: jest.fn().mockResolvedValue({}) },
          };
          return fn(tx);
        }
      );
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReportAndRemoveListing("report-123");

      expect(checkRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        "adminDelete",
        expect.objectContaining({ limit: 5, windowMs: 3_600_000 })
      );
    });

    it("uses adminWrite config for toggleUserAdmin", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({
        success: true,
        remaining: 19,
        resetAt: new Date(),
      });
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ isAdmin: true }) // requireAdmin
        .mockResolvedValueOnce({
          isAdmin: false,
          name: "User",
          email: "u@e.com",
        }); // user lookup
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await toggleUserAdmin("user-123");

      expect(checkRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        "adminWrite",
        expect.objectContaining({ limit: 20, windowMs: 60_000 })
      );
    });
  });
});
