import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clampAddressAutocompleteLimit,
  isAddressAutocompleteQueryValid,
  sanitizeAddressAutocompleteQuery,
  searchAddressSuggestions,
  type AddressAutocompleteErrorCode,
  type AddressAutocompleteErrorResponse,
  type AddressAutocompleteSuccessResponse,
} from "@/lib/geocoding/address-autocomplete";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getClientIP } from "@/lib/rate-limit";

function jsonError(code: AddressAutocompleteErrorCode, status: number) {
  const response = NextResponse.json<AddressAutocompleteErrorResponse>(
    { code },
    { status }
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function jsonSuccess(data: AddressAutocompleteSuccessResponse) {
  const response = NextResponse.json<AddressAutocompleteSuccessResponse>(data);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function omitExactCoordinates(
  suggestions: AddressAutocompleteSuccessResponse["suggestions"]
): AddressAutocompleteSuccessResponse["suggestions"] {
  return suggestions.map((suggestion) => {
    const { lat: _lat, lng: _lng, addressSuggestionToken: _token, ...safe } =
      suggestion;
    return safe;
  });
}

export async function GET(request: Request) {
  const ipRateLimitResponse = await withRateLimit(request, {
    type: "addressAutocomplete",
    endpoint: "/api/geocoding/address-autocomplete",
  });
  if (ipRateLimitResponse) {
    ipRateLimitResponse.headers.set("Cache-Control", "private, no-store");
    return ipRateLimitResponse;
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const response = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const userRateLimitResponse = await withRateLimit(request, {
    type: "addressAutocomplete",
    getIdentifier: (req) => `user:${userId}:ip:${getClientIP(req)}`,
    endpoint: "/api/geocoding/address-autocomplete/user",
  });
  if (userRateLimitResponse) {
    userRateLimitResponse.headers.set("Cache-Control", "private, no-store");
    return userRateLimitResponse;
  }

  const url = new URL(request.url);
  const query = sanitizeAddressAutocompleteQuery(url.searchParams.get("q") ?? "");
  const sessionToken = sanitizeAddressAutocompleteQuery(
    url.searchParams.get("sessionToken") ?? ""
  ).slice(0, 128);
  const selected = sanitizeAddressAutocompleteQuery(
    url.searchParams.get("selected") ?? ""
  ).slice(0, 256);
  const limit = clampAddressAutocompleteLimit(
    Number(url.searchParams.get("limit") ?? undefined)
  );

  if (!isAddressAutocompleteQueryValid(query)) {
    return jsonError("INVALID_QUERY", 422);
  }

  try {
    const suggestions = await searchAddressSuggestions(query, {
      limit,
      userId,
      sessionToken,
      selected,
    });

    return jsonSuccess({ suggestions: omitExactCoordinates(suggestions) });
  } catch {
    return jsonError("UNAVAILABLE", 503);
  }
}
