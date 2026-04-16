/**
 * Tests for SearchDoc Query Functions
 *
 * Tests the feature flag logic and SearchDoc query structure.
 */

import {
  isSearchDocEnabled,
  buildOrderByClause,
  buildSearchDocListWhereConditions,
  buildSearchDocWhereConditions,
  mapRawListingsToPublic,
  mapRawMapListingsToPublic,
} from "@/lib/search/search-doc-queries";
import { buildPublicAvailability } from "@/lib/search/public-availability";

describe("buildSearchDocWhereConditions", () => {
  it("excludes listings with null coordinates from map results (F1.1)", () => {
    const { conditions } = buildSearchDocWhereConditions({});

    // Base conditions must include NOT NULL checks for lat and lng
    // This ensures listings with null coordinates never appear in map views
    expect(conditions).toContain("d.lat IS NOT NULL");
    expect(conditions).toContain("d.lng IS NOT NULL");
  });

  it("excludes PAUSED listings from search results (F2.3)", () => {
    const { conditions } = buildSearchDocWhereConditions({});

    // Base conditions must filter to ACTIVE status only
    // PAUSED, DRAFT, ARCHIVED, etc. listings must never appear in search
    expect(conditions).toContain("d.status = 'ACTIVE'");
    // Verify no other status values are included
    const statusConditions = conditions.filter((c) => c.includes("d.status"));
    expect(statusConditions).toHaveLength(1);
  });

  it("requires range-aware availability >= $1 in base conditions", () => {
    const { conditions } = buildSearchDocWhereConditions({});

    expect(conditions[0]).toContain(">= $1");
    expect(conditions[0]).toContain("generate_series");
  });

  it("defaults to >= 1 when minAvailableSlots is undefined", () => {
    const result = buildSearchDocWhereConditions({});

    expect(result.params[0]).toBe(1);
  });

  it("parameterizes >= N when minAvailableSlots is set", () => {
    const result = buildSearchDocWhereConditions({ minAvailableSlots: 3 });

    expect(result.params[0]).toBe(3);
    expect(result.conditions[0]).toContain(">= $1");
  });

  it("starts with paramIndex 2 and no FTS when no filters applied", () => {
    const result = buildSearchDocWhereConditions({});

    // With parameterized slot threshold at $1, params starts with [1]
    expect(result.params).toHaveLength(1);
    expect(result.paramIndex).toBe(2);
    expect(result.ftsQueryParamIndex).toBeNull();
  });

  describe("price filter conditions", () => {
    it("adds minPrice condition with parameterized value", () => {
      const result = buildSearchDocWhereConditions({ minPrice: 500 });

      expect(result.conditions.some((c) => c.includes("d.price >="))).toBe(
        true
      );
      expect(result.params).toContain(500);
    });

    it("adds maxPrice condition with parameterized value", () => {
      const result = buildSearchDocWhereConditions({ maxPrice: 2000 });

      expect(result.conditions.some((c) => c.includes("d.price <="))).toBe(
        true
      );
      expect(result.params).toContain(2000);
    });

    it("adds both price conditions for range filter", () => {
      const result = buildSearchDocWhereConditions({
        minPrice: 500,
        maxPrice: 2000,
      });

      const priceConditions = result.conditions.filter((c) =>
        c.includes("d.price")
      );
      expect(priceConditions).toHaveLength(2);
      expect(result.params).toContain(500);
      expect(result.params).toContain(2000);
    });

    it("ignores null price values", () => {
      const result = buildSearchDocWhereConditions({
        minPrice: null as unknown as undefined,
        maxPrice: null as unknown as undefined,
      });

      const priceConditions = result.conditions.filter((c) =>
        c.includes("d.price")
      );
      expect(priceConditions).toHaveLength(0);
    });
  });

  describe("room type and lease duration filters", () => {
    it("adds case-insensitive room type condition", () => {
      const result = buildSearchDocWhereConditions({ roomType: "Private" });

      expect(
        result.conditions.some((c) => c.includes("LOWER(d.room_type)"))
      ).toBe(true);
      expect(result.params).toContain("Private");
    });

    it("adds case-insensitive lease duration condition", () => {
      const result = buildSearchDocWhereConditions({
        leaseDuration: "6_months",
      });

      expect(
        result.conditions.some((c) => c.includes("LOWER(d.lease_duration)"))
      ).toBe(true);
      expect(result.params).toContain("6_months");
    });
  });

  describe("array filter conditions", () => {
    it("adds languages filter with OR overlap operator", () => {
      const result = buildSearchDocWhereConditions({
        languages: ["English", "Spanish"],
      });

      expect(
        result.conditions.some((c) =>
          c.includes("household_languages_lower &&")
        )
      ).toBe(true);
      // Values should be normalized to lowercase
      expect(result.params).toContainEqual(["english", "spanish"]);
    });

    it("adds house rules filter with AND containment operator", () => {
      const result = buildSearchDocWhereConditions({
        houseRules: ["No Smoking"],
      });

      expect(
        result.conditions.some((c) => c.includes("house_rules_lower @>"))
      ).toBe(true);
      expect(result.params).toContainEqual(["no smoking"]);
    });

    it("adds amenities filter with partial matching", () => {
      const result = buildSearchDocWhereConditions({
        amenities: ["Pool"],
      });

      expect(result.conditions.some((c) => c.includes("amenities_lower"))).toBe(
        true
      );
      expect(result.params).toContainEqual(["pool"]);
    });

    it("skips empty arrays", () => {
      const result = buildSearchDocWhereConditions({
        languages: [],
        amenities: [],
        houseRules: [],
      });

      const arrayConditions = result.conditions.filter(
        (c) =>
          c.includes("languages_lower") ||
          c.includes("amenities_lower") ||
          c.includes("rules_lower")
      );
      expect(arrayConditions).toHaveLength(0);
    });

    it("trims and filters empty strings from arrays", () => {
      const result = buildSearchDocWhereConditions({
        languages: ["  English  ", "", "  "],
      });

      // Only "english" should remain after trim + filter
      expect(result.params).toContainEqual(["english"]);
    });
  });

  describe("geographic bounds filter", () => {
    it("adds normal bounding box condition", () => {
      const result = buildSearchDocWhereConditions({
        bounds: {
          minLng: -122.5,
          minLat: 37.7,
          maxLng: -122.3,
          maxLat: 37.8,
        },
      });

      expect(result.conditions.some((c) => c.includes("ST_MakeEnvelope"))).toBe(
        true
      );
      expect(result.params).toContain(-122.5);
      expect(result.params).toContain(37.7);
      expect(result.params).toContain(-122.3);
      expect(result.params).toContain(37.8);
    });
  });

  describe("booking mode filter", () => {
    it("adds booking mode condition when not 'any'", () => {
      const result = buildSearchDocWhereConditions({
        bookingMode: "instant",
      });

      expect(result.conditions.some((c) => c.includes("booking_mode"))).toBe(
        true
      );
      expect(result.params).toContain("instant");
    });

    it("skips booking mode condition when 'any'", () => {
      const result = buildSearchDocWhereConditions({
        bookingMode: "any",
      });

      const bmConditions = result.conditions.filter((c) =>
        c.includes("booking_mode")
      );
      expect(bmConditions).toHaveLength(0);
    });
  });
});

