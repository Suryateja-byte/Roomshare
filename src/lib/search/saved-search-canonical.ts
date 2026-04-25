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
  const filters = removeUndefined(normalizeSearchFilters(rawFilters));
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
      bounds:
        filters.minLat !== undefined &&
        filters.maxLat !== undefined &&
        filters.minLng !== undefined &&
        filters.maxLng !== undefined
          ? {
              minLat: filters.minLat,
              maxLat: filters.maxLat,
              minLng: filters.minLng,
              maxLng: filters.maxLng,
            }
          : undefined,
      embeddingVersion: embeddingVersionAtSave,
      rankerProfileVersion: rankerProfileVersionAtSave,
      unitIdentityEpochFloor,
    }),
    embeddingVersionAtSave,
    rankerProfileVersionAtSave,
    unitIdentityEpochFloor,
  };
}
