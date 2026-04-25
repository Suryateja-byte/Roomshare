import type { ListingData, MapListingData } from "@/lib/search-types";
import { generateSearchQueryHash } from "./query-hash";
import type { NormalizedSearchQuery } from "./search-query";

export const SEARCH_RESPONSE_VERSION =
  "2026-04-19.canonical-availability-parity.search-contract-v2";

export type SearchBackendSource = "v2" | "v1-fallback" | "map-api";

export interface SearchResponseMeta {
  queryHash: string;
  backendSource: SearchBackendSource;
  responseVersion: string;
  querySnapshotId?: string;
  projectionVersion?: number;
  projectionEpoch?: string;
  embeddingVersion?: string;
  rankerProfileVersion?: string;
  unitIdentityEpochFloor?: number;
  snapshotVersion?: string;
}

export interface SearchListPayload {
  items: ListingData[];
  nextCursor: string | null;
  total: number | null;
  nearMatchExpansion?: string;
  vibeAdvisory?: string;
}

export interface SearchMapPayload {
  listings: MapListingData[];
  truncated?: boolean;
}

export type SearchPayload = SearchListPayload | SearchMapPayload;

export type SearchState<TData extends SearchPayload = SearchPayload> =
  | { kind: "ok"; data: TData; meta: SearchResponseMeta }
  | { kind: "location-required"; meta: SearchResponseMeta }
  | { kind: "rate-limited"; retryAfter?: number; meta: SearchResponseMeta }
  | { kind: "zero-results"; suggestions?: unknown[]; meta: SearchResponseMeta }
  | {
      kind: "degraded";
      source: "v1-fallback" | "partial";
      data: TData;
      meta: SearchResponseMeta;
    };

export type SearchListState = SearchState<SearchListPayload>;
export type SearchMapState = SearchState<SearchMapPayload>;

export function createSearchResponseMeta(
  query: NormalizedSearchQuery,
  backendSource: SearchBackendSource,
  extras?: Omit<SearchResponseMeta, "queryHash" | "backendSource" | "responseVersion">
): SearchResponseMeta {
  return {
    queryHash: getSearchQueryHash(query),
    backendSource,
    responseVersion: SEARCH_RESPONSE_VERSION,
    ...extras,
  };
}

export function getSearchQueryHash(query: NormalizedSearchQuery): string {
  return generateSearchQueryHash({
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
    minAvailableSlots: query.minSlots,
    nearMatches: query.nearMatches,
    bounds: query.bounds,
  });
}