describe("buildSearchDocListWhereConditions", () => {
  it("adds migration-review and host-managed freshness guards to list search", () => {
    const result = buildSearchDocListWhereConditions({});

    expect(result.conditions).toContain(`COALESCE(l."needsMigrationReview", FALSE) = FALSE`);
    expect(result.conditions).toContain(`COALESCE(l."statusReason", '') <> 'MIGRATION_REVIEW'`);
    expect(result.conditions[0]).toContain(`l."availabilitySource" = 'HOST_MANAGED'`);
    expect(result.conditions[0]).toContain(`NOW() - INTERVAL '21 days'`);
    expect(result.params).toEqual([1, 1]);
  });

  it("enforces the requested move-in lower bound inside the host-managed list predicate", () => {
    const result = buildSearchDocListWhereConditions({
      moveInDate: "2026-05-01",
    });

    expect(result.conditions[0]).toContain(`l."moveInDate"::date <= $4::date`);
    expect(result.conditions[0]).toContain(
      `l."availableUntil"::date >= $4::date`
    );
  });
});

describe("buildOrderByClause", () => {
  it("includes ts_rank_cd for offset pagination with FTS", () => {
    const result = buildOrderByClause("recommended", 3, false);
    expect(result).toContain("ts_rank_cd");
    expect(result).toContain("$3");
  });

  it("skips ts_rank_cd for keyset pagination with FTS", () => {
    const result = buildOrderByClause("recommended", 3, true);
    expect(result).not.toContain("ts_rank_cd");
    // Must still have the sort columns the cursor captures
    expect(result).toContain("d.recommended_score DESC");
    expect(result).toContain("d.listing_created_at DESC");
    expect(result).toContain("d.id ASC");
  });

  it("skips ts_rank_cd when no FTS regardless of keyset flag", () => {
    const offset = buildOrderByClause("recommended", null, false);
    const keyset = buildOrderByClause("recommended", null, true);
    expect(offset).not.toContain("ts_rank_cd");
    expect(keyset).not.toContain("ts_rank_cd");
    // Both should produce identical ORDER BY when no FTS
    expect(offset).toBe(keyset);
  });

  it("defaults useKeysetPagination to false", () => {
    const explicit = buildOrderByClause("price_asc", 5, false);
    const defaulted = buildOrderByClause("price_asc", 5);
    expect(explicit).toBe(defaulted);
    expect(explicit).toContain("ts_rank_cd");
  });

  it("works correctly for all sort options with keyset", () => {
    const sorts = [
      "recommended",
      "newest",
      "price_asc",
      "price_desc",
      "rating",
    ] as const;
    for (const sort of sorts) {
      const result = buildOrderByClause(sort, 2, true);
      expect(result).not.toContain("ts_rank_cd");
      // All must end with id ASC for stable ordering
      expect(result).toContain("d.id ASC");
    }
  });
});

