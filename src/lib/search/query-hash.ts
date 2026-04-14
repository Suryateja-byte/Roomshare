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
    endDate: query.endDate ?? "",
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
