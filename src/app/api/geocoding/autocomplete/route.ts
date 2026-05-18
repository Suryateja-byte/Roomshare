import { NextResponse } from "next/server";
import {
  clampAutocompleteLimit,
  isAutocompleteQueryValid,
  LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT,
  sanitizeAutocompleteQuery,
  type LocationAutocompleteErrorCode,
  type LocationAutocompleteErrorResponse,
  type LocationAutocompleteSuccessResponse,
  type LocationAutocompleteBias,
} from "@/lib/geocoding/autocomplete";
import { getCachedResults, setCachedResults } from "@/lib/geocoding-cache";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { searchPhoton } from "@/lib/geocoding/photon";
import { searchPublicAutocomplete } from "@/lib/geocoding/public-autocomplete";
import { buildPublicCacheHeaders } from "@/lib/public-cache/headers";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordPublicAutocompleteRequest } from "@/lib/geocoding/public-autocomplete-telemetry";

const PUBLIC_AUTOCOMPLETE_CACHE_SCHEMA = "safe-place-v2";

function jsonError(code: LocationAutocompleteErrorCode, status: number) {
  const response = NextResponse.json<LocationAutocompleteErrorResponse>(
    { code },
    { status }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function jsonSuccess(data: LocationAutocompleteSuccessResponse) {
  const response = NextResponse.json<LocationAutocompleteSuccessResponse>(data);
  response.headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(buildPublicCacheHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

function parseBoundedNumber(
  value: string | null,
  min: number,
  max: number
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function parseAutocompleteBias(searchParams: URLSearchParams): LocationAutocompleteBias | undefined {
  const nearLat = parseBoundedNumber(searchParams.get("nearLat"), -90, 90);
  const nearLng = parseBoundedNumber(searchParams.get("nearLng"), -180, 180);
  const minLng = parseBoundedNumber(searchParams.get("minLng"), -180, 180);
  const minLat = parseBoundedNumber(searchParams.get("minLat"), -90, 90);
  const maxLng = parseBoundedNumber(searchParams.get("maxLng"), -180, 180);
  const maxLat = parseBoundedNumber(searchParams.get("maxLat"), -90, 90);

  const bias: LocationAutocompleteBias = {};

  if (nearLat !== null && nearLng !== null) {
    bias.near = { lat: nearLat, lng: nearLng };
  }

  if (
    minLng !== null &&
    minLat !== null &&
    maxLng !== null &&
    maxLat !== null &&
    minLng < maxLng &&
    minLat < maxLat
  ) {
    bias.bounds = [minLng, minLat, maxLng, maxLat];
  }

  return bias.near || bias.bounds ? bias : undefined;
}

function buildBiasCacheSuffix(bias?: LocationAutocompleteBias): string {
  if (!bias) {
    return "";
  }

  const parts: string[] = [];
  if (bias.near) {
    parts.push(`n${bias.near.lat},${bias.near.lng}`);
  }
  if (bias.bounds) {
    parts.push(`b${bias.bounds.join(",")}`);
  }

  return parts.length > 0 ? `:bias:${parts.join(":")}` : "";
}

async function getPublicAutocompleteCacheVersion(
  bias?: LocationAutocompleteBias
): Promise<string> {
  try {
    const { cacheFloorToken } = await getPublicCacheStatePayload();
    return `public:${cacheFloorToken}:${PUBLIC_AUTOCOMPLETE_CACHE_SCHEMA}${buildBiasCacheSuffix(bias)}`;
  } catch (error) {
    logger.sync.warn("Public autocomplete cache floor unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return `public:none:${PUBLIC_AUTOCOMPLETE_CACHE_SCHEMA}${buildBiasCacheSuffix(bias)}`;
  }
}

export async function GET(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicAutocomplete",
    endpoint: "/api/geocoding/autocomplete",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = sanitizeAutocompleteQuery(rawQuery);
  const requestedLimit = Number(
    url.searchParams.get("limit") ?? LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT
  );
  const limit = clampAutocompleteLimit(requestedLimit);
  const bias = parseAutocompleteBias(url.searchParams);

  if (!isAutocompleteQueryValid(query)) {
    return jsonError("INVALID_QUERY", 422);
  }

  recordPublicAutocompleteRequest(
    features.publicAutocompleteContract ? "public_contract" : "legacy"
  );

  const cacheOptions = features.publicAutocompleteContract
    ? {
        cacheVersion: await getPublicAutocompleteCacheVersion(bias),
        ttlSeconds: 15 * 60,
      }
    : undefined;

  const cachedResults = await getCachedResults(query, cacheOptions);
  if (cachedResults) {
    return jsonSuccess({
      results: cachedResults,
    });
  }

  try {
    const results = features.publicAutocompleteContract
      ? await searchPublicAutocomplete(
          query,
          bias ? { limit, bias } : { limit }
        )
      : await searchPhoton(query, { limit });
    await setCachedResults(query, results, cacheOptions);

    return jsonSuccess({
      results,
    });
  } catch (error) {
    if (
      !features.publicAutocompleteContract &&
      error instanceof FetchTimeoutError
    ) {
      return jsonError("TIMEOUT", 504);
    }

    return jsonError("UNAVAILABLE", 503);
  }
}
