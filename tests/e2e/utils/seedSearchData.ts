import { searchUrl, SEARCH_SF_BOUNDS } from "../fixtures/search-data.fixture";

export const SEARCH_SEED_LISTINGS = {
  mission: "Sunny Mission Room",
  sunset: "Cozy Sunset Studio",
  groupedDates: "E2E Dedupe Clone Group",
  reviewerOwned: "Reviewer Nob Hill Apartment",
} as const;

export function seededSfSearchUrl() {
  return searchUrl({}, { bounds: SEARCH_SF_BOUNDS });
}
