import type { ParsedSearchParams } from "@/lib/search-params";
import type { FilterParams, SortOption } from "@/lib/search-types";

export type ProjectionReadUnsupportedReason =
  | "query"
  | "vibe_query"
  | "amenities"
  | "house_rules"
  | "languages"
  | "lease_duration"
  | "end_date"
  | "near_matches"
  | "sort";

export interface ProjectionReadEligibility {
  supported: boolean;
  unsupportedReasons: ProjectionReadUnsupportedReason[];
}

/**
 * Sort options the projection engine cannot rank faithfully. The projection
 * tables carry no rating/review/recommended_score column and only a
 * write-bumped updated_at (not listing-creation) timestamp, so these sorts
 * would diverge from the SearchDoc/V1 engines (audit findings #3, #4). They
 * are routed to those engines instead to keep ordering consistent.
 */
const PROJECTION_UNSUPPORTED_SORTS: ReadonlySet<SortOption> = new Set([
  "recommended",
  "rating",
  "newest",
]);

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(value: string[] | undefined): boolean {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
}

function isUnsupportedSort(sort: SortOption | undefined): boolean {
  return sort !== undefined && PROJECTION_UNSUPPORTED_SORTS.has(sort);
}

export function getProjectionReadEligibilityForFilterParams(
  filterParams: FilterParams
): ProjectionReadEligibility {
  const unsupportedReasons: ProjectionReadUnsupportedReason[] = [];

  if (hasText(filterParams.query)) unsupportedReasons.push("query");
  if (hasText(filterParams.vibeQuery)) unsupportedReasons.push("vibe_query");
  if (hasItems(filterParams.amenities)) unsupportedReasons.push("amenities");
  if (hasItems(filterParams.houseRules)) unsupportedReasons.push("house_rules");
  if (hasItems(filterParams.languages)) unsupportedReasons.push("languages");
  if (hasText(filterParams.leaseDuration))
    unsupportedReasons.push("lease_duration");
  if (hasText(filterParams.endDate)) unsupportedReasons.push("end_date");
  if (filterParams.nearMatches === true)
    unsupportedReasons.push("near_matches");
  if (isUnsupportedSort(filterParams.sort)) unsupportedReasons.push("sort");

  return {
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
  };
}

export function getProjectionReadEligibility(
  parsed: ParsedSearchParams
): ProjectionReadEligibility {
  // parseSearchParams always mirrors the resolved sort onto
  // filterParams.sort, so the filter-params gate covers production reads.
  return getProjectionReadEligibilityForFilterParams(parsed.filterParams);
}
