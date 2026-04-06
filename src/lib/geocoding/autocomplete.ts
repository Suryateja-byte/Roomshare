import type { GeocodingResult } from "@/lib/geocoding-cache";

export const LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH = 2;
export const LOCATION_AUTOCOMPLETE_QUERY_MAX_LENGTH = 500;
export const LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT = 5;
export const LOCATION_AUTOCOMPLETE_MAX_LIMIT = 10;

export type LocationAutocompleteErrorCode =
  | "INVALID_QUERY"
  | "TIMEOUT"
  | "UNAVAILABLE";

export interface LocationAutocompleteSuccessResponse {
  results: GeocodingResult[];
}

export interface LocationAutocompleteErrorResponse {
  code: LocationAutocompleteErrorCode;
}

export function sanitizeAutocompleteQuery(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, LOCATION_AUTOCOMPLETE_QUERY_MAX_LENGTH);
}

export function isAutocompleteQueryValid(query: string): boolean {
  return query.length >= LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH;
}

export function clampAutocompleteLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT;
  }

  return Math.min(
    LOCATION_AUTOCOMPLETE_MAX_LIMIT,
    Math.max(1, Math.trunc(limit))
  );
}
