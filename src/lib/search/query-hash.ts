import { normalizeSearchFilters } from "@/lib/search-params";
import { BOUNDS_EPSILON } from "./types";

export interface HashableSearchQuery {
  query?: string;
  vibeQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  houseRules?: string[];
  languages?: string[];
  roomType?: string;
  leaseDuration?: string;
  moveInDate?: string;
  endDate?: string;
  genderPreference?: string;
  householdGender?: string;
  bookingMode?: string;
  minAvailableSlots?: number;
  nearMatches?: boolean;
  projectionEpoch?: string | number | bigint | null;
  embeddingVersion?: string | null;
  rankerProfileVersion?: string | null;
  unitIdentityEpochFloor?: number | null;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

export const SEARCH_QUERY_HASH_VERSION =
  "2026-04-28.semantic-embedding-version-v2";

function quantizeBound(value: number): number {
  return Math.round(value / BOUNDS_EPSILON) * BOUNDS_EPSILON;
}

function normalizeHashableSearchQuery(query: HashableSearchQuery) {
  const normalized = normalizeSearchFilters(
    {
      query: query.query,
      vibeQuery: query.vibeQuery,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      amenities: query.amenities,
      houseRules: query.houseRules,
      languages: query.languages,
      roomType: query.roomType,
      leaseDuration: query.leaseDuration,
      moveInDate: query.moveInDate,
      endDate: query.endDate,
      genderPreference: query.genderPreference,
      householdGender: query.householdGender,
      bookingMode: query.bookingMode,
      minAvailableSlots: query.minAvailableSlots,
      nearMatches: query.nearMatches,
      bounds: query.bounds,
    },
    {
      invalidRange: "drop",
    }
  );
  const versionTokens: Record<string, string | number | null> = {};
  if ("projectionEpoch" in query) {
    versionTokens.projectionEpoch =
      query.projectionEpoch !== null && query.projectionEpoch !== undefined
        ? String(query.projectionEpoch)
        : null;
  }
  if ("embeddingVersion" in query) {
    versionTokens.embeddingVersion = query.embeddingVersion ?? null;
  }
  if ("rankerProfileVersion" in query) {
    versionTokens.rankerProfileVersion = query.rankerProfileVersion ?? null;
  }
  if ("unitIdentityEpochFloor" in query) {
    versionTokens.unitIdentityEpochFloor = query.unitIdentityEpochFloor ?? null;
  }

  return {
    v: SEARCH_QUERY_HASH_VERSION,
    q: (normalized.query ?? "").toLowerCase(),
    what: (normalized.vibeQuery ?? "").toLowerCase(),
    minPrice: normalized.minPrice ?? null,
    maxPrice: normalized.maxPrice ?? null,
    amenities: [...(normalized.amenities ?? [])].sort(),
    houseRules: [...(normalized.houseRules ?? [])].sort(),
    languages: [...(normalized.languages ?? [])].sort(),
    roomType: (normalized.roomType ?? "").toLowerCase(),
    leaseDuration: (normalized.leaseDuration ?? "").toLowerCase(),
    moveInDate: normalized.moveInDate ?? "",
    endDate: normalized.endDate ?? "",
    genderPreference: (normalized.genderPreference ?? "").toLowerCase(),
    householdGender: (normalized.householdGender ?? "").toLowerCase(),
    bookingMode: (normalized.bookingMode ?? "").toLowerCase(),
    minAvailableSlots: normalized.minAvailableSlots ?? null,
    nearMatches: normalized.nearMatches ?? false,
    ...versionTokens,
    bounds: normalized.bounds
      ? {
          minLat: quantizeBound(normalized.bounds.minLat),
          maxLat: quantizeBound(normalized.bounds.maxLat),
          minLng: quantizeBound(normalized.bounds.minLng),
          maxLng: quantizeBound(normalized.bounds.maxLng),
        }
      : null,
  };
}

function hashString64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  for (const byte of bytes) {
    primary ^= byte;
    primary = Math.imul(primary, 0x01000193) >>> 0;

    secondary ^= byte;
    secondary = Math.imul(secondary, 0x85ebca6b) >>> 0;
  }

  return `${primary.toString(16).padStart(8, "0")}${secondary
    .toString(16)
    .padStart(8, "0")}`;
}

export function generateSearchQueryHash(query: HashableSearchQuery): string {
  return hashString64(JSON.stringify(normalizeHashableSearchQuery(query)));
}
