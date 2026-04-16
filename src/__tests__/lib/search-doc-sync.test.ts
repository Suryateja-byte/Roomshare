jest.mock("server-only", () => ({}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
}));

jest.mock("@/lib/search/recommended-score", () => ({
  computeRecommendedScore: jest.fn().mockReturnValue(42.5),
}));

import {
  projectSearchDocument,
  upsertSearchDocSync,
} from "@/lib/search/search-doc-sync";
import { getAvailability } from "@/lib/availability";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { computeRecommendedScore } from "@/lib/search/recommended-score";

function createMockListingData(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    ownerId: "owner-1",
    title: "Cozy Room",
    description: "A nice room",
    price: 800,
    images: ["img1.jpg"],
    amenities: ["WiFi", "Parking"],
    houseRules: ["No Smoking"],
    householdLanguages: ["English", "Spanish"],
    primaryHomeLanguage: "English",
    leaseDuration: "6_months",
    roomType: "private",
    moveInDate: new Date("2026-04-01T00:00:00.000Z"),
    totalSlots: 3,
    availableSlots: 2,
    availabilitySource: "LEGACY_BOOKING" as const,
    openSlots: null,
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: null,
    statusReason: null,
    viewCount: 150,
    status: "ACTIVE",
    bookingMode: "instant",
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94105",
    lat: 37.7749,
    lng: -122.4194,
    avgRating: 4.5,
    reviewCount: 12,
    docUpdatedAt: null,
    ...overrides,
  };
}

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockGetAvailability = getAvailability as jest.Mock;
const mockLogWarn = logger.sync.warn as jest.Mock;
const mockLogInfo = logger.sync.info as jest.Mock;
const mockLogError = logger.sync.error as jest.Mock;
const mockComputeScore = computeRecommendedScore as jest.Mock;

describe("search-doc-sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailability.mockResolvedValue({
      listingId: "listing-1",
      totalSlots: 3,
      effectiveAvailableSlots: 2,
    });
    mockExecuteRaw.mockResolvedValue(1);
  });

  describe("projectSearchDocument", () => {
    it("upserts a valid LEGACY_BOOKING listing and records missing-doc divergence", async () => {
      const createdAt = new Date("2026-02-01T00:00:00.000Z");
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          avgRating: 4.2,
          viewCount: 100,
          reviewCount: 8,
          createdAt,
          docUpdatedAt: null,
        }),
      ]);

      const result = await projectSearchDocument("listing-1");

      expect(result).toEqual({
        listingId: "listing-1",
        outcome: "upsert",
        divergenceReason: "missing_doc",
        hadExistingDoc: false,
      });
      expect(mockGetAvailability).toHaveBeenCalledWith("listing-1");
      expect(mockComputeScore).toHaveBeenCalledWith(4.2, 100, 8, createdAt);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("upserts a valid HOST_MANAGED listing from row fields only", async () => {
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          availabilitySource: "HOST_MANAGED",
          availableSlots: 99,
          openSlots: 2,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: new Date("2026-04-15T12:30:00.000Z"),
          docUpdatedAt: null,
        }),
      ]);

      const result = await projectSearchDocument("listing-1");

      expect(result.outcome).toBe("upsert");
      expect(result.divergenceReason).toBe("missing_doc");
      expect(mockGetAvailability).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("suppresses invalid HOST_MANAGED listings and deletes stale docs", async () => {
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          availabilitySource: "HOST_MANAGED",
          openSlots: 0,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
          docUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
        }),
      ]);

      const result = await projectSearchDocument("listing-1");

      expect(result).toEqual({
        listingId: "listing-1",
        outcome: "suppress_delete",
        divergenceReason: "stale_doc",
        hadExistingDoc: true,
      });
      expect(mockGetAvailability).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(mockComputeScore).not.toHaveBeenCalled();
    });

    it("defers retry when listing exists but cannot be projected yet", async () => {
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          address: null,
          city: null,
          state: null,
          zip: null,
          lat: null,
          lng: null,
          docUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
        }),
      ]);

      const result = await projectSearchDocument("listing-1");

      expect(result).toEqual({
        listingId: "listing-1",
        outcome: "defer_retry",
        divergenceReason: "stale_doc",
        hadExistingDoc: true,
      });
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(mockComputeScore).not.toHaveBeenCalled();
    });

    it("confirms orphan listings and deletes any stale doc", async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await projectSearchDocument("listing-1");

      expect(result).toEqual({
        listingId: "listing-1",
        outcome: "confirmed_orphan",
        divergenceReason: null,
        hadExistingDoc: false,
      });
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("upsertSearchDocSync", () => {
    it("returns true for a handled host-managed suppression", async () => {
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          availabilitySource: "HOST_MANAGED",
          openSlots: 0,
          totalSlots: 4,
          moveInDate: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ]);

      await expect(upsertSearchDocSync("listing-1")).resolves.toBe(true);
      expect(mockLogInfo).toHaveBeenCalledWith(
        "Search doc sync suppressed host-managed listing",
        expect.objectContaining({
          action: "upsertSearchDocSync",
          outcome: "suppress_delete",
        })
      );
    });

    it("returns false and logs defer_retry for recoverable projection gaps", async () => {
      mockQueryRaw.mockResolvedValue([
        createMockListingData({
          lat: null,
          lng: null,
          address: null,
          city: null,
          state: null,
          zip: null,
        }),
      ]);

      await expect(upsertSearchDocSync("listing-1")).resolves.toBe(false);
      expect(mockLogWarn).toHaveBeenCalledWith(
        "Search doc sync deferred pending projection prerequisites",
        expect.objectContaining({
          action: "upsertSearchDocSync",
          outcome: "defer_retry",
        })
      );
    });

    it("returns false and logs confirmed_orphan when the listing no longer exists", async () => {
      mockQueryRaw.mockResolvedValue([]);

      await expect(upsertSearchDocSync("listing-1")).resolves.toBe(false);
      expect(mockLogWarn).toHaveBeenCalledWith(
        "Search doc sync confirmed orphan listing",
        expect.objectContaining({
          action: "upsertSearchDocSync",
          outcome: "confirmed_orphan",
        })
      );
    });

    it("truncates listingId in warn and error log messages", async () => {
      const listingId = "12345678-abcd-efgh-ijkl-mnopqrstuvwx";
      mockQueryRaw.mockRejectedValue(new Error("db down"));

      await upsertSearchDocSync(listingId);

      expect(mockLogError).toHaveBeenCalledWith(
        "Search doc sync failed",
        expect.objectContaining({
          listingId: "12345678...",
          error: "db down",
        })
      );
    });
  });
});
