/**
 * Tests for saved-search server actions
 */

jest.mock("@/lib/prisma", () => {
  const prisma: {
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    savedSearch: Record<string, jest.Mock>;
    alertSubscription: Record<string, jest.Mock>;
  } = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    savedSearch: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    alertSubscription: {
      upsert: jest.fn(),
    },
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => callback(prisma)
  );

  return { prisma };
});

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockEvaluateSavedSearchAlertPaywall = jest.fn();
jest.mock("@/lib/payments/search-alert-paywall", () => ({
  evaluateSavedSearchAlertPaywall: (...args: unknown[]) =>
    mockEvaluateSavedSearchAlertPaywall(...args),
  resolveSavedSearchEffectiveAlertState: jest.requireActual(
    "@/lib/payments/search-alert-paywall"
  ).resolveSavedSearchEffectiveAlertState,
}));

const mockCheckSuspension = jest.fn();
jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: (...args: unknown[]) => mockCheckSuspension(...args),
}));

import {
  saveSearch,
  getMySavedSearches,
  deleteSavedSearch,
  toggleSearchAlert,
  updateSavedSearchName,
} from "@/app/actions/saved-search";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { buildSearchUrl } from "@/lib/search-utils";

const SAVED_SEARCH_TEST_NOW = new Date("2026-04-01T12:00:00.000Z");
const SAVED_SEARCH_MOVE_IN_DATE = "2026-05-01";
const SAVED_SEARCH_END_DATE = "2026-07-01";

