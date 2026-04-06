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

function jsonError(code: LocationAutocompleteErrorCode, status: number) {
  return NextResponse.json<LocationAutocompleteErrorResponse>(
    { code },
    { status }
  );
}

export async function GET(request: Request) {
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

  const cachedResults = await getCachedResults(query);
  if (cachedResults) {
    return NextResponse.json<LocationAutocompleteSuccessResponse>({
      results: cachedResults,
    });
  }

  try {
    const results = await searchPhoton(query, { limit });
    await setCachedResults(query, results);

    return NextResponse.json<LocationAutocompleteSuccessResponse>({
      results,
    });
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      return jsonError("TIMEOUT", 504);
    }

    return jsonError("UNAVAILABLE", 503);
  }
}
