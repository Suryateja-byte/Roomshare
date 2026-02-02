/**
 * Integration Tests: markListingDirty() wiring in production code
 *
 * Verifies that listing mutations correctly call markListingDirty()
 * so the cron job has dirty flags to process.
 */

// Track calls to markListingDirty/markListingsDirty
const mockMarkListingDirty = jest.fn().mockResolvedValue(undefined);
const mockMarkListingsDirty = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: (...args: unknown[]) => mockMarkListingDirty(...args),
  markListingsDirty: (...args: unknown[]) => mockMarkListingsDirty(...args),
}));

// Mock prisma
const mockPrisma = {
  listing: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  location: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  review: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  booking: {
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  notification: { create: jest.fn() },
  recentlyViewed: {
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
  },
  user: { findUnique: jest.fn().mockResolvedValue({ id: "user-1" }) },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// Mock auth
jest.mock("@/auth", () => ({
  auth: jest.fn().mockResolvedValue({
    user: { id: "user-1", name: "Test User", email: "test@test.com" },
  }),
}));

// Mock other dependencies
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
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
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/search-alerts", () => ({
  triggerInstantAlerts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/geocoding", () => ({
  geocodeAddress: jest.fn().mockResolvedValue({ lat: 37.7749, lng: -122.4194 }),
}));

describe("markListingDirty integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listing-status actions", () => {
    it("marks dirty on status change", async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.listing.update.mockResolvedValue({ id: "listing-1" });

      const { updateListingStatus } = await import(
        "@/app/actions/listing-status"
      );
      await updateListingStatus("listing-1", "PAUSED");

      expect(mockMarkListingDirty).toHaveBeenCalledWith(
        "listing-1",
        "status_changed",
      );
    });

    it("marks dirty on view count increment", async () => {
      mockPrisma.listing.update.mockResolvedValue({ id: "listing-1" });

      const { incrementViewCount } = await import(
        "@/app/actions/listing-status"
      );
      await incrementViewCount("listing-1");

      expect(mockMarkListingDirty).toHaveBeenCalledWith(
        "listing-1",
        "view_count",
      );
    });
  });

  describe("fire-and-forget safety", () => {
    it("does not fail parent mutation when markListingDirty rejects", async () => {
      mockMarkListingDirty.mockRejectedValueOnce(new Error("DB down"));
      mockPrisma.listing.findUnique.mockResolvedValue({
        ownerId: "user-1",
      });
      mockPrisma.listing.update.mockResolvedValue({ id: "listing-1" });

      const { updateListingStatus } = await import(
        "@/app/actions/listing-status"
      );
      const result = await updateListingStatus("listing-1", "ACTIVE");

      // Parent mutation should still succeed
      expect(result).toEqual({ success: true });
    });
  });
});
