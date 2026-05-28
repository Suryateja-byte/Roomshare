import "server-only";

import { fetchWithTimeout, FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { features } from "@/lib/env";
import type { GeocodingResult } from "@/lib/geocoding-cache";
import {
  signAddressSuggestionToken,
  type AddressSuggestionProvider,
  type AddressSuggestionPrecision,
} from "@/lib/geocoding/address-suggestion-token";
import type { AddressAutocompleteSuggestion } from "@/lib/geocoding/address-autocomplete";
import {
  isProviderMonthlyCapReached,
  recordGeocodingProviderSkipped,
  recordGeocodingProviderUsage,
} from "@/lib/geocoding/provider-cost-controls";

const PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const ADDRESS_VALIDATION_URL =
  "https://addressvalidation.googleapis.com/v1:validateAddress";
const GOOGLE_PLACES_TIMEOUT_MS = 8000;
const DESTINATION_FIELD_MASK = [
  "suggestions.placePrediction.place",
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text",
  "suggestions.placePrediction.types",
].join(",");
const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "formattedAddress",
  "addressComponents",
  "location",
  "viewport",
  "types",
].join(",");
const ADDRESS_VALIDATION_FIELD_MASK = [
  "result.verdict",
  "result.address.formattedAddress",
  "result.address.postalAddress",
  "result.address.addressComponents",
  "result.geocode",
].join(",");

export class GooglePlacesUnavailableError extends Error {
  constructor(
    message: string,
    public readonly code: "MISSING_KEY" | "TIMEOUT" | "UPSTREAM" | "CAPPED"
  ) {
    super(message);
    this.name = "GooglePlacesUnavailableError";
  }
}

interface GoogleAutocompleteResponse {
  suggestions?: GoogleSuggestion[];
}

interface GoogleSuggestion {
  placePrediction?: {
    place?: string;
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
}

interface GooglePlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  viewport?: {
    low?: { latitude?: number; longitude?: number };
    high?: { latitude?: number; longitude?: number };
  };
  types?: string[];
}

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GoogleAddressValidationResponse {
  result?: {
    verdict?: {
      validationGranularity?: string;
      geocodeGranularity?: string;
      addressComplete?: boolean;
      possibleNextAction?: string;
    };
    address?: {
      formattedAddress?: string;
      postalAddress?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
        postalCode?: string;
        regionCode?: string;
      };
      addressComponents?: GoogleAddressComponent[];
    };
    geocode?: {
      location?: { latitude?: number; longitude?: number };
      placeId?: string;
      placeTypes?: string[];
    };
  };
}

interface ParsedAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface ResolveAddressSuggestionResult extends ParsedAddress {
  id: string;
  label: string;
  primaryText: string;
  secondaryText: string;
  precision: AddressSuggestionPrecision;
  addressSuggestionToken: string;
  placeId: string;
  provider: AddressSuggestionProvider;
  requiresResolution: false;
}

export interface ValidatedAddressForPublish extends ParsedAddress {
  lat: number;
  lng: number;
  precision: AddressSuggestionPrecision;
}

function getGooglePlacesApiKey(): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new GooglePlacesUnavailableError(
      "Google Places API key is not configured",
      "MISSING_KEY"
    );
  }
  return apiKey;
}

function normalizeText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizePlaceId(placeId: string): string {
  return placeId.startsWith("places/")
    ? placeId.slice("places/".length)
    : placeId;
}

function stableSessionToken(
  sessionToken: string | undefined
): string | undefined {
  const normalized = sessionToken?.trim();
  return normalized &&
    normalized.length <= 36 &&
    /^[A-Za-z0-9_-]+$/.test(normalized)
    ? normalized
    : undefined;
}

