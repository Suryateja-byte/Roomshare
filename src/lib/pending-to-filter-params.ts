import type { BatchedFilterValues } from "@/hooks/useBatchedFilters";
import type { FilterParams } from "@/lib/search-params";

/**
 * Converts string-based BatchedFilterValues (from the filter drawer UI state)
 * into typed FilterParams (used by search/near-match logic).
 *
 * Empty strings and empty arrays become undefined so they are omitted from queries.
 */
export function pendingToFilterParams(pending: BatchedFilterValues): FilterParams {
  const parsePrice = (val: string): number | undefined => {
    if (val === "") return undefined;
    const num = Number(val);
    return Number.isFinite(num) ? num : undefined;
  };

  return {
    minPrice: parsePrice(pending.minPrice),
    maxPrice: parsePrice(pending.maxPrice),
    roomType: pending.roomType || undefined,
    leaseDuration: pending.leaseDuration || undefined,
    moveInDate: pending.moveInDate || undefined,
    amenities: pending.amenities.length > 0 ? pending.amenities : undefined,
    houseRules: pending.houseRules.length > 0 ? pending.houseRules : undefined,
    languages: pending.languages.length > 0 ? pending.languages : undefined,
    genderPreference: pending.genderPreference || undefined,
    householdGender: pending.householdGender || undefined,
  };
}
