import { NextResponse } from "next/server";
import {
  type LocationAutocompleteErrorCode,
  type LocationAutocompleteErrorResponse,
} from "@/lib/geocoding/autocomplete";
import {
  GooglePlacesUnavailableError,
  resolveDestination,
} from "@/lib/geocoding/google-places";
import type { GeocodingResult } from "@/lib/geocoding-cache";
import { withRateLimit } from "@/lib/with-rate-limit";
import { features } from "@/lib/env";

interface PlaceDetailsSuccessResponse {
  result: GeocodingResult;
}

function sanitizeToken(value: string | null): string {
  return (value ?? "")
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, 128);
}

function sanitizePlaceId(value: string | null): string {
  return (value ?? "")
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, 256);
}

function jsonError(code: LocationAutocompleteErrorCode, status: number) {
  const response = NextResponse.json<LocationAutocompleteErrorResponse>(
    { code },
    { status }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function jsonSuccess(data: PlaceDetailsSuccessResponse) {
  const response = NextResponse.json<PlaceDetailsSuccessResponse>(data);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicAutocomplete",
    endpoint: "/api/geocoding/place-details",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const placeId = sanitizePlaceId(url.searchParams.get("placeId"));
  const sessionToken = sanitizeToken(url.searchParams.get("sessionToken"));
  if (!placeId) {
    return jsonError("INVALID_QUERY", 422);
  }
  if (!features.googlePlacesPublic) {
    return jsonError("UNAVAILABLE", 503);
  }

  try {
    const result = await resolveDestination(placeId, { sessionToken });
    if (!result?.center) {
      return jsonError("INVALID_QUERY", 422);
    }

    return jsonSuccess({ result });
  } catch (error) {
    if (
      error instanceof GooglePlacesUnavailableError &&
      error.code === "TIMEOUT"
    ) {
      return jsonError("TIMEOUT", 504);
    }

    return jsonError("UNAVAILABLE", 503);
  }
}