describe("Saved Search Actions", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  const mockFilters = {
    query: "apartment",
    minPrice: 500,
    maxPrice: 1500,
    roomType: "Private Room",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    // Default: no duplicate saved search exists (the dedup check finds nothing).
    (prisma.savedSearch.findFirst as jest.Mock).mockResolvedValue(null);
    mockEvaluateSavedSearchAlertPaywall.mockResolvedValue({
      enabled: false,
      mode: "PASS_ACTIVE",
      activePassExpiresAt: null,
      requiresPurchase: false,
      offers: [],
    });
    mockCheckSuspension.mockResolvedValue({ suspended: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("saveSearch", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("returns error when user has 10 saved searches", async () => {
      const order: string[] = [];
      (prisma.$executeRaw as jest.Mock).mockImplementation(() => {
        order.push("lock");
      });
      (prisma.savedSearch.count as jest.Mock).mockImplementation(() => {
        order.push("count");
        return 10;
      });

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({
        error:
          "You can only save up to 10 searches. Please delete some to save new ones.",
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["lock", "count"]);
      expect(prisma.savedSearch.create).not.toHaveBeenCalled();
    });

    // Regression (L-15): an identical (same canonical searchSpecHash) saved search
    // must be rejected instead of creating a duplicate row (which eats the 10-slot
    // limit and fires duplicate alert emails).
    it("rejects a duplicate saved search without creating a new row", async () => {
      (prisma.savedSearch.findFirst as jest.Mock).mockResolvedValue({
        id: "existing-search",
      });

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({ error: "You've already saved this search." });
      expect(prisma.savedSearch.create).not.toHaveBeenCalled();
    });

    // Regression (#8): viewport bounds must NOT be part of the dedup identity.
    // Saving "the same" search after panning/zooming the map (bounds differing by
    // >110m) used to produce a different searchSpecHash and bypass the duplicate
    // guard — burning the 10-slot cap and creating a second alert subscription.
    it("produces the same searchSpecHash when only map bounds differ (>110m)", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      const baseFilters = {
        query: "apartment",
        lat: 42.3601,
        lng: -71.0589,
        locationLabel: "Boston, MA",
      };

      await saveSearch({
        name: "First",
        filters: {
          ...baseFilters,
          minLat: 42.34,
          maxLat: 42.38,
          minLng: -71.08,
          maxLng: -71.03,
        },
      });
      // Pan the map well beyond the ~110m quantization bucket.
      await saveSearch({
        name: "Second",
        filters: {
          ...baseFilters,
          minLat: 42.5,
          maxLat: 42.6,
          minLng: -71.3,
          maxLng: -71.2,
        },
      });

      const firstHash = (prisma.savedSearch.findFirst as jest.Mock).mock
        .calls[0][0].where.searchSpecHash;
      const secondHash = (prisma.savedSearch.findFirst as jest.Mock).mock
        .calls[1][0].where.searchSpecHash;

      expect(firstHash).toEqual(secondHash);
    });

    it("rejects the second save as a duplicate when only map bounds differ", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      const baseFilters = {
        query: "apartment",
        lat: 42.3601,
        lng: -71.0589,
        locationLabel: "Boston, MA",
      };

      // First save succeeds and we capture its canonical hash.
      await saveSearch({
        name: "First",
        filters: {
          ...baseFilters,
          minLat: 42.34,
          maxLat: 42.38,
          minLng: -71.08,
          maxLng: -71.03,
        },
      });
      const firstHash = (prisma.savedSearch.findFirst as jest.Mock).mock
        .calls[0][0].where.searchSpecHash;

      // Second save (panned map) finds the same-hash row → duplicate rejection.
      (prisma.savedSearch.findFirst as jest.Mock).mockImplementation(
        async ({ where }: { where: { searchSpecHash: string } }) =>
          where.searchSpecHash === firstHash ? { id: "existing-search" } : null
      );
      (prisma.savedSearch.create as jest.Mock).mockClear();

      const result = await saveSearch({
        name: "Second",
        filters: {
          ...baseFilters,
          minLat: 42.5,
          maxLat: 42.6,
          minLng: -71.3,
          maxLng: -71.2,
        },
      });

      expect(result).toEqual({ error: "You've already saved this search." });
      expect(prisma.savedSearch.create).not.toHaveBeenCalled();
    });

    // Regression (#30): sort is ordering-only and is intentionally not part of the
    // saved-search identity. It must be stripped from the persisted filters so the
    // stored state agrees with the (sort-agnostic) dedup hash. Two saves differing
    // only by sort therefore collapse to the same hash and the second is a dup.
    it("strips sort from persisted filters and dedups across sort changes", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      await saveSearch({
        name: "Cheapest first",
        filters: { ...mockFilters, sort: "price_asc" },
      });

      const createArgs = (prisma.savedSearch.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.filters).not.toHaveProperty("sort");
      expect(createArgs.data.searchSpecJson.filters).not.toHaveProperty("sort");

      const firstHash = (prisma.savedSearch.findFirst as jest.Mock).mock
        .calls[0][0].where.searchSpecHash;

      // Same filters, different sort → identical hash.
      (prisma.savedSearch.create as jest.Mock).mockClear();
      await saveSearch({
        name: "Newest first",
        filters: { ...mockFilters, sort: "newest" },
      });
      const secondHash = (prisma.savedSearch.findFirst as jest.Mock).mock
        .calls[1][0].where.searchSpecHash;

      expect(secondHash).toEqual(firstHash);
    });

    it("saves search successfully", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(5);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      const result = await saveSearch({
        name: "My Search",
        filters: mockFilters,
        alertEnabled: true,
      });

      expect(prisma.savedSearch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-123",
          name: "My Search",
          query: "apartment",
          filters: expect.objectContaining({
            query: "apartment",
            minPrice: 500,
            maxPrice: 1500,
            roomType: "Private Room",
          }),
          searchSpecJson: expect.objectContaining({
            version: "2026-04-23.phase07-saved-search-v1",
            filters: expect.objectContaining({
              query: "apartment",
              minPrice: 500,
              maxPrice: 1500,
              roomType: "Private Room",
            }),
            requestedOccupants: 1,
          }),
          searchSpecHash: expect.any(String),
          embeddingVersionAtSave: expect.any(String),
          rankerProfileVersionAtSave: expect.any(String),
          unitIdentityEpochFloor: 1,
          active: true,
          alertEnabled: true,
          alertFrequency: "DAILY",
          alertSubscriptions: {
            create: {
              user: { connect: { id: "user-123" } },
              channel: "EMAIL",
              frequency: "DAILY",
              active: true,
            },
          },
        }),
        select: {
          id: true,
          alertEnabled: true,
        },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/saved-searches");
      expect(result).toEqual({
        success: true,
        searchId: "search-123",
        effectiveAlertState: "ACTIVE",
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("persists endDate in filters and canonical search spec", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(SAVED_SEARCH_TEST_NOW);
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      await saveSearch({
        name: "Date Range",
        filters: {
          query: "apartment",
          moveInDate: SAVED_SEARCH_MOVE_IN_DATE,
          endDate: SAVED_SEARCH_END_DATE,
        },
      });

      const createArgs = (prisma.savedSearch.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.filters).toEqual(
        expect.objectContaining({
          moveInDate: SAVED_SEARCH_MOVE_IN_DATE,
          endDate: SAVED_SEARCH_END_DATE,
        })
      );
      expect(createArgs.data.searchSpecJson.filters).toEqual(
        expect.objectContaining({
          moveInDate: SAVED_SEARCH_MOVE_IN_DATE,
          endDate: SAVED_SEARCH_END_DATE,
        })
      );
      expect(buildSearchUrl(createArgs.data.filters)).toContain(
        `endDate=${SAVED_SEARCH_END_DATE}`
      );
    });

    it("blocks suspended users before locking or creating", async () => {
      mockCheckSuspension.mockResolvedValue({
        suspended: true,
        error: "Account suspended",
      });

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({ error: "Account suspended" });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.savedSearch.create).not.toHaveBeenCalled();
    });

    it("defaults alertEnabled to true", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });

      await saveSearch({ name: "Test", filters: mockFilters });

      expect(prisma.savedSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertEnabled: true,
            alertFrequency: "DAILY",
            alertSubscriptions: {
              create: expect.objectContaining({
                channel: "EMAIL",
                frequency: "DAILY",
                active: true,
              }),
            },
          }),
        })
      );
    });

    it("returns LOCKED when alerts are enabled but no active pass exists", async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(0);
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
      });
      mockEvaluateSavedSearchAlertPaywall.mockResolvedValue({
        enabled: true,
        mode: "PAYWALL_REQUIRED",
        activePassExpiresAt: null,
        requiresPurchase: true,
        offers: [],
      });

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({
        success: true,
        searchId: "search-123",
        effectiveAlertState: "LOCKED",
      });
    });

    it("handles database errors", async () => {
      (prisma.savedSearch.count as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await saveSearch({ name: "Test", filters: mockFilters });

      expect(result).toEqual({ error: "Failed to save search" });
    });
  });

  describe("getMySavedSearches", () => {
    it("returns empty array when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getMySavedSearches();

      expect(result).toEqual([]);
    });

    it("returns user saved searches", async () => {
      const mockSearches = [
        { id: "s1", name: "Search 1", filters: {}, alertEnabled: true },
        { id: "s2", name: "Search 2", filters: {}, alertEnabled: false },
      ];
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue(
        mockSearches
      );

      const result = await getMySavedSearches();

      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual([
        { id: "s1", name: "Search 1", filters: {}, alertEnabled: true, effectiveAlertState: "ACTIVE" },
        { id: "s2", name: "Search 2", filters: {}, alertEnabled: false, effectiveAlertState: "DISABLED" },
      ]);
    });

    it("returns empty array on error", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await getMySavedSearches();

      expect(result).toEqual([]);
    });
  });

  describe("deleteSavedSearch", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await deleteSavedSearch("search-123");

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("deletes search successfully", async () => {
      (prisma.savedSearch.delete as jest.Mock).mockResolvedValue({});

      const result = await deleteSavedSearch("search-123");

      expect(prisma.savedSearch.delete).toHaveBeenCalledWith({
        where: {
          id: "search-123",
          userId: "user-123",
        },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/saved-searches");
      expect(result).toEqual({ success: true });
    });

    it("blocks suspended users from deleting saved searches", async () => {
      mockCheckSuspension.mockResolvedValue({
        suspended: true,
        error: "Account suspended",
      });

      const result = await deleteSavedSearch("search-123");

      expect(result).toEqual({ error: "Account suspended" });
      expect(prisma.savedSearch.delete).not.toHaveBeenCalled();
    });

    it("handles database errors", async () => {
      (prisma.savedSearch.delete as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await deleteSavedSearch("search-123");

      expect(result).toEqual({ error: "Failed to delete saved search" });
    });
  });

  describe("toggleSearchAlert", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await toggleSearchAlert("search-123", true);

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("enables alert", async () => {
      (prisma.savedSearch.update as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
        alertFrequency: "DAILY",
      });

      const result = await toggleSearchAlert("search-123", true);

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: "search-123",
          userId: "user-123",
        },
        data: { alertEnabled: true },
        select: { id: true, alertEnabled: true, alertFrequency: true },
      });
      expect(prisma.alertSubscription.upsert).toHaveBeenCalledWith({
        where: {
          savedSearchId_channel: {
            savedSearchId: "search-123",
            channel: "EMAIL",
          },
        },
        create: {
          savedSearchId: "search-123",
          userId: "user-123",
          channel: "EMAIL",
          frequency: "DAILY",
          active: true,
        },
        update: {
          active: true,
          frequency: "DAILY",
        },
      });
      expect(result).toEqual({
        success: true,
        effectiveAlertState: "ACTIVE",
      });
    });

    it("blocks suspended users from toggling saved-search alerts", async () => {
      mockCheckSuspension.mockResolvedValue({
        suspended: true,
        error: "Account suspended",
      });

      const result = await toggleSearchAlert("search-123", true);

      expect(result).toEqual({ error: "Account suspended" });
      expect(prisma.savedSearch.update).not.toHaveBeenCalled();
      expect(prisma.alertSubscription.upsert).not.toHaveBeenCalled();
    });

    it("disables alert", async () => {
      (prisma.savedSearch.update as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: false,
        alertFrequency: "DAILY",
      });

      const result = await toggleSearchAlert("search-123", false);

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: "search-123",
          userId: "user-123",
        },
        data: { alertEnabled: false },
        select: { id: true, alertEnabled: true, alertFrequency: true },
      });
      expect(prisma.alertSubscription.upsert).toHaveBeenCalledWith({
        where: {
          savedSearchId_channel: {
            savedSearchId: "search-123",
            channel: "EMAIL",
          },
        },
        create: {
          savedSearchId: "search-123",
          userId: "user-123",
          channel: "EMAIL",
          frequency: "DAILY",
          active: false,
        },
        update: {
          active: false,
          frequency: "DAILY",
        },
      });
      expect(result).toEqual({
        success: true,
        effectiveAlertState: "DISABLED",
      });
    });

    it("returns LOCKED when enabling alerts without an active pass", async () => {
      (prisma.savedSearch.update as jest.Mock).mockResolvedValue({
        id: "search-123",
        alertEnabled: true,
        alertFrequency: "DAILY",
      });
      mockEvaluateSavedSearchAlertPaywall.mockResolvedValue({
        enabled: true,
        mode: "PAYWALL_REQUIRED",
        activePassExpiresAt: null,
        requiresPurchase: true,
        offers: [],
      });

      const result = await toggleSearchAlert("search-123", true);

      expect(result).toEqual({
        success: true,
        effectiveAlertState: "LOCKED",
      });
    });

    it("handles database errors", async () => {
      (prisma.savedSearch.update as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await toggleSearchAlert("search-123", true);

      expect(result).toEqual({ error: "Failed to update alert setting" });
    });
  });

  describe("updateSavedSearchName", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await updateSavedSearchName("search-123", "New Name");

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("updates name successfully", async () => {
      (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

      const result = await updateSavedSearchName("search-123", "Updated Name");

      expect(prisma.savedSearch.update).toHaveBeenCalledWith({
        where: {
          id: "search-123",
          userId: "user-123",
        },
        data: { name: "Updated Name" },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/saved-searches");
      expect(result).toEqual({ success: true });
    });

    it("blocks suspended users from renaming saved searches", async () => {
      mockCheckSuspension.mockResolvedValue({
        suspended: true,
        error: "Account suspended",
      });

      const result = await updateSavedSearchName("search-123", "Updated Name");

      expect(result).toEqual({ error: "Account suspended" });
      expect(prisma.savedSearch.update).not.toHaveBeenCalled();
    });

    it("handles database errors", async () => {
      (prisma.savedSearch.update as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await updateSavedSearchName("search-123", "New Name");

      expect(result).toEqual({ error: "Failed to update search name" });
    });
  });
});
