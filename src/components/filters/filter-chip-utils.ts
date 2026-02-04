/**
 * Filter Chip Utilities
 *
 * Pure utility functions for converting URL search params to displayable
 * filter chips and manipulating filter state.
 */

import { getLanguageName } from "@/lib/languages";
import { getPriceParam } from "@/lib/search-params";

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
 * Parameters that are UI state, not filters - should be ignored for chips.
 * Kept for documentation; prefixed to avoid unused variable warnings.
 */
const _UI_STATE_PARAMS = ["page", "view", "drawerOpen"] as const;

/**
 * Parameters that represent filter state (eligible for chips).
 * Used for reference; prefixed to avoid unused variable warnings.
 */
const _FILTER_PARAMS = [
  "minPrice",
  "maxPrice",
  "amenities",
  "houseRules",
  "languages",
  "roomType",
  "leaseDuration",
  "moveInDate",
  "nearMatches",
  "genderPreference",
  "householdGender",
] as const;

type _FilterParamKey = (typeof _FILTER_PARAMS)[number];

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

  if (minPrice && maxPrice) {
    chips.push({
      id: "price-range",
      label: `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`,
      paramKey: "price-range", // Special key for combined price
    });
  } else if (minPrice) {
    chips.push({
      id: "minPrice",
      label: `Min ${formatPrice(minPrice)}`,
      paramKey: "minPrice",
    });
  } else if (maxPrice) {
    chips.push({
      id: "maxPrice",
      label: `Max ${formatPrice(maxPrice)}`,
      paramKey: "maxPrice",
    });
  }

  // Move-in date
  const moveInDate = searchParams.get("moveInDate");
  if (moveInDate) {
    chips.push({
      id: "moveInDate",
      label: `Move-in: ${formatDate(moveInDate)}`,
      paramKey: "moveInDate",
    });
  }

  // Room type
  const roomType = searchParams.get("roomType");
  if (roomType) {
    chips.push({
      id: "roomType",
      label: roomType,
      paramKey: "roomType",
    });
  }

  // Lease duration
  const leaseDuration = searchParams.get("leaseDuration");
  if (leaseDuration) {
    chips.push({
      id: "leaseDuration",
      label: leaseDuration,
      paramKey: "leaseDuration",
    });
  }

  // Amenities - one chip per amenity
  const amenities = searchParams.get("amenities");
  if (amenities) {
    const amenityList = amenities.split(",").filter(Boolean);
    for (const amenity of amenityList) {
      chips.push({
        id: `amenities:${amenity}`,
        label: amenity,
        paramKey: "amenities",
        paramValue: amenity,
      });
    }
  }

  // House rules - one chip per rule
  const houseRules = searchParams.get("houseRules");
  if (houseRules) {
    const ruleList = houseRules.split(",").filter(Boolean);
    for (const rule of ruleList) {
      chips.push({
        id: `houseRules:${rule}`,
        label: rule,
        paramKey: "houseRules",
        paramValue: rule,
      });
    }
  }

  // Languages - one chip per language, convert code to display name
  const languages = searchParams.get("languages");
  if (languages) {
    const langList = languages.split(",").filter(Boolean);
    for (const lang of langList) {
      chips.push({
        id: `languages:${lang}`,
        label: getLanguageName(lang),
        paramKey: "languages",
        paramValue: lang,
      });
    }
  }

  // Near matches toggle
  const nearMatches = searchParams.get("nearMatches");
  if (nearMatches === "1") {
    chips.push({
      id: "nearMatches",
      label: "Near matches",
      paramKey: "nearMatches",
    });
  }

  // Gender preference filter
  const genderPreference = searchParams.get("genderPreference");
  if (genderPreference && genderPreference !== "any") {
    chips.push({
      id: "genderPreference",
      label:
        genderPreference === "female"
          ? "Female Only"
          : genderPreference === "male"
            ? "Male Only"
            : genderPreference,
      paramKey: "genderPreference",
    });
  }

  // Household gender filter
  const householdGender = searchParams.get("householdGender");
  if (householdGender && householdGender !== "any") {
    chips.push({
      id: "householdGender",
      label:
        householdGender === "female"
          ? "All Female"
          : householdGender === "male"
            ? "All Male"
            : householdGender,
      paramKey: "householdGender",
    });
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
    const currentValue = newParams.get(chip.paramKey);
    if (currentValue) {
      const values = currentValue.split(",").filter(Boolean);
      const newValues = values.filter((v) => v !== chip.paramValue);
      if (newValues.length > 0) {
        newParams.set(chip.paramKey, newValues.join(","));
      } else {
        newParams.delete(chip.paramKey);
      }
    }
  }
  // Handle simple params
  else {
    newParams.delete(chip.paramKey);
  }

  // Reset to page 1 when filters change
  newParams.delete("page");

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

/**
 * Check if there are any filter chips to display
 */
export function hasFilterChips(searchParams: URLSearchParams): boolean {
  return urlToFilterChips(searchParams).length > 0;
}
