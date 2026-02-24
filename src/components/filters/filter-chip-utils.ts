/**
 * Filter Chip Utilities
 *
 * Pure utility functions for converting URL search params to displayable
 * filter chips and manipulating filter state.
 */

import { getLanguageName } from "@/lib/languages";
import { getPriceParam } from "@/lib/search-params";
import { LEASE_DURATION_ALIASES, VALID_LEASE_DURATIONS, VALID_AMENITIES, VALID_HOUSE_RULES, VALID_ROOM_TYPES } from "@/lib/filter-schema";

/**
 * Represents a single filter chip that can be displayed and removed
 */
export interface FilterChipData {
  /** Unique identifier for the chip (param key or param:value for arrays) */
  id: string;
  /** Display label shown to the user */
  label: string;
  /** URL parameter key this chip represents */
  paramKey: string;
  /** Value to remove (for array params like amenities) */
  paramValue?: string;
}

/**
 * Parameters that should be preserved when clearing filters.
 * These represent search context, not removable filter chips.
 */
const PRESERVED_PARAMS = [
  "q",
  "lat",
  "lng",
  "minLat",
  "maxLat",
  "minLng",
  "maxLng",
  "sort",
] as const;

/**
 * Format a price value for display
 */
function formatPrice(value: number | string): string {
  const num = typeof value === "number" ? value : parseInt(value, 10);
  if (isNaN(num)) return String(value);
  return `$${num.toLocaleString()}`;
}

/**
 * Format a date string (YYYY-MM-DD) for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Parse array-like URL params that may be encoded as repeated params
 * (?languages=en&languages=te) and/or CSV (?languages=en,te).
 */
function parseArrayParam(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Convert URLSearchParams to an array of filter chips
 */
export function urlToFilterChips(
  searchParams: URLSearchParams,
): FilterChipData[] {
  const chips: FilterChipData[] = [];

  // Price range handling - combine min and max into one chip if both present
  // getPriceParam handles budget aliases (minBudget/maxBudget) with canonical precedence
  const minPrice = getPriceParam(searchParams, "min");
  const maxPrice = getPriceParam(searchParams, "max");

  if (minPrice !== undefined && maxPrice !== undefined) {
    chips.push({
      id: "price-range",
      label: `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`,
      paramKey: "price-range", // Special key for combined price
    });
  } else if (minPrice !== undefined) {
    chips.push({
      id: "minPrice",
      label: `Min ${formatPrice(minPrice)}`,
      paramKey: "minPrice",
    });
  } else if (maxPrice !== undefined) {
    chips.push({
      id: "maxPrice",
      label: `Max ${formatPrice(maxPrice)}`,
      paramKey: "maxPrice",
    });
  }

  // Move-in date — validate before creating chip (mirrors server-side safeParseDate)
  const moveInDate = searchParams.get("moveInDate");
  if (moveInDate) {
    const trimmed = moveInDate.trim();
    let isValidDate = false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 2);
        if (date >= today && date <= maxDate) {
          isValidDate = true;
        }
      }
    }
    if (isValidDate) {
      chips.push({
        id: "moveInDate",
        label: `Move-in: ${formatDate(trimmed)}`,
        paramKey: "moveInDate",
      });
    }
  }

  // Room type (validated against allowlist)
  const roomType = searchParams.get("roomType");
  if (roomType) {
    const lower = roomType.toLowerCase();
    const canonical = (VALID_ROOM_TYPES as readonly string[]).find(
      (v) => v.toLowerCase() === lower
    );
    if (canonical && canonical !== "any") {
      chips.push({
        id: "roomType",
        label: canonical,
        paramKey: "roomType",
      });
    }
  }

  // Lease duration — resolve aliases to canonical form
  const leaseDuration = searchParams.get("leaseDuration");
  if (leaseDuration && leaseDuration !== "any") {
    const lower = leaseDuration.toLowerCase();
    const resolved = LEASE_DURATION_ALIASES[lower]
      ?? (VALID_LEASE_DURATIONS as readonly string[]).find(v => v.toLowerCase() === lower);
    if (resolved && resolved !== "any") {
      chips.push({
        id: "leaseDuration",
        label: resolved,
        paramKey: "leaseDuration",
      });
    }
  }

  // Amenities - one chip per amenity (validated + deduplicated)
  const amenityList = parseArrayParam(searchParams, "amenities");
  if (amenityList.length > 0) {
    const seen = new Set<string>();
    for (const amenity of amenityList) {
      const lower = amenity.toLowerCase();
      const canonical = (VALID_AMENITIES as readonly string[]).find(
        (v) => v.toLowerCase() === lower
      );
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        chips.push({
          id: `amenities:${canonical}`,
          label: canonical,
          paramKey: "amenities",
          paramValue: canonical,
        });
      }
    }
  }

  // House rules - one chip per rule (validated + deduplicated)
  const ruleList = parseArrayParam(searchParams, "houseRules");
  if (ruleList.length > 0) {
    const seen = new Set<string>();
    for (const rule of ruleList) {
      const lower = rule.toLowerCase();
      const canonical = (VALID_HOUSE_RULES as readonly string[]).find(
        (v) => v.toLowerCase() === lower
      );
      if (canonical && !seen.has(canonical)) {
        seen.add(canonical);
        chips.push({
          id: `houseRules:${canonical}`,
          label: canonical,
          paramKey: "houseRules",
          paramValue: canonical,
        });
      }
    }
  }

  // Languages - one chip per language (validated + deduplicated)
  const langList = parseArrayParam(searchParams, "languages");
  if (langList.length > 0) {
    const seen = new Set<string>();
    for (const lang of langList) {
      const displayName = getLanguageName(lang);
      // Skip if getLanguageName returns the raw code (meaning it's not a recognized language)
      if (displayName !== lang && !seen.has(lang)) {
        seen.add(lang);
        chips.push({
          id: `languages:${lang}`,
          label: displayName,
          paramKey: "languages",
          paramValue: lang,
        });
      }
    }
  }

  // Near matches toggle
  const nearMatches = searchParams.get("nearMatches");
  if (nearMatches === "1" || nearMatches === "true") {
    chips.push({
      id: "nearMatches",
      label: "Near matches",
      paramKey: "nearMatches",
    });
  }

  // Gender preference filter (validated)
  const genderPreference = searchParams.get("genderPreference");
  if (genderPreference && genderPreference !== "any") {
    const validGenderValues: Record<string, string> = {
      female: "Female Only",
      male: "Male Only",
      female_only: "Female Only",
      male_only: "Male Only",
      no_preference: "No Preference",
    };
    const label = validGenderValues[genderPreference.toLowerCase()];
    if (label) {
      chips.push({
        id: "genderPreference",
        label,
        paramKey: "genderPreference",
      });
    }
  }

  // Household gender filter (validated)
  const householdGender = searchParams.get("householdGender");
  if (householdGender && householdGender !== "any") {
    const validHouseholdValues: Record<string, string> = {
      female: "All Female",
      male: "All Male",
      all_female: "All Female",
      all_male: "All Male",
      mixed: "Mixed",
    };
    const label = validHouseholdValues[householdGender.toLowerCase()];
    if (label) {
      chips.push({
        id: "householdGender",
        label,
        paramKey: "householdGender",
      });
    }
  }

  return chips;
}

