import "server-only";

import { logger } from "@/lib/logger";
import {
  detectLegacyUrlAliases,
  normalizeSearchFilters as normalizeLegacySearchFilters,
} from "@/lib/search-params";
import { recordLegacyUrlUsage } from "@/lib/search/search-telemetry";
import {
  normalizedSearchQueryToSearchFilters,
  type SearchFilters,
} from "@/lib/search-utils";
import { z } from "zod";

/**
 * Zod schema for validating SavedSearch.filters JSON field on read.
 * Uses .passthrough() to allow future fields without breaking existing data.
 */
const savedSearchFiltersSchema = z
  .object({
    query: z.string().optional(),
    locationLabel: z.string().optional(),
    vibeQuery: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    roomType: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    houseRules: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    moveInDate: z.string().optional(),
    leaseDuration: z.string().optional(),
    genderPreference: z.string().optional(),
    householdGender: z.string().optional(),
    bookingMode: z.string().optional(),
    minSlots: z.number().optional(),
    nearMatches: z.boolean().optional(),
    sort: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    minLat: z.number().optional(),
    maxLat: z.number().optional(),
    minLng: z.number().optional(),
    maxLng: z.number().optional(),
    city: z.string().optional(),
  })
  .passthrough();

/**
 * SavedSearch.filters persists the map viewport as FLAT keys — see
 * `savedSearchFiltersWriteSchema` in app/actions/saved-search.ts — but
 * `normalizeSearchFilters` from @/lib/search-params reads only a NESTED
 * `bounds` object. Assemble one here so the existing validation, clamping and
 * inverted-range handling in `normalizeBoundsInput` applies rather than being
 * reimplemented. A row that already carries a nested `bounds` wins.
 */
function resolveStoredBounds(stored: Record<string, unknown>): unknown {
  if (stored.bounds && typeof stored.bounds === "object") {
    return stored.bounds;
  }

  return {
    minLat: stored.minLat,
    maxLat: stored.maxLat,
    minLng: stored.minLng,
    maxLng: stored.maxLng,
  };
}

/**
 * Clamp a stored point coordinate to its valid range. `normalizeSearchFilters`
 * has no lat/lng passthrough, so these are carried across directly; clamping
 * matches how the live URL path treats them (safeParseFloat with ±90 / ±180 in
 * parseSearchParams).
 */
function clampCoordinate(value: unknown, limit: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(-limit, Math.min(limit, value));
}

/** Safely parse filters JSON from DB, returning null on invalid data. */
export function parseSavedSearchFilters(raw: unknown): SearchFilters | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const alias of detectLegacyUrlAliases(
      raw as Record<string, string | string[] | number | boolean | undefined>
    )) {
      recordLegacyUrlUsage({ alias, surface: "saved-search" });
    }
  }

  const result = savedSearchFiltersSchema.safeParse(raw);
  if (!result.success) {
    logger.sync.warn(
      "Invalid saved search filters in DB, falling back to empty",
      {
        action: "parseSavedSearchFilters",
        error: result.error.message,
      }
    );
    return null;
  }

  const legacyCompatibleInput = result.data as Record<string, unknown>;
  const normalized = normalizeLegacySearchFilters(
    {
      ...legacyCompatibleInput,
      locationLabel:
        legacyCompatibleInput.locationLabel ?? legacyCompatibleInput.where,
      minPrice:
        legacyCompatibleInput.minPrice ?? legacyCompatibleInput.minBudget,
      maxPrice:
        legacyCompatibleInput.maxPrice ?? legacyCompatibleInput.maxBudget,
      minAvailableSlots:
        legacyCompatibleInput.minAvailableSlots ??
        legacyCompatibleInput.minSlots,
      bounds: resolveStoredBounds(legacyCompatibleInput),
    },
    {
      invalidRange: "drop",
      overlongText: "truncate",
    }
  );

  return normalizedSearchQueryToSearchFilters({
    query: normalized.query,
    locationLabel: normalized.locationLabel,
    vibeQuery: normalized.vibeQuery,
    minPrice: normalized.minPrice,
    maxPrice: normalized.maxPrice,
    amenities: normalized.amenities,
    moveInDate: normalized.moveInDate,
    endDate: normalized.endDate,
    leaseDuration: normalized.leaseDuration,
    houseRules: normalized.houseRules,
    languages: normalized.languages,
    roomType: normalized.roomType,
    genderPreference: normalized.genderPreference,
    householdGender: normalized.householdGender,
    bookingMode: normalized.bookingMode,
    minSlots: normalized.minAvailableSlots,
    lat: clampCoordinate(legacyCompatibleInput.lat, 90),
    lng: clampCoordinate(legacyCompatibleInput.lng, 180),
    bounds: normalized.bounds,
    sort: normalized.sort,
    nearMatches: normalized.nearMatches,
  });
}
