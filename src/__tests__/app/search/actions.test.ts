/**
 * Tests for fetchMoreListings server action timeout protection.
 * Verifies that executeSearchV2 is wrapped with withTimeout and
 * that a timeout gracefully falls back to V1 (empty result).
 */

// Mock next/headers before imports
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

// Mock rate limiting — always allow
jest.mock("@/lib/with-rate-limit", () => ({
  checkServerComponentRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

// Mock env — enable V2
jest.mock("@/lib/env", () => ({
  features: { searchV2: true },
}));

jest.mock("@/lib/search/search-telemetry", () => ({
  recordSearchLoadMoreError: jest.fn(),
  recordSearchRequestLatency: jest.fn(),
  recordSearchV2Fallback: jest.fn(),
}));

// Mock search-params helpers
jest.mock("@/lib/search-params", () => ({
  parseSearchParams: jest.fn((raw: { q?: string }) => ({
    q: raw.q,
    locationLabel: undefined,
    what: undefined,
    requestedPage: 1,
    sortOption: "recommended",
    boundsRequired: false,
    browseMode: false,
    filterParams: {
      query: raw.q,
      vibeQuery: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      amenities: undefined,
      moveInDate: undefined,
      leaseDuration: undefined,
      houseRules: undefined,
      languages: undefined,
      roomType: undefined,
      genderPreference: undefined,
      householdGender: undefined,
      bookingMode: undefined,
      minAvailableSlots: undefined,
      nearMatches: undefined,
      bounds: undefined,
      sort: "recommended",
    },
  })),
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({ q: "test" }),
  normalizeSearchFilters: jest.fn((raw: { q?: string; query?: string }) => ({
    query: raw.query ?? raw.q,
    locationLabel: undefined,
    vibeQuery: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    amenities: undefined,
    moveInDate: undefined,
    endDate: undefined,
    leaseDuration: undefined,
    houseRules: undefined,
    languages: undefined,
    roomType: undefined,
    genderPreference: undefined,
    householdGender: undefined,
    bookingMode: undefined,
    bounds: undefined,
    minAvailableSlots: undefined,
    nearMatches: undefined,
    sort: "recommended",
  })),
}));

// Mock V2 search service
const mockExecuteSearchV2 = jest.fn();
jest.mock("@/lib/search/search-v2-service", () => ({
  executeSearchV2: (...args: unknown[]) => mockExecuteSearchV2(...args),
}));

// Mock V1 fallback (used by the legacy-cursor degraded path)
jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
}));

// Mock the legacy cursor codec deterministically (avoids depending on the real
// env/CURSOR_SECRET, which is stubbed away by the env mock above). The real
// codec round-trips {p:N}; this mirrors that contract for the V1 fallback path.
jest.mock("@/lib/search/hash", () => ({
  encodeCursor: (page: number) => `legacy:${page}`,
  decodeCursor: (cursor: string) =>
    cursor.startsWith("legacy:") ? Number(cursor.slice("legacy:".length)) : null,
}));

// Mock timeout-wrapper — pass through by default, controllable per test
const mockWithTimeout = jest.fn();
jest.mock("@/lib/timeout-wrapper", () => {
  const actual = jest.requireActual("@/lib/timeout-wrapper");
  return {
    ...actual,
    withTimeout: (...args: unknown[]) => mockWithTimeout(...args),
  };
});

