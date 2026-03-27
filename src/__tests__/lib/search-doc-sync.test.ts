/**
 * Tests for upsertSearchDocSync
 *
 * Covers:
 * - Successful upsert path (returns true, calls $executeRaw, logs info)
 * - Not-found path (returns false, skips upsert, logs warn)
 * - DB fetch error (returns false, never throws, logs error)
 * - DB upsert error (returns false, never throws, logs error)
 * - computeRecommendedScore called with correct arguments
 * - listingId truncated in log messages
 * - Null optional fields handled without crashing
 * - Empty arrays handled without crashing
 */

// Mock server-only before imports
jest.mock("server-only", () => ({}));

// Mock prisma before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

// Mock logger before imports
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn(
    (error: unknown) => error instanceof Error ? error.message : "Unknown error"
  ),
}));

// Mock computeRecommendedScore before imports
jest.mock("@/lib/search/recommended-score", () => ({
  computeRecommendedScore: jest.fn().mockReturnValue(42.5),
}));

import { upsertSearchDocSync } from "@/lib/search/search-doc-sync";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeRecommendedScore } from "@/lib/search/recommended-score";

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

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
    moveInDate: new Date("2026-04-01"),
    totalSlots: 3,
    availableSlots: 2,
    viewCount: 150,
    status: "ACTIVE",
    bookingMode: "instant",
    createdAt: new Date("2026-01-15"),
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94105",
    lat: 37.7749,
    lng: -122.4194,
    avgRating: 4.5,
    reviewCount: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockLogWarn = logger.sync.warn as jest.Mock;
const mockLogInfo = logger.sync.info as jest.Mock;
const mockLogError = logger.sync.error as jest.Mock;
const mockComputeScore = computeRecommendedScore as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upsertSearchDocSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true and upserts search doc for valid listing", async () => {
    mockQueryRaw.mockResolvedValue([createMockListingData()]);
    mockExecuteRaw.mockResolvedValue(1);

    const result = await upsertSearchDocSync("listing-1");

    expect(result).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockLogInfo).toHaveBeenCalledWith(
      "Search doc synced successfully",
      expect.objectContaining({ action: "upsertSearchDocSync" })
    );
  });

  it("returns false when listing not found", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await upsertSearchDocSync("listing-1");

    expect(result).toBe(false);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      "Search doc sync: listing or location not found",
      expect.objectContaining({ action: "upsertSearchDocSync" })
    );
  });

  it("returns false when JOIN filters out listing (no rows from $queryRaw)", async () => {
    // Simulates the WHERE loc.coords IS NOT NULL filter excluding the listing
    mockQueryRaw.mockResolvedValue([]);

    const result = await upsertSearchDocSync("no-coords-listing");

    expect(result).toBe(false);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("returns false on database fetch error without throwing", async () => {
    mockQueryRaw.mockRejectedValue(new Error("Connection refused"));

    await expect(upsertSearchDocSync("listing-1")).resolves.toBe(false);
    expect(mockLogError).toHaveBeenCalledWith(
      "Search doc sync failed",
      expect.objectContaining({
        action: "upsertSearchDocSync",
        error: "Connection refused",
      })
    );
  });

  it("returns false on upsert error without throwing", async () => {
    mockQueryRaw.mockResolvedValue([createMockListingData()]);
    mockExecuteRaw.mockRejectedValue(new Error("unique violation"));

    await expect(upsertSearchDocSync("listing-1")).resolves.toBe(false);
    expect(mockLogError).toHaveBeenCalledWith(
      "Search doc sync failed",
      expect.objectContaining({
        action: "upsertSearchDocSync",
        error: "unique violation",
      })
    );
  });

  it("calls computeRecommendedScore with correct arguments", async () => {
    const createdAt = new Date("2026-02-01");
    mockQueryRaw.mockResolvedValue([
      createMockListingData({
        avgRating: 4.2,
        viewCount: 100,
        reviewCount: 8,
        createdAt,
      }),
    ]);
    mockExecuteRaw.mockResolvedValue(1);

    await upsertSearchDocSync("listing-1");

    expect(mockComputeScore).toHaveBeenCalledWith(4.2, 100, 8, createdAt);
  });

  it("truncates listingId in warn log messages for security", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const listingId = "12345678-abcd-efgh-ijkl-mnopqrstuvwx";

    await upsertSearchDocSync(listingId);

    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ listingId: "12345678..." })
    );
  });

  it("truncates listingId in error log messages for security", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    const listingId = "12345678-abcd-efgh-ijkl-mnopqrstuvwx";

    await upsertSearchDocSync(listingId);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ listingId: "12345678..." })
    );
  });

  it("handles listing with null optional fields without crashing", async () => {
    mockQueryRaw.mockResolvedValue([
      createMockListingData({
        description: null,
        primaryHomeLanguage: null,
        leaseDuration: null,
        roomType: null,
        moveInDate: null,
      }),
    ]);
    mockExecuteRaw.mockResolvedValue(1);

    await expect(upsertSearchDocSync("listing-1")).resolves.toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("handles listing with empty arrays without crashing", async () => {
    mockQueryRaw.mockResolvedValue([
      createMockListingData({
        amenities: [],
        houseRules: [],
        householdLanguages: [],
        images: [],
      }),
    ]);
    mockExecuteRaw.mockResolvedValue(1);

    await expect(upsertSearchDocSync("listing-1")).resolves.toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});