function parseMonthlyCap(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

async function fetchGoogleJson<T>(
  url: string,
  init: RequestInit & { fieldMask: string }
): Promise<T> {
  const apiKey = getGooglePlacesApiKey();

  try {
    const response = await fetchWithTimeout(url, {
      ...init,
      timeout: GOOGLE_PLACES_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": init.fieldMask,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new GooglePlacesUnavailableError(
        "Google Places request failed",
        "UPSTREAM"
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof GooglePlacesUnavailableError) {
      throw error;
    }
    if (error instanceof FetchTimeoutError) {
      throw new GooglePlacesUnavailableError(
        "Google Places request timed out",
        "TIMEOUT"
      );
    }
    throw new GooglePlacesUnavailableError(
      "Google Places request failed",
      "UPSTREAM"
    );
  }
}

function inferDestinationTypes(types: string[] | undefined): string[] {
  const normalized = new Set(types ?? []);
  if (
    normalized.has("neighborhood") ||
    normalized.has("sublocality") ||
    normalized.has("sublocality_level_1")
  ) {
    return ["neighborhood"];
  }
  if (normalized.has("locality")) {
    return ["place"];
  }
  if (normalized.has("administrative_area_level_1")) {
    return ["region"];
  }
  if (normalized.has("country")) {
    return ["country"];
  }
  return ["place"];
}

function suggestionToGeocodingResult(
  suggestion: GoogleSuggestion
): GeocodingResult | null {
  const prediction = suggestion.placePrediction;
  const placeId = normalizeText(prediction?.placeId);
  if (!prediction || !placeId) {
    return null;
  }

  const primaryText = normalizeText(
    prediction.structuredFormat?.mainText?.text
  );
  const secondaryText = normalizeText(
    prediction.structuredFormat?.secondaryText?.text
  );
  const placeName =
    normalizeText(prediction.text?.text) ||
    [primaryText, secondaryText].filter(Boolean).join(", ");

  if (!placeName) {
    return null;
  }

  return {
    id: `google:${placeId}`,
    place_id: placeId,
    provider: "google",
    place_name: placeName,
    place_type: inferDestinationTypes(prediction.types),
    requires_resolution: true,
    primary_text: primaryText || placeName.split(",")[0]?.trim(),
    secondary_text: secondaryText,
  };
}

function dedupeByPlaceId(results: GeocodingResult[]): GeocodingResult[] {
  const seen = new Set<string>();
  const deduped: GeocodingResult[] = [];
  for (const result of results) {
    const key = result.place_id ?? result.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

async function autocompleteByPrimaryType(
  query: string,
  includedPrimaryTypes: string[],
  sessionToken?: string
): Promise<GeocodingResult[]> {
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ["us"],
    regionCode: "us",
    languageCode: "en",
    includedPrimaryTypes,
  };
  const token = stableSessionToken(sessionToken);
  if (token) {
    body.sessionToken = token;
  }

  const payload = await fetchGoogleJson<GoogleAutocompleteResponse>(
    PLACES_AUTOCOMPLETE_URL,
    {
      method: "POST",
      body: JSON.stringify(body),
      fieldMask: DESTINATION_FIELD_MASK,
    }
  );
  recordGeocodingProviderUsage({
    provider: "google",
    surface: "public_autocomplete",
    operation: "places_autocomplete",
    estimatedUnitCostUsd: 0.00283,
  });

  return (payload.suggestions ?? [])
    .map(suggestionToGeocodingResult)
    .filter((result): result is GeocodingResult => result !== null);
}

export async function suggestDestinations(
  query: string,
  options: { limit: number; sessionToken?: string }
): Promise<GeocodingResult[]> {
  const [cityResults, regionResults] = await Promise.all([
    autocompleteByPrimaryType(query, ["(cities)"], options.sessionToken),
    autocompleteByPrimaryType(query, ["(regions)"], options.sessionToken),
  ]);

  return dedupeByPlaceId([...cityResults, ...regionResults]).slice(
    0,
    options.limit
  );
}

function placeDetailsToGeocodingResult(
  place: GooglePlaceDetailsResponse
): GeocodingResult | null {
  const id = normalizeText(place.id);
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const low = place.viewport?.low;
  const high = place.viewport?.high;
  const bbox =
    Number.isFinite(low?.longitude) &&
    Number.isFinite(low?.latitude) &&
    Number.isFinite(high?.longitude) &&
    Number.isFinite(high?.latitude)
      ? ([low?.longitude, low?.latitude, high?.longitude, high?.latitude] as [
          number,
          number,
          number,
          number,
        ])
      : undefined;
  const displayName = normalizeText(place.displayName?.text);
  const formattedAddress = normalizeText(place.formattedAddress);
  const placeName = formattedAddress || displayName;
  if (!placeName) {
    return null;
  }

  return {
    id: `google:${id}`,
    place_id: id,
    provider: "google",
    place_name: placeName,
    center: [lng as number, lat as number],
    place_type: inferDestinationTypes(place.types),
    bbox,
    requires_resolution: false,
    primary_text: displayName || formattedAddress.split(",")[0]?.trim(),
    secondary_text: formattedAddress,
  };
}

export async function resolveDestination(
  placeId: string,
  options: { sessionToken?: string } = {}
): Promise<GeocodingResult | null> {
  const normalizedPlaceId = normalizePlaceId(placeId);
  const params = new URLSearchParams();
  const token = stableSessionToken(options.sessionToken);
  if (token) {
    params.set("sessionToken", token);
  }

  const url = `${PLACES_DETAILS_URL}/${encodeURIComponent(normalizedPlaceId)}${
    params.size > 0 ? `?${params.toString()}` : ""
  }`;
  const payload = await fetchGoogleJson<GooglePlaceDetailsResponse>(url, {
    method: "GET",
    fieldMask: PLACE_DETAILS_FIELD_MASK,
  });
  recordGeocodingProviderUsage({
    provider: "google",
    surface: "public_details",
    operation: "place_details_essentials",
    estimatedUnitCostUsd: 0.005,
  });

  return placeDetailsToGeocodingResult(payload);
}

function componentByType(
  components: GoogleAddressComponent[] | undefined,
  type: string
): GoogleAddressComponent | undefined {
  return components?.find((component) => component.types?.includes(type));
}

function parseAddressComponents(
  components: GoogleAddressComponent[] | undefined,
  fallbackAddress: string | undefined
): ParsedAddress {
  const streetNumber = normalizeText(
    componentByType(components, "street_number")?.longText
  );
  const route = normalizeText(componentByType(components, "route")?.longText);
  const locality = normalizeText(
    componentByType(components, "locality")?.longText
  );
  const postalTown = normalizeText(
    componentByType(components, "postal_town")?.longText
  );
  const sublocality = normalizeText(
    componentByType(components, "sublocality_level_1")?.longText
  );
  const state = normalizeText(
    componentByType(components, "administrative_area_level_1")?.shortText ||
      componentByType(components, "administrative_area_level_1")?.longText
  );
  const postalCode = normalizeText(
    componentByType(components, "postal_code")?.longText
  );
  const postalSuffix = normalizeText(
    componentByType(components, "postal_code_suffix")?.longText
  );
  const fallbackFirstLine = normalizeText(fallbackAddress?.split(",")[0]);

  return {
    address:
      normalizeText([streetNumber, route].filter(Boolean).join(" ")) ||
      fallbackFirstLine,
    city: locality || postalTown || sublocality,
    state,
    zip: postalSuffix ? `${postalCode}-${postalSuffix}` : postalCode,
  };
}

function isAcceptableValidation(
  payload: GoogleAddressValidationResponse
): boolean {
  const verdict = payload.result?.verdict;
  if (!verdict?.addressComplete) {
    return false;
  }
  if (verdict.possibleNextAction === "FIX") {
    return false;
  }

  const acceptableAddressGranularity = new Set(["PREMISE", "SUB_PREMISE"]);
  const acceptableGeocodeGranularity = new Set([
    "PREMISE",
    "SUB_PREMISE",
    "PREMISE_PROXIMITY",
  ]);

  return (
    acceptableAddressGranularity.has(verdict.validationGranularity ?? "") &&
    acceptableGeocodeGranularity.has(verdict.geocodeGranularity ?? "")
  );
}

async function validateAddressForToken(input: {
  address: string;
  city: string;
  state: string;
  zip: string;
  sessionToken?: string;
}): Promise<GoogleAddressValidationResponse> {
  if (!features.googleAddressValidation) {
    recordGeocodingProviderSkipped({
      provider: "google",
      surface: "address_capture",
      reason: "disabled",
    });
    throw new GooglePlacesUnavailableError(
      "Google Address Validation is not enabled",
      "MISSING_KEY"
    );
  }
  if (
    isProviderMonthlyCapReached({
      provider: "google",
      surface: "address_capture",
      monthlyCap: parseMonthlyCap(
        process.env.GOOGLE_ADDRESS_VALIDATION_MONTHLY_CAP
      ),
    })
  ) {
    recordGeocodingProviderSkipped({
      provider: "google",
      surface: "address_capture",
      reason: "budget_cap",
    });
    throw new GooglePlacesUnavailableError(
      "Google Address Validation monthly cap reached",
      "CAPPED"
    );
  }

  const body: Record<string, unknown> = {
    address: {
      regionCode: "US",
      addressLines: [input.address],
      locality: input.city,
      administrativeArea: input.state,
      postalCode: input.zip,
    },
  };
  const token = stableSessionToken(input.sessionToken);
  if (token) {
    body.sessionToken = token;
  }

  const payload = await fetchGoogleJson<GoogleAddressValidationResponse>(
    ADDRESS_VALIDATION_URL,
    {
      method: "POST",
      body: JSON.stringify(body),
      fieldMask: ADDRESS_VALIDATION_FIELD_MASK,
    }
  );
  recordGeocodingProviderUsage({
    provider: "google",
    surface: "address_capture",
    operation: "address_validation",
    estimatedUnitCostUsd: 0.025,
  });
  return payload;
}

function validationToParsedAddress(
  validation: GoogleAddressValidationResponse,
  fallback: ParsedAddress
): ParsedAddress {
  const postalAddress = validation.result?.address?.postalAddress;
  const fromComponents = parseAddressComponents(
    validation.result?.address?.addressComponents,
    validation.result?.address?.formattedAddress
  );

  return {
    address:
      normalizeText(postalAddress?.addressLines?.[0]) ||
      fromComponents.address ||
      fallback.address,
    city:
      normalizeText(postalAddress?.locality) ||
      fromComponents.city ||
      fallback.city,
    state:
      normalizeText(postalAddress?.administrativeArea) ||
      fromComponents.state ||
      fallback.state,
    zip:
      normalizeText(postalAddress?.postalCode) ||
      fromComponents.zip ||
      fallback.zip,
  };
}

export async function suggestAddresses(
  query: string,
  options: { limit: number; sessionToken?: string }
): Promise<AddressAutocompleteSuggestion[]> {
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ["us"],
    regionCode: "us",
    languageCode: "en",
    includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
  };
  const token = stableSessionToken(options.sessionToken);
  if (token) {
    body.sessionToken = token;
  }

  const payload = await fetchGoogleJson<GoogleAutocompleteResponse>(
    PLACES_AUTOCOMPLETE_URL,
    {
      method: "POST",
      body: JSON.stringify(body),
      fieldMask: DESTINATION_FIELD_MASK,
    }
  );
  recordGeocodingProviderUsage({
    provider: "google",
    surface: "address_capture",
    operation: "places_address_autocomplete",
    estimatedUnitCostUsd: 0.00283,
  });

  return (payload.suggestions ?? [])
    .map((suggestion): AddressAutocompleteSuggestion | null => {
      const prediction = suggestion.placePrediction;
      const placeId = normalizeText(prediction?.placeId);
      const primaryText = normalizeText(
        prediction?.structuredFormat?.mainText?.text
      );
      const secondaryText = normalizeText(
        prediction?.structuredFormat?.secondaryText?.text
      );
      const label =
        normalizeText(prediction?.text?.text) ||
        [primaryText, secondaryText].filter(Boolean).join(", ");

      if (!placeId || !label) {
        return null;
      }

      return {
        id: `google:${placeId}`,
        label,
        primaryText: primaryText || label.split(",")[0]?.trim() || label,
        secondaryText,
        address: primaryText || label.split(",")[0]?.trim() || label,
        city: "",
        state: "",
        zip: "",
        precision: "STREET" as const,
        placeId,
        provider: "google" as const,
        requiresResolution: true,
      };
    })
    .filter(
      (suggestion): suggestion is AddressAutocompleteSuggestion =>
        suggestion !== null
    )
    .slice(0, options.limit);
}

export async function resolveAddressSuggestion(
  placeId: string,
  options: {
    userId: string;
    sessionToken?: string;
    typedAddress?: string;
  }
): Promise<ResolveAddressSuggestionResult | null> {
  const normalizedPlaceId = normalizePlaceId(placeId);
  const params = new URLSearchParams();
  const token = stableSessionToken(options.sessionToken);
  if (token) {
    params.set("sessionToken", token);
  }

  const detailsUrl = `${PLACES_DETAILS_URL}/${encodeURIComponent(
    normalizedPlaceId
  )}${params.size > 0 ? `?${params.toString()}` : ""}`;
  const details = await fetchGoogleJson<GooglePlaceDetailsResponse>(
    detailsUrl,
    {
      method: "GET",
      fieldMask: PLACE_DETAILS_FIELD_MASK,
    }
  );
  recordGeocodingProviderUsage({
    provider: "google",
    surface: "address_capture",
    operation: "place_details_essentials",
    estimatedUnitCostUsd: 0.005,
  });
  const parsed = parseAddressComponents(
    details.addressComponents,
    details.formattedAddress
  );
  if (
    !parsed.address ||
    !parsed.city ||
    !parsed.state ||
    !parsed.zip
  ) {
    return null;
  }

  return validateAddressSuggestionForToken({
    ...parsed,
    userId: options.userId,
    sourceId: details.id ?? normalizedPlaceId,
    provider: "google",
    placeId: normalizedPlaceId,
    sessionToken: options.sessionToken,
    typedAddress: options.typedAddress,
  });
}

export async function validateAddressSuggestionForToken(input: {
  userId: string;
  sourceId: string;
  provider: AddressSuggestionProvider;
  address: string;
  city: string;
  state: string;
  zip: string;
  sessionToken?: string;
  typedAddress?: string;
  placeId?: string;
}): Promise<ResolveAddressSuggestionResult | null> {
  const validation = await validateAddressForToken({
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    sessionToken: input.sessionToken,
  });
  if (!isAcceptableValidation(validation)) {
    return null;
  }

  const validated = validationToParsedAddress(validation, input);
  const validationLocation = validation.result?.geocode?.location;
  const finalLat = validationLocation?.latitude;
  const finalLng = validationLocation?.longitude;
  if (!Number.isFinite(finalLat) || !Number.isFinite(finalLng)) {
    return null;
  }

  const selectedAddress = input.typedAddress?.trim()
    ? input.typedAddress.trim()
    : validated.address;
  const secondaryText = [
    validated.city,
    `${validated.state} ${validated.zip}`.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  const now = Date.now();

  const resultId = input.sourceId.startsWith(`${input.provider}:`)
    ? input.sourceId
    : `${input.provider}:${input.sourceId}`;

  return {
    id: resultId,
    label: [selectedAddress, secondaryText].filter(Boolean).join(", "),
    primaryText: selectedAddress,
    secondaryText,
    address: selectedAddress,
    city: validated.city,
    state: validated.state,
    zip: validated.zip,
    precision: "PREMISE",
    placeId: input.placeId ?? input.sourceId,
    provider: input.provider,
    requiresResolution: false,
    addressSuggestionToken: signAddressSuggestionToken({
      provider: input.provider,
      precision: "PREMISE",
      sourceId: input.sourceId,
      userId: input.userId,
      address: validated.address,
      city: validated.city,
      state: validated.state,
      zip: validated.zip,
      lat: finalLat as number,
      lng: finalLng as number,
      issuedAt: now,
      expiresAt: now + 15 * 60 * 1000,
    }),
  };
}

export async function validateAddressForPublish(input: {
  address: string;
  city: string;
  state: string;
  zip: string;
  sessionToken?: string;
}): Promise<ValidatedAddressForPublish | null> {
  const validation = await validateAddressForToken(input);
  if (!isAcceptableValidation(validation)) {
    return null;
  }

  const validated = validationToParsedAddress(validation, input);
  const location = validation.result?.geocode?.location;
  if (
    !validated.address ||
    !validated.city ||
    !validated.state ||
    !validated.zip ||
    !Number.isFinite(location?.latitude) ||
    !Number.isFinite(location?.longitude)
  ) {
    return null;
  }

  return {
    ...validated,
    lat: location?.latitude as number,
    lng: location?.longitude as number,
    precision: "PREMISE",
  };
}
