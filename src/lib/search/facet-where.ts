import "server-only";

import {
  sanitizeSearchQuery,
  isValidQuery,
  crossesAntimeridian,
} from "@/lib/data";
import { parseLocalDate } from "@/lib/utils";
import { buildPublicSearchEligibilityConditions } from "@/lib/search/search-doc-queries";

/**
 * Build base WHERE conditions for facet queries.
 * Similar to buildSearchDocWhereConditions but excludes the filter
 * we're aggregating to show all options.
 */
export interface FacetWhereBuilder {
  conditions: string[];
  params: unknown[];
  paramIndex: number;
}

export interface FacetFilterParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  endDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  roomType?: string;
  languages?: string[];
  genderPreference?: string;
  householdGender?: string;
  bookingMode?: string;
  minAvailableSlots?: number;
  bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

// H1 fix: eligibility (slot/freshness/suspension/statusReason rules) comes from
// buildPublicSearchEligibilityConditions — the same seam the list/map/count
// queries use — so facet counts cannot drift from actual search results.
// Only the user-filter blocks below (with `excludeFilter` sticky-faceting)
// remain facet-specific duplicates of the search query builder.
export function buildFacetWhereConditions(
  filterParams: FacetFilterParams,
  excludeFilter?:
    | "amenities"
    | "houseRules"
    | "roomType"
    | "price"
    | "bookingMode"
): FacetWhereBuilder {
  // SECURITY INVARIANT:
  // - All user-derived values must be pushed to `params` and referenced as $N placeholders.
  // - `conditions` entries must remain static SQL fragments.
  // - Never inject user input directly into a condition string.
  const {
    query,
    minPrice,
    maxPrice,
    amenities,
    moveInDate,
    endDate,
    leaseDuration,
    houseRules,
    roomType,
    languages,
    bounds,
    // Note: genderPreference and householdGender accessed via filterParams below
  } = filterParams;

  const { conditions, params, nextParamIndex } =
    buildPublicSearchEligibilityConditions({
      minAvailableSlots: filterParams.minAvailableSlots,
      moveInDate,
      endDate,
      startParamIndex: 1,
    });
  // Facets-only extra: preserves the partial-index access path on
  // listing_search_docs (the search_doc partial indexes are
  // "WHERE status = 'ACTIVE'"). Redundant with l.status, never wider.
  conditions.push("d.status = 'ACTIVE'");
  let paramIndex = nextParamIndex;

  // Geographic bounds filter
  if (bounds) {
    if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
      conditions.push(`(
        d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, 180, $${paramIndex + 2}, 4326)::geography
        OR d.location_geog && ST_MakeEnvelope(-180, $${paramIndex + 1}, $${paramIndex + 3}, $${paramIndex + 2}, 4326)::geography
      )`);
      params.push(bounds.minLng, bounds.minLat, bounds.maxLat, bounds.maxLng);
      paramIndex += 4;
    } else {
      conditions.push(
        `d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)::geography`
      );
      params.push(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
      paramIndex += 4;
    }
  }

  // Price range filter (exclude when aggregating price facet)
  if (excludeFilter !== "price") {
    if (minPrice !== undefined && minPrice !== null) {
      conditions.push(`d.price >= $${paramIndex++}`);
      params.push(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
      conditions.push(`d.price <= $${paramIndex++}`);
      params.push(maxPrice);
    }
  }

  // Text search filter using FTS (aligned with search-doc-queries.ts)
  // Uses plainto_tsquery for semantic search consistency
  if (query && isValidQuery(query)) {
    const sanitizedQuery = sanitizeSearchQuery(query);
    if (sanitizedQuery) {
      // P2a Fix: Use FTS instead of LIKE for semantic alignment
      // plainto_tsquery handles multi-word queries as AND by default
      conditions.push(
        `d.search_tsv @@ plainto_tsquery('english', $${paramIndex})`
      );
      params.push(sanitizedQuery);
      paramIndex++;
    }
  }

  // Room type filter (exclude when aggregating roomType facet)
  if (excludeFilter !== "roomType" && roomType) {
    conditions.push(`LOWER(d.room_type) = LOWER($${paramIndex++})`);
    params.push(roomType);
  }

  // Lease duration filter
  if (leaseDuration) {
    conditions.push(`LOWER(d.lease_duration) = LOWER($${paramIndex++})`);
    params.push(leaseDuration);
  }

  // Move-in date filter
  if (moveInDate) {
    conditions.push(
      `(d.move_in_date IS NULL OR d.move_in_date <= $${paramIndex++})`
    );
    params.push(parseLocalDate(moveInDate));
  }

  // Languages filter (OR logic)
  if (languages?.length) {
    const normalized = languages
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (normalized.length > 0) {
      conditions.push(
        `d.household_languages_lower && $${paramIndex++}::text[]`
      );
      params.push(normalized);
    }
  }

  // Amenities filter (AND logic) - exclude when aggregating amenities facet
  // Uses @> containment with GIN index, matching search query pattern (#40)
  if (excludeFilter !== "amenities" && amenities?.length) {
    const normalizedAmenities = amenities
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedAmenities.length > 0) {
      conditions.push(`d.amenities_lower @> $${paramIndex++}::text[]`);
      params.push(normalizedAmenities);
    }
  }

  // House rules filter (AND logic) - exclude when aggregating houseRules facet
  if (excludeFilter !== "houseRules" && houseRules?.length) {
    const normalizedRules = houseRules
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedRules.length > 0) {
      conditions.push(`d.house_rules_lower @> $${paramIndex++}::text[]`);
      params.push(normalizedRules);
    }
  }

  // Gender preference filter (e.g., "female", "male", "any")
  if (
    filterParams.genderPreference &&
    filterParams.genderPreference !== "any"
  ) {
    conditions.push(`d.gender_preference = $${paramIndex++}`);
    params.push(filterParams.genderPreference);
  }

  // Household gender filter (e.g., "female", "male", "mixed")
  if (filterParams.householdGender && filterParams.householdGender !== "any") {
    conditions.push(`d.household_gender = $${paramIndex++}`);
    params.push(filterParams.householdGender);
  }

  // Phase 3: Booking mode filter
  if (
    excludeFilter !== "bookingMode" &&
    filterParams.bookingMode &&
    filterParams.bookingMode !== "any"
  ) {
    conditions.push(`d."booking_mode" = $${paramIndex++}`);
    params.push(filterParams.bookingMode);
  }

  return { conditions, params, paramIndex };
}