describe("SearchDoc projection mapping", () => {
  function createHostManagedRaw(overrides: Record<string, unknown> = {}) {
    return {
      id: "listing-1",
      title: "Host Managed Listing",
      description: "Quiet room",
      price: 1200,
      images: ["img-1.jpg"],
      availableSlots: 2,
      totalSlots: 4,
      availabilitySource: "HOST_MANAGED" as const,
      openSlots: 2,
      availableUntil: "2026-12-01",
      minStayMonths: 3,
      lastConfirmedAt: "2026-04-15T12:30:00.000Z",
      status: "ACTIVE",
      statusReason: null,
      amenities: ["WiFi"],
      houseRules: ["No Smoking"],
      householdLanguages: ["English"],
      primaryHomeLanguage: "English",
      leaseDuration: "6_months",
      roomType: "private",
      moveInDate: "2026-06-01",
      viewCount: 10,
      city: "San Francisco",
      state: "CA",
      lat: 37.7749,
      lng: -122.4194,
      avgRating: 4.5,
      reviewCount: 8,
      primaryImage: "img-1.jpg",
      recommendedScore: 12.4,
      createdAt: "2026-01-15T00:00:00.000Z",
      ...overrides,
    };
  }

  it("suppresses invalid HOST_MANAGED rows from list projection", () => {
    const results = mapRawListingsToPublic([
      createHostManagedRaw({
        openSlots: 0,
      }),
    ]);

    expect(results).toEqual([]);
  });

  it("suppresses stale HOST_MANAGED rows from list projection", () => {
    const results = mapRawListingsToPublic([
      createHostManagedRaw({
        lastConfirmedAt: "2026-03-20T12:30:00.000Z",
      }),
    ]);

    expect(results).toEqual([]);
  });

  it("suppresses migration-review rows from list projection even with positive slots", () => {
    const results = mapRawListingsToPublic([
      createHostManagedRaw({
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: true,
      }),
      createHostManagedRaw({
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: false,
        statusReason: "MIGRATION_REVIEW",
      }),
    ]);

    expect(results).toEqual([]);
  });

  it("suppresses invalid HOST_MANAGED rows from map projection", () => {
    const results = mapRawMapListingsToPublic([
      createHostManagedRaw({
        openSlots: 0,
      }),
    ]);

    expect(results).toEqual([]);
  });

  it("keeps map and list availability fields aligned for valid HOST_MANAGED rows", () => {
    const listResult = mapRawListingsToPublic([createHostManagedRaw()])[0];
    const mapResult = mapRawMapListingsToPublic([createHostManagedRaw()])[0];

    expect(listResult.publicAvailability).toMatchObject(
      buildPublicAvailability({
        availabilitySource: "HOST_MANAGED",
        openSlots: 2,
        totalSlots: 4,
        availableFrom: "2026-06-01",
        availableUntil: "2026-12-01",
        minStayMonths: 3,
        lastConfirmedAt: "2026-04-15T12:30:00.000Z",
      })
    );
    expect(mapResult.publicAvailability).toMatchObject(
      listResult.publicAvailability
    );
    expect(mapResult.availabilitySource).toBe(
      mapResult.publicAvailability.availabilitySource
    );
    expect(mapResult.availableSlots).toBe(mapResult.publicAvailability.openSlots);
    expect(mapResult.totalSlots).toBe(mapResult.publicAvailability.totalSlots);
  });
});

describe("search-doc-queries", () => {
  describe("isSearchDocEnabled", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment before each test
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    describe("URL override takes precedence", () => {
      it("returns true when URL param is '1'", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("1")).toBe(true);
      });

      it("returns true when URL param is 'true'", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("true")).toBe(true);
      });

      it("returns false when URL param is '0'", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("0")).toBe(false);
      });

      it("returns false when URL param is 'false'", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("false")).toBe(false);
      });
    });

    describe("environment variable fallback", () => {
      it("returns true when env is 'true' and no URL override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled(null)).toBe(true);
        expect(isSearchDocEnabled(undefined)).toBe(true);
        expect(isSearchDocEnabled("")).toBe(true);
      });

      it("returns false when env is 'false' and no URL override", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled(null)).toBe(false);
        expect(isSearchDocEnabled(undefined)).toBe(false);
      });

      it("returns false when env is not set", () => {
        delete process.env.ENABLE_SEARCH_DOC;
        expect(isSearchDocEnabled(null)).toBe(false);
        expect(isSearchDocEnabled(undefined)).toBe(false);
      });

      it("returns false for invalid env values", () => {
        process.env.ENABLE_SEARCH_DOC = "yes";
        expect(isSearchDocEnabled(null)).toBe(false);

        process.env.ENABLE_SEARCH_DOC = "1";
        expect(isSearchDocEnabled(null)).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("handles empty string URL param as no override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("")).toBe(true);

        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("")).toBe(false);
      });

      it("handles whitespace URL param as no override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        // Whitespace is not a valid override value
        expect(isSearchDocEnabled(" ")).toBe(true);
      });
    });
  });
});
