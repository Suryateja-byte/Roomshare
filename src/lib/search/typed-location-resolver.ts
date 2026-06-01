"use client";

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  isAutocompleteQueryValid,
  sanitizeAutocompleteQuery,
} from "@/lib/geocoding/autocomplete";
import {
  deriveSearchBoundsFromPoint,
  type SearchLocationBoundsTuple,
} from "@/lib/search/location-bounds";
import type { SearchLocationSelection } from "@/lib/search/search-intent";

const TYPED_LOCATION_RESOLVE_TIMEOUT_MS = 9000;

interface TypedLocationSuggestion {
  id: string;
  place_name?: string;
  center?: [number, number];
  bbox?: [number, number, number, number];
  place_id?: string;
  requires_resolution?: boolean;
}

interface AutocompleteResponse {
  results?: TypedLocationSuggestion[];
}

interface PlaceDetailsResponse {
  result?: TypedLocationSuggestion;
}

export interface ResolvedTypedSearchLocation {
  label: string;
  selection: SearchLocationSelection;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCenter(center: TypedLocationSuggestion["center"]) {
  if (
    !Array.isArray(center) ||
    center.length < 2 ||
    !isFiniteCoordinate(center[0]) ||
    !isFiniteCoordinate(center[1])
  ) {
    return null;
  }

  const [lng, lat] = center;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

function normalizeBounds(
  bbox: TypedLocationSuggestion["bbox"],
  lat: number,
  lng: number
): SearchLocationBoundsTuple {
  if (
    Array.isArray(bbox) &&
    bbox.length >= 4 &&
    bbox.every(isFiniteCoordinate)
  ) {
    return [bbox[0], bbox[1], bbox[2], bbox[3]];
  }

  return deriveSearchBoundsFromPoint(lat, lng);
}

function placeDetailsIdFor(suggestion: TypedLocationSuggestion): string | null {
  const rawPlaceId =
    suggestion.place_id || suggestion.id?.replace(/^google:/, "") || "";
  const placeId = rawPlaceId.trim();
  return placeId.length > 0 ? placeId : null;
}

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(url, {
      timeout: TYPED_LOCATION_RESOLVE_TIMEOUT_MS,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function resolveSuggestionDetails(
  suggestion: TypedLocationSuggestion
): Promise<TypedLocationSuggestion | null> {
  const placeId = placeDetailsIdFor(suggestion);
  if (!placeId) {
    return null;
  }

  const params = new URLSearchParams({ placeId });
  const payload = await readJson<PlaceDetailsResponse>(
    `/api/geocoding/place-details?${params.toString()}`
  );

  return payload?.result ?? null;
}

export async function resolveTypedSearchLocation(
  input: string
): Promise<ResolvedTypedSearchLocation | null> {
  const query = sanitizeAutocompleteQuery(input);
  if (!isAutocompleteQueryValid(query)) {
    return null;
  }

  const params = new URLSearchParams({ q: query, limit: "1" });
  const payload = await readJson<AutocompleteResponse>(
    `/api/geocoding/autocomplete?${params.toString()}`
  );
  const suggestion = payload?.results?.[0];
  if (!suggestion) {
    return null;
  }

  const resolvedSuggestion =
    suggestion.requires_resolution || !suggestion.center
      ? await resolveSuggestionDetails(suggestion)
      : suggestion;
  if (!resolvedSuggestion) {
    return null;
  }

  const center = normalizeCenter(resolvedSuggestion.center);
  if (!center) {
    return null;
  }

  const label = (
    resolvedSuggestion.place_name ||
    suggestion.place_name ||
    ""
  ).trim();
  if (label.length === 0) {
    return null;
  }

  return {
    label,
    selection: {
      lat: center.lat,
      lng: center.lng,
      bounds: normalizeBounds(
        resolvedSuggestion.bbox ?? suggestion.bbox,
        center.lat,
        center.lng
      ),
    },
  };
}
