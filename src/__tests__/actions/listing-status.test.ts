/**
 * Tests for listing-status server actions
 */

// Mock dependencies before imports
const mockTx = {
  $queryRaw: jest.fn(),
  listing: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  booking: {
    count: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx)
    ),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import {
  updateListingStatus,
  recoverHostManagedListing,
  incrementViewCount,
  trackListingView,
  trackRecentlyViewed,
  getRecentlyViewed,
} from "@/app/actions/listing-status";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

describe("listing-status actions", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  const mockListing = {
    id: "listing-123",
    ownerId: "user-123",
    title: "Cozy Room",
    status: "ACTIVE",
  };

  function makeLockedListingRow(
    overrides: Partial<{
      ownerId: string;
      version: number;
      availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
      status: "ACTIVE" | "PAUSED" | "RENTED";
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
    }> = {}
  ) {
    return {
      id: "listing-123",
      ownerId: "user-123",
      version: 3,
      availabilitySource: "LEGACY_BOOKING" as const,
      status: "ACTIVE" as const,
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
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    // Mock user.findUnique for suspension check
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      isSuspended: false,
    });
  });

  describe("updateListingStatus", () => {
    describe("authentication", () => {
      it("returns error when not authenticated", async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.error).toBe("Unauthorized");
      });

      it("returns error when user id is missing", async () => {
        (auth as jest.Mock).mockResolvedValue({ user: {} });

        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.error).toBe("Unauthorized");
      });
    });

    describe("listing validation", () => {
      it("returns error when listing not found", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([]);

        const result = await updateListingStatus("invalid-listing", "PAUSED", 3);

        expect(result.error).toBe("Listing not found");
      });

      it("returns error when not owner", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({ ownerId: "other-user" }),
        ]);

        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.error).toBe("You can only update your own listings");
      });
    });

    describe("successful update", () => {
      beforeEach(() => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow(),
        ]);
        (mockTx.listing.update as jest.Mock).mockResolvedValue({
          ...mockListing,
          status: "PAUSED",
        });
        (mockTx.booking.count as jest.Mock).mockResolvedValue(0);
      });

      it("updates status to PAUSED", async () => {
        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.success).toBe(true);
        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: { status: "PAUSED", version: 4 },
        });
      });

      it("updates status to RENTED", async () => {
        await updateListingStatus("listing-123", "RENTED", 3);

        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: { status: "RENTED", version: 4 },
        });
      });

      it("updates status to ACTIVE", async () => {
        await updateListingStatus("listing-123", "ACTIVE", 3);

        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: { status: "ACTIVE", version: 4 },
        });
      });

      it("revalidates listing path", async () => {
        await updateListingStatus("listing-123", "PAUSED", 3);

        expect(revalidatePath).toHaveBeenCalledWith("/listings/listing-123");
      });

      it("revalidates profile path", async () => {
        await updateListingStatus("listing-123", "PAUSED", 3);

        expect(revalidatePath).toHaveBeenCalledWith("/profile");
      });

      it("revalidates search path", async () => {
        await updateListingStatus("listing-123", "PAUSED", 3);

        expect(revalidatePath).toHaveBeenCalledWith("/search");
      });
    });

    describe("RENTED status and availableSlots (F2.2)", () => {
      it("setting RENTED status only updates the status field, not availableSlots", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow(),
        ]);
        (mockTx.listing.update as jest.Mock).mockResolvedValue({
          ...mockListing,
          status: "RENTED",
        });
        (mockTx.booking.count as jest.Mock).mockResolvedValue(0);

        await updateListingStatus("listing-123", "RENTED", 3);

        // updateListingStatus only sets { status: 'RENTED' } — availableSlots is not modified
        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: { status: "RENTED", version: 4 },
        });
      });

      it("returns version conflict when expectedVersion is stale", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([makeLockedListingRow()]);

        const result = await updateListingStatus("listing-123", "PAUSED", 2);

        expect(result).toEqual({
          error: "This listing was updated elsewhere. Reload and try again.",
          code: "VERSION_CONFLICT",
        });
        expect(mockTx.listing.update).not.toHaveBeenCalled();
      });

      it("uses shared helper for HOST_MANAGED listings", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({
            availabilitySource: "HOST_MANAGED",
            openSlots: 2,
            availableSlots: 2,
            totalSlots: 2,
            status: "PAUSED",
            statusReason: "HOST_PAUSED",
          }),
        ]);

        await updateListingStatus("listing-123", "ACTIVE", 3);

        expect(mockTx.booking.count).not.toHaveBeenCalled();
        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: expect.objectContaining({
            status: "ACTIVE",
            statusReason: null,
            version: 4,
          }),
        });
      });

      it("blocks HOST_MANAGED ACTIVE when migration review is still required", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({
            availabilitySource: "HOST_MANAGED",
            openSlots: 2,
            availableSlots: 2,
            needsMigrationReview: true,
            status: "PAUSED",
          }),
        ]);

        const result = await updateListingStatus("listing-123", "ACTIVE", 3);

        expect(result).toEqual({
          error:
            "This listing must finish migration review before it can be made active.",
          code: "HOST_MANAGED_MIGRATION_REVIEW_REQUIRED",
        });
        expect(mockTx.listing.update).not.toHaveBeenCalled();
      });
    });

    describe("error handling", () => {
      it("returns error on database failure", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow(),
        ]);
        (mockTx.booking.count as jest.Mock).mockResolvedValue(0);
        (mockTx.listing.update as jest.Mock).mockRejectedValue(
          new Error("DB Error")
        );

        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.error).toBe("Failed to update listing status");
      });
    });

    describe("recoverHostManagedListing", () => {
      it("reconfirms HOST_MANAGED listings through the shared helper path", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({
            availabilitySource: "HOST_MANAGED",
            openSlots: 2,
            availableSlots: 2,
            totalSlots: 2,
            moveInDate: new Date("2026-05-01T00:00:00.000Z"),
            availableUntil: new Date("2026-08-01T00:00:00.000Z"),
            minStayMonths: 2,
            lastConfirmedAt: new Date("2026-04-01T00:00:00.000Z"),
            freshnessReminderSentAt: new Date("2026-04-10T00:00:00.000Z"),
            freshnessWarningSentAt: new Date("2026-04-12T00:00:00.000Z"),
            autoPausedAt: new Date("2026-04-14T00:00:00.000Z"),
          }),
        ]);
        (mockTx.listing.update as jest.Mock).mockResolvedValue({
          id: "listing-123",
        });

        const result = await recoverHostManagedListing(
          "listing-123",
          3,
          "RECONFIRM"
        );

        expect(result.success).toBe(true);
        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: expect.objectContaining({
            version: 4,
            status: "ACTIVE",
            statusReason: null,
            openSlots: 2,
            availableSlots: 2,
            totalSlots: 2,
            lastConfirmedAt: expect.any(Date),
            freshnessReminderSentAt: null,
            freshnessWarningSentAt: null,
            autoPausedAt: null,
          }),
        });
      });

      it("rejects reopen when host-managed invariants fail", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({
            availabilitySource: "HOST_MANAGED",
            status: "PAUSED",
            statusReason: "STALE_AUTO_PAUSE",
            openSlots: 0,
            availableSlots: 0,
            totalSlots: 2,
            moveInDate: new Date("2026-05-01T00:00:00.000Z"),
            availableUntil: new Date("2026-08-01T00:00:00.000Z"),
          }),
        ]);
        (mockTx.listing.update as jest.Mock).mockResolvedValue({
          id: "listing-123",
        });

        const result = await recoverHostManagedListing(
          "listing-123",
          3,
          "REOPEN"
        );

        expect(result).toEqual({
          error: "Active host-managed listings require at least one open slot.",
          code: "HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS",
        });
        expect(mockTx.listing.update).not.toHaveBeenCalled();
      });

      it("returns version conflict when recovery is stale", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({
            availabilitySource: "HOST_MANAGED",
            status: "PAUSED",
            statusReason: "STALE_AUTO_PAUSE",
            openSlots: 2,
            availableSlots: 2,
          }),
        ]);

        const result = await recoverHostManagedListing(
          "listing-123",
          2,
          "RECONFIRM"
        );

        expect(result).toEqual({
          error: "This listing was updated elsewhere. Reload and try again.",
          code: "VERSION_CONFLICT",
        });
      });
    });

    describe("transaction safety (FOR UPDATE)", () => {
      beforeEach(() => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow(),
        ]);
        (mockTx.booking.count as jest.Mock).mockResolvedValue(0);
        (mockTx.listing.update as jest.Mock).mockResolvedValue({
          ...mockListing,
          status: "PAUSED",
        });
      });

      it("uses a transaction with FOR UPDATE when updating status", async () => {
        await updateListingStatus("listing-123", "PAUSED", 3);

        // Verify prisma.$transaction is called
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);

        // The ownership check uses $queryRaw with FOR UPDATE row lock
        expect(mockTx.$queryRaw).toHaveBeenCalled();
        const sqlStrings = (
          mockTx.$queryRaw as jest.Mock
        ).mock.calls[0][0].join("");
        expect(sqlStrings).toContain("FOR UPDATE");

        // Booking count and listing update happen inside the transaction (via tx)
        expect(mockTx.booking.count).toHaveBeenCalled();
        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: "listing-123" },
          data: { status: "PAUSED", version: 4 },
        });
      });

      it("keeps revalidatePath outside the transaction", async () => {
        await updateListingStatus("listing-123", "ACTIVE", 3);

        // revalidatePath should still be called (outside transaction)
        expect(revalidatePath).toHaveBeenCalledWith("/listings/listing-123");
        expect(revalidatePath).toHaveBeenCalledWith("/profile");
        expect(revalidatePath).toHaveBeenCalledWith("/search");

        // But NOT inside the transaction callback — verify by confirming
        // revalidatePath is called AFTER $transaction resolves
        const txCallOrder = (prisma.$transaction as jest.Mock).mock
          .invocationCallOrder[0];
        const revalidateCallOrder = (revalidatePath as jest.Mock).mock
          .invocationCallOrder[0];
        expect(revalidateCallOrder).toBeGreaterThan(txCallOrder);
      });

      it("returns listing not found when FOR UPDATE returns empty", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([]);

        const result = await updateListingStatus("nonexistent", "PAUSED", 3);

        expect(result.error).toBe("Listing not found");
      });

      it("returns ownership error via transaction when not owner", async () => {
        (mockTx.$queryRaw as jest.Mock).mockResolvedValue([
          makeLockedListingRow({ ownerId: "other-user" }),
        ]);

        const result = await updateListingStatus("listing-123", "PAUSED", 3);

        expect(result.error).toBe("You can only update your own listings");
      });
    });
  });

  describe("incrementViewCount", () => {
    it("increments view count", async () => {
      (prisma.listing.update as jest.Mock).mockResolvedValue(mockListing);

      await incrementViewCount("listing-123");

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: { viewCount: { increment: 1 } },
      });
    });

    it("returns success: true", async () => {
      (prisma.listing.update as jest.Mock).mockResolvedValue(mockListing);

      const result = await incrementViewCount("listing-123");

      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      (prisma.listing.update as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await incrementViewCount("listing-123");

      expect(result.error).toBe("Failed to increment view count");
    });
  });

  describe("trackListingView", () => {
    beforeEach(() => {
      (prisma.listing.update as jest.Mock).mockResolvedValue(mockListing);
      (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);
    });

    it("always increments view count", async () => {
      await trackListingView("listing-123");

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        data: { viewCount: { increment: 1 } },
      });
    });

    it("tracks recently viewed for authenticated users", async () => {
      await trackListingView("listing-123");

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalled();
    });

    it("does not track recently viewed for unauthenticated users", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await trackListingView("listing-123");

      expect(prisma.recentlyViewed.upsert).not.toHaveBeenCalled();
    });

    it("returns success", async () => {
      const result = await trackListingView("listing-123");

      expect(result.success).toBe(true);
    });
  });

  describe("trackRecentlyViewed", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await trackRecentlyViewed("listing-123");

      expect(result.error).toBe("Not authenticated");
    });

    it("upserts recently viewed record", async () => {
      (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await trackRecentlyViewed("listing-123");

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalledWith({
        where: {
          userId_listingId: {
            userId: "user-123",
            listingId: "listing-123",
          },
        },
        update: { viewedAt: expect.any(Date) },
        create: {
          userId: "user-123",
          listingId: "listing-123",
          viewedAt: expect.any(Date),
        },
      });
    });

    it("keeps only last 20 viewed listings", async () => {
      const oldViews = [{ id: "old-1" }, { id: "old-2" }];
      (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(oldViews);
      (prisma.recentlyViewed.deleteMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await trackRecentlyViewed("listing-123");

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { viewedAt: "desc" },
        skip: 20,
      });
      expect(prisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["old-1", "old-2"] } },
      });
    });

    it("returns success: true", async () => {
      (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      const result = await trackRecentlyViewed("listing-123");

      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      (prisma.recentlyViewed.upsert as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await trackRecentlyViewed("listing-123");

      expect(result.error).toBe("Failed to track recently viewed");
    });
  });

  describe("getRecentlyViewed", () => {
    it("returns empty array when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getRecentlyViewed();

      expect(result).toEqual([]);
    });

    it("returns recently viewed listings", async () => {
      const mockViewed = [
        {
          viewedAt: new Date(),
          listing: {
            id: "listing-1",
            title: "Room 1",
            price: 1200,
            status: "ACTIVE",
            location: { city: "NYC" },
            owner: {
              id: "owner-1",
              name: "Owner",
              image: null,
              isVerified: true,
            },
          },
        },
      ];
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(
        mockViewed
      );

      const result = await getRecentlyViewed();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Room 1");
      expect(result[0].viewedAt).toBeDefined();
    });

    it("filters out non-ACTIVE listings", async () => {
      const mockViewed = [
        {
          viewedAt: new Date(),
          listing: {
            id: "listing-1",
            title: "Active Room",
            price: 900,
            status: "ACTIVE",
            location: {},
            owner: {},
          },
        },
        {
          viewedAt: new Date(),
          listing: {
            id: "listing-2",
            title: "Paused Room",
            price: 800,
            status: "PAUSED",
            location: {},
            owner: {},
          },
        },
        {
          viewedAt: new Date(),
          listing: {
            id: "listing-3",
            title: "Rented Room",
            price: 1100,
            status: "RENTED",
            location: {},
            owner: {},
          },
        },
      ];
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(
        mockViewed
      );

      const result = await getRecentlyViewed();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("listing-1");
    });

    it("respects limit parameter", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await getRecentlyViewed(5);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it("uses default limit of 10", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await getRecentlyViewed();

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it("orders by viewedAt descending", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await getRecentlyViewed();

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { viewedAt: "desc" },
        })
      );
    });

    it("returns empty array on error", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await getRecentlyViewed();

      expect(result).toEqual([]);
    });
  });
});
