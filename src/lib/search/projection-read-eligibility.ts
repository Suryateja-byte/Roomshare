import type { ParsedSearchParams } from "@/lib/search-params";
import type { FilterParams } from "@/lib/search-types";

export type ProjectionReadUnsupportedReason =
  | "query"
  | "vibe_query"
  | "amenities"
  | "house_rules"
  | "languages"
  | "lease_duration"
  | "end_date"
  | "near_matches";

export interface ProjectionReadEligibility {
  supported: boolean;
  unsupportedReasons: ProjectionReadUnsupportedReason[];
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(value: string[] | undefined): boolean {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
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

  return {
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
  };
}

export function getProjectionReadEligibility(
  parsed: ParsedSearchParams
): ProjectionReadEligibility {
  return getProjectionReadEligibilityForFilterParams(parsed.filterParams);
}
