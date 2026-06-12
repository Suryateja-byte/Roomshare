/**
 * Tests for the facet WHERE builder.
 *
 * H1 regression guard: facet queries must apply the exact same public-search
 * eligibility SQL as the list/map/count queries (shared via
 * buildPublicSearchEligibilityConditions), so facet counts can never drift
 * from actual search results. Only user-filter conditions (with sticky
 * `excludeFilter` faceting) may differ.
 */

import { buildFacetWhereConditions } from "@/lib/search/facet-where";
import {
  SEARCH_DOC_ALLOWED_SQL_LITERALS,
  buildPublicSearchEligibilityConditions,
  buildSearchDocListWhereConditions,
} from "@/lib/search/search-doc-queries";
import { joinWhereClauseWithSecurityInvariant } from "@/lib/sql-safety";

function dateInputFromNow(daysFromNow: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

// The shared eligibility block occupies the first 7 conditions; facets append
// one extra doc-status condition to keep the partial-index access path.
const ELIGIBILITY_CONDITION_COUNT = 7;
const FACET_DOC_STATUS_CONDITION = "d.status = 'ACTIVE'";

const EXCLUDE_FILTERS = [
  undefined,
  "amenities",
  "houseRules",
  "roomType",
  "price",
  "bookingMode",
] as const;

describe("buildFacetWhereConditions eligibility parity (H1)", () => {
  const inputs: Array<{
    name: string;
    filterParams: Parameters<typeof buildFacetWhereConditions>[0];
  }> = [
    { name: "no filters", filterParams: {} },
    {
      name: "minSlots + moveInDate + endDate",
      filterParams: {
        minAvailableSlots: 3,
        moveInDate: dateInputFromNow(30),
        endDate: dateInputFromNow(120),
      },
    },
  ];

  it.each(inputs)(
    "shares the list query's eligibility conditions and params ($name)",
    ({ filterParams }) => {
      const facet = buildFacetWhereConditions(filterParams);
      const list = buildSearchDocListWhereConditions(filterParams);

      expect(facet.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT)).toEqual(
        list.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT)
      );
      expect(facet.conditions[ELIGIBILITY_CONDITION_COUNT]).toBe(
        FACET_DOC_STATUS_CONDITION
      );

      const eligibility = buildPublicSearchEligibilityConditions({
        minAvailableSlots: filterParams.minAvailableSlots,
        moveInDate: filterParams.moveInDate,
        endDate: filterParams.endDate,
        startParamIndex: 1,
      });
      // Guards the seam itself: if either builder stops sourcing its base
      // conditions from buildPublicSearchEligibilityConditions, this fails.
      expect(facet.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT)).toEqual(
        eligibility.conditions
      );
      expect(list.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT)).toEqual(
        eligibility.conditions
      );
      expect(facet.params.slice(0, eligibility.params.length)).toEqual(
        list.params.slice(0, eligibility.params.length)
      );
    }
  );

  it("enforces live openSlots, suspension, statusReason, and freshness rules", () => {
    const { conditions } = buildFacetWhereConditions({ minAvailableSlots: 3 });

    expect(conditions[0]).toContain(`l."openSlots" IS NOT NULL`);
    expect(conditions[0]).toContain(`l."openSlots" >= $2`);
    expect(conditions[0]).toContain(`l."openSlots" <= l."totalSlots"`);
    expect(conditions[0]).toContain(`l."lastConfirmedAt"`);
    expect(conditions).toContain(`l.status = 'ACTIVE'`);
    expect(conditions).toContain(`u."isSuspended" = FALSE`);
    expect(conditions).toContain(
      `COALESCE(l."statusReason", '') NOT IN ('MIGRATION_REVIEW', 'ADMIN_PAUSED', 'SUPPRESSED')`
    );
  });

  it("parameterizes minAvailableSlots like the list query", () => {
    const facet = buildFacetWhereConditions({ minAvailableSlots: 3 });
    const list = buildSearchDocListWhereConditions({ minAvailableSlots: 3 });

    expect(facet.params).toEqual([3, 3]);
    expect(list.params).toEqual([3, 3]);
  });

  it.each(EXCLUDE_FILTERS)(
    "never lets excludeFilter=%s alter the eligibility block",
    (excludeFilter) => {
      const filterParams = {
        minAvailableSlots: 2,
        amenities: ["wifi"],
        houseRules: ["no smoking"],
        roomType: "Private Room",
        minPrice: 500,
        maxPrice: 2000,
        bookingMode: "PER_SLOT",
      };
      const baseline = buildFacetWhereConditions(filterParams);
      const variant = buildFacetWhereConditions(filterParams, excludeFilter);

      expect(variant.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT + 1)).toEqual(
        baseline.conditions.slice(0, ELIGIBILITY_CONDITION_COUNT + 1)
      );
    }
  );

  it("joins under the scoped SQL-literal allowlist without throwing", () => {
    const { conditions } = buildFacetWhereConditions({
      minAvailableSlots: 2,
      moveInDate: dateInputFromNow(30),
      endDate: dateInputFromNow(120),
      query: "studio",
      bounds: { minLng: -122.5, minLat: 37.7, maxLng: -122.3, maxLat: 37.8 },
    });

    expect(() =>
      joinWhereClauseWithSecurityInvariant(
        conditions,
        SEARCH_DOC_ALLOWED_SQL_LITERALS
      )
    ).not.toThrow();
  });
});
