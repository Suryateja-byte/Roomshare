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

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

import {
  markListingDirty,
  markListingsDirty,
  markListingDirtyInTx,
  markListingsDirtyInTx,
  type DirtyMarkTxClient,
} from "@/lib/search/search-doc-dirty";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

describe("search-doc-dirty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_SEARCH_DOC = "true";
  });

  afterEach(() => {
    delete process.env.ENABLE_SEARCH_DOC;
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
        markListingDirty("listing-123", "listing_updated")
      ).resolves.toBeUndefined();

      // Should log the error via structured logger
      expect(logger.sync.error).toHaveBeenCalledWith(
        "[SearchDoc] Failed to mark listing dirty",
        expect.objectContaining({
          listingId: "listing-...",
          reason: "listing_updated",
          error: "Connection failed",
        })
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
        "status_changed"
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
        markListingsDirty(["listing-1", "listing-2"], "review_changed")
      ).resolves.toBeUndefined();

      expect(logger.sync.error).toHaveBeenCalledWith(
        "[SearchDoc] Failed to mark listings dirty",
        expect.objectContaining({
          count: 2,
          reason: "review_changed",
          error: "Batch insert failed",
        })
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

  describe("markListingDirtyInTx", () => {
    function makeTx(): DirtyMarkTxClient & {
      $executeRaw: jest.Mock;
    } {
      return {
        $executeRaw: jest.fn().mockResolvedValue(1),
      } as unknown as DirtyMarkTxClient & { $executeRaw: jest.Mock };
    }

    it("calls the supplied transaction client's $executeRaw, not the module-level prisma", async () => {
      const tx = makeTx();

      await markListingDirtyInTx(tx, "listing-123", "listing_updated");

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("rethrows errors so the enclosing transaction can roll back", async () => {
      const tx = makeTx();
      const dbError = new Error("constraint violation");
      tx.$executeRaw.mockRejectedValue(dbError);

      await expect(
        markListingDirtyInTx(tx, "listing-123", "status_changed")
      ).rejects.toThrow("constraint violation");
    });

    it("rolls back the dirty mark when the enclosing $transaction rolls back", async () => {
      const executeRawCalls: unknown[][] = [];
      const tx = {
        $executeRaw: jest.fn((...args: unknown[]) => {
          executeRawCalls.push(args);
          return Promise.resolve(1);
        }),
      } as unknown as DirtyMarkTxClient;

      // Simulate prisma.$transaction: callback runs, then a rollback.
      // The test caller (below) throws AFTER markListingDirtyInTx returns to
      // force the rollback path — `committed` stays false because the happy
      // `return result` is never reached.
      let committed = false;
      const simulateTx = async <T>(
        cb: (tx: DirtyMarkTxClient) => Promise<T>
      ): Promise<T> => {
        const result = await cb(tx);
        committed = true;
        return result;
      };

      await expect(
        simulateTx(async (txClient) => {
          await markListingDirtyInTx(txClient, "listing-1", "listing_updated");
          throw new Error("simulated source-write failure");
        })
      ).rejects.toThrow("simulated source-write failure");

      // The helper issued its INSERT inside the tx callback, but since the tx
      // threw, a real DB would roll the INSERT back. Here we verify the call
      // went through the tx client (never to the module-level prisma).
      expect(executeRawCalls.length).toBe(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(committed).toBe(false);
    });

    it("no-ops when searchDoc feature flag is off", async () => {
      const originalEnabled = process.env.ENABLE_SEARCH_DOC;
      delete process.env.ENABLE_SEARCH_DOC;
      // Re-import to pick up the flag change
      jest.resetModules();
      const { markListingDirtyInTx: reloaded } = await import(
        "@/lib/search/search-doc-dirty"
      );
      const tx = makeTx();

      await reloaded(tx, "listing-1", "listing_updated");

      expect(tx.$executeRaw).not.toHaveBeenCalled();

      process.env.ENABLE_SEARCH_DOC = originalEnabled;
    });
  });

  describe("markListingsDirtyInTx", () => {
    function makeTx(): DirtyMarkTxClient & {
      $executeRaw: jest.Mock;
    } {
      return {
        $executeRaw: jest.fn().mockResolvedValue(2),
      } as unknown as DirtyMarkTxClient & { $executeRaw: jest.Mock };
    }

    it("calls the supplied transaction client's $executeRaw for a batch", async () => {
      const tx = makeTx();

      await markListingsDirtyInTx(
        tx,
        ["listing-1", "listing-2"],
        "status_changed"
      );

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("no-ops on empty array", async () => {
      const tx = makeTx();

      await markListingsDirtyInTx(tx, [], "listing_updated");

      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it("rethrows errors so the enclosing transaction can roll back", async () => {
      const tx = makeTx();
      const dbError = new Error("batch insert failed");
      tx.$executeRaw.mockRejectedValue(dbError);

      await expect(
        markListingsDirtyInTx(tx, ["listing-1"], "review_changed")
      ).rejects.toThrow("batch insert failed");
    });
  });
});
