import { NextResponse } from "next/server";
import {
  clampAutocompleteLimit,
  isAutocompleteQueryValid,
  LOCATION_AUTOCOMPLETE_DEFAULT_LIMIT,
  sanitizeAutocompleteQuery,
  type LocationAutocompleteErrorCode,
  type LocationAutocompleteErrorResponse,
  type LocationAutocompleteSuccessResponse,
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

async function getPublicAutocompleteCacheVersion(): Promise<string> {
  try {
    const { cacheFloorToken } = await getPublicCacheStatePayload();
    return `public:${cacheFloorToken}`;
  } catch (error) {
    logger.sync.warn("Public autocomplete cache floor unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "public:none";
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

  if (!isAutocompleteQueryValid(query)) {
    return jsonError("INVALID_QUERY", 422);
  }

  recordPublicAutocompleteRequest(
    features.publicAutocompleteContract ? "public_contract" : "legacy"
  );

  const cacheOptions = features.publicAutocompleteContract
    ? {
        cacheVersion: await getPublicAutocompleteCacheVersion(),
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
      ? await searchPublicAutocomplete(query, { limit })
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