/**
 * Remove a filter from the URL, returning the new query string
 */
export function removeFilterFromUrl(
  searchParams: URLSearchParams,
  chip: FilterChipData,
): string {
  const newParams = new URLSearchParams(searchParams);

  // Handle combined price range (includes budget aliases)
  if (chip.paramKey === "price-range") {
    newParams.delete("minPrice");
    newParams.delete("maxPrice");
    newParams.delete("minBudget");
    newParams.delete("maxBudget");
  }
  // Handle array params (amenities, houseRules, languages)
  else if (chip.paramValue) {
    const values = parseArrayParam(newParams, chip.paramKey);
    if (values.length > 0) {
      const newValues = values.filter((v) => v !== chip.paramValue);
      // Normalize to a single CSV param after removal for URL consistency.
      newParams.delete(chip.paramKey);
      if (newValues.length > 0) {
        newParams.set(chip.paramKey, newValues.join(","));
      }
    }
  }
  // Handle simple params
  else {
    newParams.delete(chip.paramKey);
  }

  // Reset to page 1 when filters change
  newParams.delete("page");
  newParams.delete("cursor");
  newParams.delete("cursorStack");
  newParams.delete("pageNumber");

  return newParams.toString();
}

/**
 * Clear all filters, preserving location and sort params.
 * Returns the new query string.
 */
export function clearAllFilters(searchParams: URLSearchParams): string {
  const newParams = new URLSearchParams();

  // Preserve location and sort params
  for (const key of PRESERVED_PARAMS) {
    const value = searchParams.get(key);
    if (value) {
      newParams.set(key, value);
    }
  }

  return newParams.toString();
}

/** Quick check — returns true if any filter param is set (no chip construction) */
export const FILTER_PARAM_KEYS = [
  'minPrice', 'maxPrice', 'minBudget', 'maxBudget',
  'moveInDate', 'roomType', 'leaseDuration',
  'amenities', 'houseRules', 'languages',
  'genderPreference', 'householdGender', 'nearMatches',
] as const;

export function hasAnyFilter(searchParams: URLSearchParams): boolean {
  return FILTER_PARAM_KEYS.some(k => {
    const v = searchParams.get(k);
    if (v === null || v === '' || v === 'any') return false;
    if (k === 'nearMatches' && (v === '0' || v === 'false')) return false;
    return true;
  });
}

/**
 * Check if there are any filter chips to display
 */
export function hasFilterChips(searchParams: URLSearchParams): boolean {
  return urlToFilterChips(searchParams).length > 0;
}
