import { getReadEmbeddingVersion } from "@/lib/embeddings/version";
import { RANKING_VERSION } from "@/lib/search/ranking";
import { generateSearchQueryHash } from "@/lib/search/query-hash";
import {
  normalizeSearchFilters,
  type SearchFilters,
} from "@/lib/search-utils";

export const SAVED_SEARCH_SPEC_VERSION =
  "2026-04-23.phase07-saved-search-v1";
export const SAVED_SEARCH_UNIT_IDENTITY_EPOCH_FLOOR = 1;

export interface CanonicalSavedSearchMetadata {
  filters: SearchFilters;
  searchSpecJson: {
    version: string;
    filters: SearchFilters;
    requestedOccupants: number;
    versions: {
      embeddingVersion: string;
      rankerProfileVersion: string;
      unitIdentityEpochFloor: number;
    };
  };
  searchSpecHash: string;
  embeddingVersionAtSave: string;
  rankerProfileVersionAtSave: string;
  unitIdentityEpochFloor: number;
}

function requestedOccupantsFromFilters(filters: SearchFilters): number {
  const requested = filters.minSlots;
  return typeof requested === "number" && Number.isFinite(requested)
    ? Math.max(1, Math.trunc(requested))
    : 1;
}

function removeUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildCanonicalSavedSearchMetadata(
  rawFilters: SearchFilters
): CanonicalSavedSearchMetadata {
  // `sort` is ordering-only and intentionally NOT part of a saved search's
  // identity (searchSpecHash omits it). Strip it here so every persisted
  // representation (returned filters, searchSpecJson.filters, and the DB-bound
  // stripped filters) agrees that sort is not stored — otherwise two saves
  // differing only by sort would dedup to one hash yet persist divergent state.
  const { sort: _sort, ...filtersWithoutSort } = normalizeSearchFilters(
    rawFilters
  );
  const filters = removeUndefined(filtersWithoutSort as SearchFilters);
  const requestedOccupants = requestedOccupantsFromFilters(filters);
  const embeddingVersionAtSave = getReadEmbeddingVersion();
  const rankerProfileVersionAtSave = RANKING_VERSION;
  const unitIdentityEpochFloor = SAVED_SEARCH_UNIT_IDENTITY_EPOCH_FLOOR;

  return {
    filters,
    searchSpecJson: {
      version: SAVED_SEARCH_SPEC_VERSION,
      filters,
      requestedOccupants,
      versions: {
        embeddingVersion: embeddingVersionAtSave,
        rankerProfileVersion: rankerProfileVersionAtSave,
        unitIdentityEpochFloor,
      },
    },
    searchSpecHash: generateSearchQueryHash({
      query: filters.query,
      vibeQuery: filters.vibeQuery,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      amenities: filters.amenities,
      houseRules: filters.houseRules,
      languages: filters.languages,
      roomType: filters.roomType,
      leaseDuration: filters.leaseDuration,
      moveInDate: filters.moveInDate,
      endDate: filters.endDate,
      genderPreference: filters.genderPreference,
      householdGender: filters.householdGender,
      bookingMode: filters.bookingMode,
      minAvailableSlots: requestedOccupants,
      nearMatches: filters.nearMatches,
      // Viewport bounds are intentionally excluded from the dedup identity: a
      // saved search is defined by its query + filters, not the exact map
      // viewport. Including bounds let a map pan/zoom produce a new hash and
      // bypass the duplicate guard (burning the 10-slot cap + spawning a second
      // alert subscription). Bounds remain in searchSpecJson.filters for
      // reopen/alert-matching; they just don't define identity.
      embeddingVersion: embeddingVersionAtSave,
      rankerProfileVersion: rankerProfileVersionAtSave,
      unitIdentityEpochFloor,
    }),
    embeddingVersionAtSave,
    rankerProfileVersionAtSave,
    unitIdentityEpochFloor,
  };
}
