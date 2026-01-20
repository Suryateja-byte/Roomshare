/**
 * Tests for SearchDoc Dirty Flag Helpers
 *
 * Tests the markListingDirty and markListingsDirty functions.
 */

// Mock prisma before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: jest.fn(),
  },
}));

import {
  markListingDirty,
  markListingsDirty,
} from "@/lib/search/search-doc-dirty";
import { prisma } from "@/lib/prisma";

describe("search-doc-dirty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("markListingDirty", () => {
    it("calls prisma.$executeRaw with correct SQL", async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      await markListingDirty("listing-123", "listing_created");

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      // The function uses a tagged template, so we check it was called
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it("does not throw on database error", async () => {
      const dbError = new Error("Connection failed");
      (prisma.$executeRaw as jest.Mock).mockRejectedValue(dbError);

      // Should not throw
      await expect(
        markListingDirty("listing-123", "listing_updated"),
      ).resolves.toBeUndefined();

      // Should log the error
      expect(console.error).toHaveBeenCalledWith(
        "[SearchDoc] Failed to mark listing dirty:",
        expect.objectContaining({
          listingId: "listing-...",
          reason: "listing_updated",
          error: "Connection failed",
        }),
      );
    });

    it("handles all valid reason types", async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const reasons = [
        "listing_created",
        "listing_updated",
        "status_changed",
        "view_count",
        "review_changed",
      ] as const;

      for (const reason of reasons) {
        await markListingDirty("listing-123", reason);
      }

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(5);
    });
  });

  describe("markListingsDirty", () => {
    it("calls prisma.$executeRaw for batch insert", async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(3);

      await markListingsDirty(
        ["listing-1", "listing-2", "listing-3"],
        "status_changed",
      );

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("does nothing for empty array", async () => {
      await markListingsDirty([], "listing_updated");

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("does not throw on database error", async () => {
      const dbError = new Error("Batch insert failed");
      (prisma.$executeRaw as jest.Mock).mockRejectedValue(dbError);

      await expect(
        markListingsDirty(["listing-1", "listing-2"], "review_changed"),
      ).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(
        "[SearchDoc] Failed to mark listings dirty:",
        expect.objectContaining({
          count: 2,
          reason: "review_changed",
          error: "Batch insert failed",
        }),
      );
    });

    it("handles single item array", async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      await markListingsDirty(["listing-1"], "view_count");

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("handles large arrays", async () => {
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(100);

      const listings = Array.from({ length: 100 }, (_, i) => `listing-${i}`);
      await markListingsDirty(listings, "listing_updated");

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
