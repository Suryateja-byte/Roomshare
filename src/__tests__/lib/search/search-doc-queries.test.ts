/**
 * Tests for SearchDoc Query Functions
 *
 * Tests the feature flag logic and SearchDoc query structure.
 */

import { isSearchDocEnabled, buildOrderByClause, buildSearchDocWhereConditions } from "@/lib/search/search-doc-queries";

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
    const statusConditions = conditions.filter(c => c.includes("d.status"));
    expect(statusConditions).toHaveLength(1);
  });

  it("requires available slots > 0 in base conditions", () => {
    const { conditions } = buildSearchDocWhereConditions({});

    expect(conditions).toContain("d.available_slots > 0");
  });

  it("starts with paramIndex 1 and no FTS when no filters applied", () => {
    const result = buildSearchDocWhereConditions({});

    // With no filters, should have only base conditions, no params
    expect(result.params).toHaveLength(0);
    expect(result.paramIndex).toBe(1);
    expect(result.ftsQueryParamIndex).toBeNull();
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
    const sorts = ["recommended", "newest", "price_asc", "price_desc", "rating"] as const;
    for (const sort of sorts) {
      const result = buildOrderByClause(sort, 2, true);
      expect(result).not.toContain("ts_rank_cd");
      // All must end with id ASC for stable ordering
      expect(result).toContain("d.id ASC");
    }
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
