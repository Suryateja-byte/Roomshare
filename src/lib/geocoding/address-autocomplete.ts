import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { features } from "@/lib/env";
import { suggestAddresses as suggestGoogleAddresses } from "@/lib/geocoding/google-places";
import { suggestSmartyAddresses } from "@/lib/geocoding/smarty";
import {
  type AddressSuggestionPrecision,
  type AddressSuggestionProvider,
} from "@/lib/geocoding/address-suggestion-token";
import {
  buildAddressAutocompleteProviderQuery,
  getAddressSuggestionIdentityKey,
  normalizeUsState,
  parseAddressInput,
  type AddressSearchContext,
} from "@/lib/geocoding/address-suggestion-utils";

export {
  buildAddressAutocompleteProviderQuery,
  parseAddressInput,
} from "@/lib/geocoding/address-suggestion-utils";

export const ADDRESS_AUTOCOMPLETE_MIN_QUERY_LENGTH = 3;
export const ADDRESS_AUTOCOMPLETE_PROVIDER_MIN_QUERY_LENGTH = 4;
export const ADDRESS_AUTOCOMPLETE_QUERY_MAX_LENGTH = 200;
export const ADDRESS_AUTOCOMPLETE_DEFAULT_LIMIT = 5;
export const ADDRESS_AUTOCOMPLETE_MAX_LIMIT = 10;
export const ADDRESS_SUGGESTION_TOKEN_TTL_MS = 15 * 60 * 1000;

const PHOTON_BASE_URL = "https://photon.komoot.io/api";
const ADDRESS_AUTOCOMPLETE_TIMEOUT_MS = 8000;

export interface AddressAutocompleteSuggestion {
  id: string;
  label: string;
  primaryText: string;
  secondaryText: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  precision: AddressSuggestionPrecision;
  addressSuggestionToken?: string;
  placeId?: string;
  provider?: AddressSuggestionProvider;
  requiresResolution?: boolean;
  entries?: number;
  requiresSecondaryExpansion?: boolean;
  selected?: string;
}

export interface PhotonAddressFeature {
  type: "Feature";
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

interface PhotonAddressResponse {
  type?: "FeatureCollection";
  features?: PhotonAddressFeature[];
}

export type AddressAutocompleteErrorCode =
  | "INVALID_QUERY"
  | "CAPPED"
  | "TIMEOUT"
  | "UNAVAILABLE";

export interface AddressAutocompleteSuccessResponse {
  suggestions: AddressAutocompleteSuggestion[];
}

export interface AddressAutocompleteErrorResponse {
  code: AddressAutocompleteErrorCode;
}

export function sanitizeAddressAutocompleteQuery(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, ADDRESS_AUTOCOMPLETE_QUERY_MAX_LENGTH);
}

export function getAddressAutocompleteProviderQuery(input: string): string {
  return buildAddressAutocompleteProviderQuery(
    sanitizeAddressAutocompleteQuery(input)
  );
}

export function isAddressAutocompleteQueryValid(query: string): boolean {
  return query.length >= ADDRESS_AUTOCOMPLETE_MIN_QUERY_LENGTH;
}

function isProviderQueryValid(query: string): boolean {
  return query.length >= ADDRESS_AUTOCOMPLETE_PROVIDER_MIN_QUERY_LENGTH;
}

export function clampAddressAutocompleteLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return ADDRESS_AUTOCOMPLETE_DEFAULT_LIMIT;
  }

  return Math.min(
    ADDRESS_AUTOCOMPLETE_MAX_LIMIT,
    Math.max(1, Math.trunc(limit))
  );
}

function normalizePart(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isUnitedStatesCountry(country: string | undefined): boolean {
  const normalized = normalizePart(country).toLowerCase();
  return (
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "usa" ||
    normalized === "us"
  );
}

function isFiniteCoordinatePair(
  coordinates: [number, number] | undefined
): coordinates is [number, number] {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  );
}

function joinParts(parts: string[], separator = ", "): string {
  return parts.filter((part) => part.trim().length > 0).join(separator);
}

export function mapPhotonFeatureToAddressSuggestion(
  feature: PhotonAddressFeature,
  _options: { userId: string; now?: number }
): AddressAutocompleteSuggestion | null {
  const props = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (
    !isFiniteCoordinatePair(coordinates) ||
    !isUnitedStatesCountry(props.country)
  ) {
    return null;
  }

  const street = normalizePart(props.street);
  const houseNumber = normalizePart(props.housenumber);
  if (!street) {
    return null;
  }

  const address = houseNumber ? `${houseNumber} ${street}` : street;
  const city = normalizePart(props.city || props.district || props.county);
  const state = normalizePart(props.state);
  const zip = normalizePart(props.postcode);
  const secondaryText = joinParts([city, joinParts([state, zip], " ")]);
  const label = joinParts([address, secondaryText]);
  const id = `${props.osm_type || "N"}:${props.osm_id || 0}`;
  const precision: AddressSuggestionPrecision = houseNumber
    ? "PREMISE"
    : "STREET";
  return {
    id,
    label,
    primaryText: address,
    secondaryText,
    address,
    city,
    state,
    zip,
    precision,
    provider: "photon",
    requiresResolution: false,
  };
}