import { fetchMoreListings } from "@/app/search/actions";
import { TimeoutError, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import { getListingsPaginated } from "@/lib/data";

const mockGetListingsPaginated = getListingsPaginated as jest.MockedFunction<
  typeof getListingsPaginated
>;

describe("fetchMoreListings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: withTimeout passes through the promise
    mockWithTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  });

  it("wraps executeSearchV2 with withTimeout using DATABASE timeout", async () => {
    const v2Data = {
      response: { list: { fullItems: [{ id: "1" }], nextCursor: "cursor-2" } },
      paginatedResult: {
        items: [{ id: "1" }],
        nextCursor: "cursor-2",
        hasNextPage: true,
      },
    };
    mockExecuteSearchV2.mockResolvedValue(v2Data);

    const result = await fetchMoreListings("cursor-1", { q: "test" });

    // withTimeout was called with the promise, DATABASE timeout, and label
    expect(mockWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      DEFAULT_TIMEOUTS.DATABASE,
      "fetchMoreListings-executeSearchV2"
    );

    // Result passes through from V2
    expect(result).toEqual(
      expect.objectContaining({
        items: [{ id: "1" }],
        nextCursor: "cursor-2",
        hasNextPage: true,
      })
    );
    expect(result.meta).toBeTruthy();
  });

  it("falls back gracefully when V2 times out", async () => {
    // withTimeout rejects with TimeoutError
    mockWithTimeout.mockRejectedValue(
      new TimeoutError(
        "fetchMoreListings-executeSearchV2",
        DEFAULT_TIMEOUTS.DATABASE
      )
    );

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchMoreListings("cursor-1", { q: "test" });

    // Falls back to V1 empty result with degraded signal (cursor pagination not supported in V1)
    expect(result).toEqual(
      expect.objectContaining({
        items: [],
        nextCursor: null,
        hasNextPage: false,
        degraded: true,
      })
    );
    expect(result.meta).toBeTruthy();

    // Warning was logged for V2 failure (via logger.sync.warn: "[timestamp] [WARN]", message, metadata)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[WARN]"),
      expect.stringContaining("[fetchMoreListings] V2 failed"),
      expect.objectContaining({ error: expect.stringContaining("timed out") })
    );

    warnSpy.mockRestore();
  });

  it("returns V2 result when it succeeds within timeout", async () => {
    const v2Data = {
      response: {
        list: { fullItems: [{ id: "a" }, { id: "b" }], nextCursor: "next" },
      },
      paginatedResult: {
        items: [{ id: "a" }, { id: "b" }],
        nextCursor: "next",
        hasNextPage: true,
      },
    };
    mockExecuteSearchV2.mockResolvedValue(v2Data);

    const result = await fetchMoreListings("c1", { q: "sf" });

    expect(result).toEqual(
      expect.objectContaining({
        items: [{ id: "a" }, { id: "b" }],
        nextCursor: "next",
        hasNextPage: true,
      })
    );
    expect(result.meta).toBeTruthy();
  });

  it("sanitizes raw paginated V2 items when fullItems is unavailable", async () => {
    const publicAvailability = buildPublicAvailability({
      availableSlots: 1,
      totalSlots: 2,
    });
    const v2Data = {
      response: {
        list: { nextCursor: "next" },
      },
      paginatedResult: {
        items: [
          {
            id: "private-1",
            title: "Private listing",
            description: "Call 555-123-4567",
            price: 1200,
            images: ["img.jpg"],
            availableSlots: 1,
            totalSlots: 2,
            amenities: [],
            houseRules: [],
            householdLanguages: [],
            ownerId: "owner-secret",
            location: {
              address: "123 Private St",
              city: "Austin",
              state: "TX",
              zip: "78701",
              lat: 30.26721,
              lng: -97.74312,
            },
            publicAvailability,
            groupKey: "private-unit:1",
          },
        ],
        nextCursor: "next",
        hasNextPage: true,
      },
    };
    mockExecuteSearchV2.mockResolvedValue(v2Data);

    const result = await fetchMoreListings("c1", { q: "sf" });
    const serialized = JSON.stringify(result.items[0]);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: "private-1",
        description: "",
        location: {
          city: "Austin",
          state: "TX",
          lat: 30.27,
          lng: -97.74,
        },
      })
    );
    expect(serialized).not.toContain("owner-secret");
    expect(serialized).not.toContain("123 Private St");
    expect(serialized).not.toContain("78701");
    expect(serialized).not.toContain("private-unit");
  });

  it("returns a structured snapshotExpired result when the pinned search cursor is stale", async () => {
    mockExecuteSearchV2.mockResolvedValue({
      response: null,
      paginatedResult: null,
      snapshotExpired: {
        queryHash: "query-hash-1",
        reason: "search_contract_changed",
      },
    });

    const result = await fetchMoreListings("cursor-1", { q: "test" });

    expect(result).toEqual(
      expect.objectContaining({
        items: [],
        nextCursor: null,
        hasNextPage: false,
        snapshotExpired: {
          queryHash: "query-hash-1",
          reason: "search_contract_changed",
        },
      })
    );
    expect(result.meta).toBeTruthy();
  });

  // Regression for search-audit-2026-06-18 finding #7: during a V2 outage the
  // SSR V1 fallback hands out a legacy {p:N} offset cursor; "Load more" must keep
  // working by decoding it and continuing offset pagination via getListingsPaginated.
  describe("V1 fallback with legacy offset cursor (degraded mode)", () => {
    const v1Listing = {
      id: "v1-listing-1",
      title: "V1 listing",
      description: "",
      price: 1000,
      images: ["img.jpg"],
      availableSlots: 1,
      totalSlots: 2,
      amenities: [],
      houseRules: [],
      householdLanguages: [],
      ownerId: "owner-1",
      location: {
        address: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        lat: 30.26721,
        lng: -97.74312,
      },
      publicAvailability: buildPublicAvailability({
        availableSlots: 1,
        totalSlots: 2,
      }),
      groupKey: "v1-unit:1",
    };

    it("continues pagination and emits a next cursor when more V1 pages remain", async () => {
      // V2 fails -> falls through to the V1 legacy-cursor branch.
      mockWithTimeout.mockRejectedValue(
        new TimeoutError(
          "fetchMoreListings-executeSearchV2",
          DEFAULT_TIMEOUTS.DATABASE
        )
      );
      mockGetListingsPaginated.mockResolvedValue({
        items: [v1Listing],
        total: 80,
        page: 2,
        limit: 12,
        totalPages: 7,
      } as never);
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // cursor "legacy:2" decodes to page 2 via the mocked codec.
      const result = await fetchMoreListings("legacy:2", { q: "test" });

      expect(mockGetListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 12 })
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("v1-listing-1");
      // page 2 < totalPages 7 -> next cursor for page 3, NOT degraded.
      expect(result.nextCursor).toBe("legacy:3");
      expect(result.hasNextPage).toBe(true);
      expect(result.degraded).toBeUndefined();

      warnSpy.mockRestore();
    });

    it("returns no next cursor on the last V1 page", async () => {
      mockWithTimeout.mockRejectedValue(
        new TimeoutError(
          "fetchMoreListings-executeSearchV2",
          DEFAULT_TIMEOUTS.DATABASE
        )
      );
      mockGetListingsPaginated.mockResolvedValue({
        items: [v1Listing],
        total: 80,
        page: 7,
        limit: 12,
        totalPages: 7,
      } as never);
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const result = await fetchMoreListings("legacy:7", { q: "test" });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(result.hasNextPage).toBe(false);
      expect(result.degraded).toBeUndefined();

      warnSpy.mockRestore();
    });

    it("still signals degraded when the cursor is not a legacy offset cursor", async () => {
      mockWithTimeout.mockRejectedValue(
        new TimeoutError(
          "fetchMoreListings-executeSearchV2",
          DEFAULT_TIMEOUTS.DATABASE
        )
      );
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // "cursor-1" is not decodable as legacy -> keeps the existing degraded path.
      const result = await fetchMoreListings("cursor-1", { q: "test" });

      expect(mockGetListingsPaginated).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          items: [],
          nextCursor: null,
          hasNextPage: false,
          degraded: true,
        })
      );

      warnSpy.mockRestore();
    });
  });
});
