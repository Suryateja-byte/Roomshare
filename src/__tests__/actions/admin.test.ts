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

import {
  getUsers,
  toggleUserAdmin,
  suspendUser,
  getListingsForAdmin,
  updateListingStatus,
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

describe("admin actions", () => {
  const mockAdminSession = {
    user: { id: "admin-123", name: "Admin User", email: "admin@example.com" },
  };

  const mockAdminUser = {
    isAdmin: true,
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
      });

      const result = await getUsers();

      expect(result.error).toBe("Unauthorized");
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
            $queryRaw: jest.fn().mockResolvedValue(listingRow ? [listingRow] : []),
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
        data: { status: "PAUSED", version: 8 },
      });
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

    it("uses shared helper for HOST_MANAGED admin writes", async () => {
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

      expect(result.success).toBe(true);
      expect(update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: expect.objectContaining({
          status: "ACTIVE",
          statusReason: null,
          version: 8,
        }),
      });
    });

    it("blocks LEGACY_BOOKING ACTIVE when migration review is still required", async () => {
      mockListingStatusTx({
        ...makeStatusListing(),
        needsMigrationReview: true,
        status: "PAUSED",
      });

      const result = await updateListingStatus("listing-123", "ACTIVE", 7);

      expect(result).toEqual({
        error:
          "This listing must finish migration review before it can be made active.",
        code: "HOST_MANAGED_MIGRATION_REVIEW_REQUIRED",
      });
    });
  });

  describe("reviewListingMigration", () => {
    function makeReviewListing(
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
        needsMigrationReview: true,
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

    function mockReviewTx(
      listingRow: ReturnType<typeof makeReviewListing> | null,
      update = jest.fn().mockResolvedValue({})
    ) {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $queryRaw: jest.fn().mockResolvedValue(listingRow ? [listingRow] : []),
            listing: { update },
          })
      );
      return { update };
    }

    it("uses the shared review path for valid legacy listings", async () => {
      const { update } = mockReviewTx({
        ...makeReviewListing(),
        needsMigrationReview: true,
        availableUntil: new Date("2026-08-01T00:00:00.000Z"),
        minStayMonths: 2,
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await reviewListingMigration("listing-123", 7);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          availabilitySource: "HOST_MANAGED",
          needsMigrationReview: false,
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
          version: 8,
        })
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: expect.objectContaining({
          availabilitySource: "HOST_MANAGED",
          needsMigrationReview: false,
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
          openSlots: 2,
          availableSlots: 2,
          version: 8,
        }),
      });
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "LISTING_MIGRATION_REVIEWED",
        })
      );
    });

    it("returns stable blocker reasons when admin review is still blocked", async () => {
      mockReviewTx({
        ...makeReviewListing(),
        needsMigrationReview: true,
        acceptedBookingCount: 1,
        moveInDate: null,
      });

      const result = await reviewListingMigration("listing-123", 7);

      expect(result).toEqual({
        error:
          "Resolve the listed migration blockers before reviewing this listing.",
        code: "MIGRATION_REVIEW_BLOCKED",
        reasonCodes: ["HAS_ACCEPTED_BOOKINGS", "MISSING_MOVE_IN_DATE"],
        reasons: [
          expect.objectContaining({ code: "HAS_ACCEPTED_BOOKINGS" }),
          expect.objectContaining({ code: "MISSING_MOVE_IN_DATE" }),
        ],
        helperErrorCode: null,
        helperError: null,
      });
    });

    it("keeps already-host-managed review listings blocked while legacy blockers remain", async () => {
      mockReviewTx({
        ...makeReviewListing(),
        availabilitySource: "HOST_MANAGED",
        needsMigrationReview: true,
        status: "PAUSED",
        statusReason: "MIGRATION_REVIEW",
        openSlots: 2,
        availableSlots: 2,
        totalSlots: 2,
        minStayMonths: 2,
        availableUntil: new Date("2026-08-01T00:00:00.000Z"),
        pendingBookingCount: 1,
        acceptedBookingCount: 1,
        heldBookingCount: 1,
        futureInventoryRowCount: 2,
      });

      const result = await reviewListingMigration("listing-123", 7);

      expect(result).toEqual({
        error:
          "Resolve the listed migration blockers before reviewing this listing.",
        code: "MIGRATION_REVIEW_BLOCKED",
        reasonCodes: [
          "HAS_PENDING_BOOKINGS",
          "HAS_ACCEPTED_BOOKINGS",
          "HAS_HELD_BOOKINGS",
          "HAS_FUTURE_INVENTORY_ROWS",
        ],
        reasons: [
          expect.objectContaining({
            code: "HAS_PENDING_BOOKINGS",
            severity: "blocked",
          }),
          expect.objectContaining({
            code: "HAS_ACCEPTED_BOOKINGS",
            severity: "blocked",
          }),
          expect.objectContaining({
            code: "HAS_HELD_BOOKINGS",
            severity: "blocked",
          }),
          expect.objectContaining({
            code: "HAS_FUTURE_INVENTORY_ROWS",
            severity: "blocked",
          }),
        ],
        helperErrorCode: null,
        helperError: null,
      });
    });
  });

  describe("deleteListing", () => {
    const mockListing = {
      id: "listing-123",
      title: "Test Listing",
      ownerId: "owner-123",
      status: "ACTIVE",
    };

    // Helper to set up interactive transaction mock
    function mockInteractiveTx(overrides: Record<string, unknown> = {}) {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockListing]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            listing: { delete: jest.fn().mockResolvedValue({}) },
            report: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({}),
            },
            ...overrides,
          };
          return fn(tx);
        }
      );
    }

    it("returns error when listing not found", async () => {
      mockInteractiveTx({
        $queryRaw: jest.fn().mockResolvedValue([]),
      });

      const result = await deleteListing("nonexistent");

      expect(result.error).toBe("Listing not found");
    });

    it("blocks deletion with active bookings", async () => {
      mockInteractiveTx({
        booking: {
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });

      const result = await deleteListing("listing-123");

      expect(result.error).toBe("Cannot delete listing with active bookings");
    });

    it("uses interactive transaction with FOR UPDATE lock", async () => {
      mockInteractiveTx();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await deleteListing("listing-123");

      // Verify interactive transaction was used (function, not array)
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("deletes listing and notifies pending tenants", async () => {
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
      expect(result.notifiedTenants).toBe(1);
      expect(mockNotifCreateMany).toHaveBeenCalledTimes(1);
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

    it("deletion cascades to related records via schema (B3.3)", async () => {
      const mockListingDelete = jest.fn().mockResolvedValue({});
      mockInteractiveTx({
        listing: { delete: mockListingDelete },
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await deleteListing("listing-123");

      expect(result.success).toBe(true);
      expect(mockListingDelete).toHaveBeenCalledWith({
        where: { id: "listing-123" },
      });
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

    it("returns error when report not found", async () => {
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await resolveReport("nonexistent", "RESOLVED");

      expect(result.error).toBe("Report not found");
    });

    it("resolves report", async () => {
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport);
      (prisma.report.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await resolveReport("report-123", "RESOLVED", "Addressed");

      expect(result.success).toBe(true);
      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: "report-123" },
        data: expect.objectContaining({
          status: "RESOLVED",
          adminNotes: "Addressed",
        }),
      });
    });

    it("dismisses report", async () => {
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport);
      (prisma.report.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReport("report-123", "DISMISSED");

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: "report-123" },
        data: expect.objectContaining({
          status: "DISMISSED",
        }),
      });
    });

    it("logs appropriate action type", async () => {
      (prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport);
      (prisma.report.update as jest.Mock).mockResolvedValue({});
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReport("report-123", "DISMISSED");

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REPORT_DISMISSED",
        })
      );
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
    };

    function mockInteractiveTxForResolve(
      overrides: Record<string, unknown> = {}
    ) {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockListing]),
            report: {
              findUnique: jest.fn().mockResolvedValue(mockReport),
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
            listing: { delete: jest.fn().mockResolvedValue({}) },
            ...overrides,
          };
          return fn(tx);
        }
      );
    }

    it("blocks removal when listing has active accepted bookings (BIZ-01)", async () => {
      mockInteractiveTxForResolve({
        booking: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });

      const result = await resolveReportAndRemoveListing("report-123");

      expect(result.error).toBe("Cannot remove listing with active bookings");
    });

    it("removes listing when no active bookings", async () => {
      const mockListingDelete = jest.fn().mockResolvedValue({});
      const mockReportUpdate = jest.fn().mockResolvedValue({});
      mockInteractiveTxForResolve({
        listing: { delete: mockListingDelete },
        report: {
          findUnique: jest.fn().mockResolvedValue(mockReport),
          update: mockReportUpdate,
        },
      });
      (logAdminAction as jest.Mock).mockResolvedValue({});

      const result = await resolveReportAndRemoveListing(
        "report-123",
        "Policy violation"
      );

      expect(result.success).toBe(true);
      expect(mockListingDelete).toHaveBeenCalledWith({
        where: { id: "listing-123" },
      });
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
        report: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
      });

      const result = await resolveReportAndRemoveListing("nonexistent-report");

      expect(result.error).toBe("Report not found");
    });

    it("logs audit event on successful removal", async () => {
      mockInteractiveTxForResolve();
      (logAdminAction as jest.Mock).mockResolvedValue({});

      await resolveReportAndRemoveListing("report-123", "Spam listing");

      // Should log both report resolution and listing deletion
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
          action: "LISTING_DELETED",
          targetType: "Listing",
          targetId: "listing-123",
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
      expect(result.totalBookings).toBe(200);
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
            $queryRaw: jest.fn().mockResolvedValue([
              {
                id: "listing-123",
                title: "Test",
                ownerId: "owner-123",
              },
            ]),
            report: {
              findUnique: jest.fn().mockResolvedValue({
                listingId: "listing-123",
                reason: "INAPPROPRIATE",
                reporterId: "reporter-123",
                status: "OPEN",
              }),
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
            listing: { delete: jest.fn().mockResolvedValue({}) },
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
