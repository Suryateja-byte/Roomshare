import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  sanitizeAddressAutocompleteQuery,
  type AddressAutocompleteErrorCode,
  type AddressAutocompleteErrorResponse,
  type AddressAutocompleteSuggestion,
} from "@/lib/geocoding/address-autocomplete";
import {
  GooglePlacesUnavailableError,
  resolveAddressSuggestion,
} from "@/lib/geocoding/google-places";
import {
  SmartyAddressAutocompleteUnavailableError,
  validateSmartyAddressSuggestionForToken,
} from "@/lib/geocoding/smarty";
import { getClientIP } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

interface AddressDetailsSuccessResponse {
  suggestion: AddressAutocompleteSuggestion;
  verificationStatus: "trusted";
}

function sanitizeToken(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, "")
        .slice(0, 128)
    : "";
}

function sanitizePlaceId(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, "")
        .slice(0, 256)
    : "";
}

function sanitizeAddressField(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, maxLength)
    : "";
}

function jsonError(code: AddressAutocompleteErrorCode, status: number) {
  const response = NextResponse.json<AddressAutocompleteErrorResponse>(
    { code },
    { status }
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function jsonSuccess(data: AddressDetailsSuccessResponse) {
  const response = NextResponse.json<AddressDetailsSuccessResponse>(data);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function omitExactCoordinates(
  suggestion: AddressAutocompleteSuggestion
): AddressAutocompleteSuggestion {
  const { lat: _lat, lng: _lng, ...safe } = suggestion;
  return safe;
}

export async function POST(request: Request) {
  const ipRateLimitResponse = await withRateLimit(request, {
    type: "addressAutocomplete",
    endpoint: "/api/geocoding/address-details",
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
    endpoint: "/api/geocoding/address-details/user",
  });
  if (userRateLimitResponse) {
    userRateLimitResponse.headers.set("Cache-Control", "private, no-store");
    return userRateLimitResponse;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("INVALID_QUERY", 422);
  }

  const placeId = sanitizePlaceId(body.placeId);
  const provider = body.provider === "smarty" ? "smarty" : "google";
  const sourceId = sanitizePlaceId(body.sourceId) || placeId;
  const address = sanitizeAddressField(body.address, 200);
  const city = sanitizeAddressField(body.city, 100);
  const state = sanitizeAddressField(body.state, 50);
  const zip = sanitizeAddressField(body.zip, 20);
  const sessionToken = sanitizeToken(body.sessionToken);
  const typedAddress =
    typeof body.typedAddress === "string"
      ? sanitizeAddressAutocompleteQuery(body.typedAddress)
      : "";

  if (provider === "google" && !placeId) {
    return jsonError("INVALID_QUERY", 422);
  }
  if (
    provider === "smarty" &&
    (!sourceId || !address || !city || !state || !zip)
  ) {
    return jsonError("INVALID_QUERY", 422);
  }

  try {
    const suggestion =
      provider === "smarty"
        ? await validateSmartyAddressSuggestionForToken({
            userId,
            sourceId,
            address,
            city,
            state,
            zip,
            typedAddress: typedAddress || address,
            placeId: sourceId,
            signal: request.signal,
          })
        : await resolveAddressSuggestion(placeId, {
            userId,
            sessionToken,
            typedAddress,
          });

    if (!suggestion) {
      return jsonError("INVALID_QUERY", 422);
    }

    return jsonSuccess({
      suggestion: omitExactCoordinates(suggestion),
      verificationStatus: "trusted",
    });
  } catch (error) {
    if (
      (error instanceof GooglePlacesUnavailableError ||
        error instanceof SmartyAddressAutocompleteUnavailableError) &&
      error.code === "TIMEOUT"
    ) {
      return jsonError("TIMEOUT", 504);
    }
    if (
      (error instanceof GooglePlacesUnavailableError ||
        error instanceof SmartyAddressAutocompleteUnavailableError) &&
      error.code === "CAPPED"
    ) {
      return jsonError("CAPPED", 503);
    }

    return jsonError("UNAVAILABLE", 503);
  }
}