function normalizeAddressText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHouseNumberAndStreet(value: string): {
  houseNumber: string;
  street: string;
} {
  const normalized = normalizeAddressText(value);
  const match = normalized.match(/^(\d+[a-z]?)\s+(.+)$/);
  if (!match) {
    return { houseNumber: "", street: normalized };
  }

  return { houseNumber: match[1], street: match[2] };
}

function scoreAddressSuggestion(
  suggestion: AddressAutocompleteSuggestion,
  query: string
): number {
  const parsed = parseAddressInput(query);
  const requestedAddress = normalizeAddressText(parsed.address);
  const suggestedAddress = normalizeAddressText(suggestion.address);
  const requested = getHouseNumberAndStreet(parsed.address);
  const suggested = getHouseNumberAndStreet(suggestion.address);
  const requestedState = normalizeUsState(parsed.state);
  const suggestedState = normalizeUsState(suggestion.state);
  let score = 0;

  if (requestedAddress && requestedAddress === suggestedAddress) score += 100;
  if (
    requested.houseNumber &&
    requested.houseNumber === suggested.houseNumber
  ) {
    score += 15;
  }
  if (requested.street && requested.street === suggested.street) score += 60;
  if (
    parsed.city &&
    normalizeAddressText(parsed.city) === normalizeAddressText(suggestion.city)
  ) {
    score += 40;
  }
  if (requestedState && requestedState === suggestedState) score += 35;
  if (parsed.zip && parsed.zip === suggestion.zip) score += 25;
  if (suggestion.precision === "PREMISE") score += 8;

  return score;
}

function rankAddressSuggestions(
  suggestions: AddressAutocompleteSuggestion[],
  query: string
): AddressAutocompleteSuggestion[] {
  const parsed = parseAddressInput(query);
  const requestedState = normalizeUsState(parsed.state);
  const filteredSuggestions = requestedState
    ? suggestions.filter((suggestion) => {
        const suggestionState = normalizeUsState(suggestion.state);
        return !suggestionState || suggestionState === requestedState;
      })
    : suggestions;

  return filteredSuggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      score: scoreAddressSuggestion(suggestion, query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map(({ suggestion }) => suggestion);
}

export async function searchAddressSuggestions(
  query: string,
  options: {
    limit?: number;
    userId: string;
    signal?: AbortSignal;
    context?: AddressSearchContext;
    sessionToken?: string;
    selected?: string;
  }
): Promise<AddressAutocompleteSuggestion[]> {
  const sanitized = sanitizeAddressAutocompleteQuery(query);
  const providerQuery = buildAddressAutocompleteProviderQuery(
    sanitized,
    options.context
  );
  if (!isAddressAutocompleteQueryValid(providerQuery)) {
    return [];
  }

  const limit = clampAddressAutocompleteLimit(
    options.limit ?? ADDRESS_AUTOCOMPLETE_DEFAULT_LIMIT
  );

  if (features.smartyAddressAutocomplete && isProviderQueryValid(providerQuery)) {
    try {
      const smartySuggestions = await suggestSmartyAddresses(providerQuery, {
        limit,
        selected: options.selected,
        signal: options.signal,
      });
      if (smartySuggestions.length > 0 || options.selected) {
        return smartySuggestions;
      }
    } catch {
      if (options.selected) {
        throw new Error("Address secondary suggestions unavailable");
      }
      // Fall through to Google as the configured private-address fallback.
    }
  }

  if (
    !options.selected &&
    features.googleAddressValidation &&
    isProviderQueryValid(providerQuery)
  ) {
    try {
      return await suggestGoogleAddresses(providerQuery, {
        limit,
        sessionToken: options.sessionToken,
      });
    } catch {
      // Fall through to Photon as a dev/emergency fallback.
    }
  }

  if (!features.photonFallback || options.selected) {
    return [];
  }

  const requestLimit = limit * 3;
  const url = `${PHOTON_BASE_URL}?q=${encodeURIComponent(
    providerQuery
  )}&limit=${requestLimit}&lang=en&lat=39.8283&lon=-98.5795`;

  const response = await fetchWithTimeout(url, {
    signal: options.signal,
    timeout: ADDRESS_AUTOCOMPLETE_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error("Address suggestions unavailable");
  }

  const data = (await response.json()) as PhotonAddressResponse;
  const suggestions: AddressAutocompleteSuggestion[] = [];
  const seenSuggestionKeys = new Set<string>();
  for (const feature of data.features ?? []) {
    const suggestion = mapPhotonFeatureToAddressSuggestion(feature, {
      userId: options.userId,
    });
    if (!suggestion) {
      continue;
    }

    const suggestionKey = getAddressSuggestionIdentityKey(suggestion);
    if (seenSuggestionKeys.has(suggestionKey)) {
      continue;
    }
    seenSuggestionKeys.add(suggestionKey);
    suggestions.push(suggestion);
  }

  return rankAddressSuggestions(suggestions, providerQuery).slice(0, limit);
}
