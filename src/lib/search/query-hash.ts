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
  genderPreference?: string;
  householdGender?: string;
  bookingMode?: string;
  minAvailableSlots?: number;
  nearMatches?: boolean;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

function quantizeBound(value: number): number {
  return Math.round(value / BOUNDS_EPSILON) * BOUNDS_EPSILON;
}

function normalizeHashableSearchQuery(query: HashableSearchQuery) {
  return {
    q: (query.query ?? "").toLowerCase().trim(),
    what: (query.vibeQuery ?? "").toLowerCase().trim(),
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    amenities: [...(query.amenities ?? [])].sort(),
    houseRules: [...(query.houseRules ?? [])].sort(),
    languages: [...(query.languages ?? [])].sort(),
    roomType: (query.roomType ?? "").toLowerCase(),
    leaseDuration: (query.leaseDuration ?? "").toLowerCase(),
    moveInDate: query.moveInDate ?? "",
    genderPreference: (query.genderPreference ?? "").toLowerCase(),
    householdGender: (query.householdGender ?? "").toLowerCase(),
    bookingMode: (query.bookingMode ?? "").toLowerCase(),
    minAvailableSlots: query.minAvailableSlots ?? null,
    nearMatches: query.nearMatches ?? false,
    bounds: query.bounds
      ? {
          minLat: quantizeBound(query.bounds.minLat),
          maxLat: quantizeBound(query.bounds.maxLat),
          minLng: quantizeBound(query.bounds.minLng),
          maxLng: quantizeBound(query.bounds.maxLng),
        }
      : null,
  };
}

function hashString64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = 0xcbf29ce484222325n;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0").slice(0, 16);
}

export function generateSearchQueryHash(
  query: HashableSearchQuery
): string {
  return hashString64(JSON.stringify(normalizeHashableSearchQuery(query)));
}
