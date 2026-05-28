import "server-only";

import { fetchWithTimeout, FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { features } from "@/lib/env";
import type { AddressAutocompleteSuggestion } from "@/lib/geocoding/address-autocomplete";
import { signAddressSuggestionToken } from "@/lib/geocoding/address-suggestion-token";
import {
  isProviderMonthlyCapReached,
  recordGeocodingProviderSkipped,
  recordGeocodingProviderUsage,
} from "@/lib/geocoding/provider-cost-controls";

const SMARTY_AUTOCOMPLETE_URL =
  "https://us-autocomplete-pro.api.smarty.com/lookup";
const SMARTY_STREET_ADDRESS_URL =
  "https://us-street.api.smarty.com/street-address";
const SMARTY_AUTOCOMPLETE_TIMEOUT_MS = 8000;
const SMARTY_STREET_ADDRESS_TIMEOUT_MS = 8000;
const SMARTY_SEARCH_MAX_LENGTH = 32;
const ADDRESS_SUGGESTION_TOKEN_TTL_MS = 15 * 60 * 1000;

export class SmartyAddressAutocompleteUnavailableError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "MISSING_KEY"
      | "DISABLED"
      | "CAPPED"
      | "TIMEOUT"
      | "UPSTREAM"
  ) {
    super(message);
    this.name = "SmartyAddressAutocompleteUnavailableError";
  }
}

interface SmartyAutocompleteResponse {
  suggestions?: SmartyAutocompleteSuggestion[];
}

interface SmartyAutocompleteSuggestion {
  street_line?: string;
  secondary?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  entries?: number;
  source?: string;
}

interface SmartyStreetCandidate {
  delivery_line_1?: string;
  last_line?: string;
  components?: {
    primary_number?: string;
    street_predirection?: string;
    street_name?: string;
    street_suffix?: string;
    street_postdirection?: string;
    secondary_designator?: string;
    secondary_number?: string;
    city_name?: string;
    state_abbreviation?: string;
    zipcode?: string;
  };
  metadata?: {
    latitude?: number;
    longitude?: number;
    precision?: string;
  };
  analysis?: {
    dpv_match_code?: string;
  };
}

export interface SmartyAddressValidationInput {
  userId: string;
  sourceId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  typedAddress?: string;
  placeId?: string;
  signal?: AbortSignal;
}

function normalizeText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function parseMonthlyCap(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function getSmartyAuthorizationHeader(): string {
  const authId = process.env.SMARTY_AUTH_ID?.trim();
  const authToken = process.env.SMARTY_AUTH_TOKEN?.trim();
  if (!authId || !authToken) {
    throw new SmartyAddressAutocompleteUnavailableError(
      "Smarty secret key pair is not configured",
      "MISSING_KEY"
    );
  }

  return `Basic ${Buffer.from(`${authId}:${authToken}`, "utf8").toString(
    "base64"
  )}`;
}

function hasSmartyAddressAutocompleteConfig(): boolean {
  return features.smartyAddressAutocomplete;
}

function assertSmartyAddressCaptureAvailable() {
  if (!hasSmartyAddressAutocompleteConfig()) {
    recordGeocodingProviderSkipped({
      provider: "smarty",
      surface: "address_capture",
      reason: "disabled",
    });
    throw new SmartyAddressAutocompleteUnavailableError(
      "Smarty address capture is disabled",
      "DISABLED"
    );
  }

  if (
    isProviderMonthlyCapReached({
      provider: "smarty",
      surface: "address_capture",
      monthlyCap: parseMonthlyCap(
        process.env.SMARTY_ADDRESS_AUTOCOMPLETE_MONTHLY_CAP
      ),
    })
  ) {
    recordGeocodingProviderSkipped({
      provider: "smarty",
      surface: "address_capture",
      reason: "budget_cap",
    });
    throw new SmartyAddressAutocompleteUnavailableError(
      "Smarty address capture monthly cap reached",
      "CAPPED"
    );
  }
}

function formatSelectedValue(suggestion: {
  streetLine: string;
  secondary: string;
  city: string;
  state: string;
  zip: string;
  entries: number;
}): string {
  const secondary = suggestion.secondary
    ? `${suggestion.secondary}${
        suggestion.entries > 1 ? ` (${suggestion.entries})` : ""
      }`
    : "";

  return [
    suggestion.streetLine,
    secondary,
    suggestion.city,
    suggestion.state,
    suggestion.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

function mapSmartySuggestion(
  suggestion: SmartyAutocompleteSuggestion,
  index: number
): AddressAutocompleteSuggestion | null {
  const streetLine = normalizeText(suggestion.street_line);
  const secondary = normalizeText(suggestion.secondary);
  const city = normalizeText(suggestion.city);
  const state = normalizeText(suggestion.state).toUpperCase();
  const zip = normalizeText(suggestion.zipcode);
  const entries = Number.isFinite(suggestion.entries)
    ? Math.max(0, Math.trunc(suggestion.entries ?? 0))
    : 0;

  if (!streetLine || !city || !state || !zip) {
    return null;
  }

  const requiresSecondaryExpansion = entries > 1;
  const address = [streetLine, secondary].filter(Boolean).join(" ");
  const primaryText = requiresSecondaryExpansion
    ? `${address} (${entries} entries)`
    : address;
  const secondaryText = [city, `${state} ${zip}`.trim()]
    .filter(Boolean)
    .join(", ");
  const selected = formatSelectedValue({
    streetLine,
    secondary,
    city,
    state,
    zip,
    entries,
  });

  return {
    id: `smarty:${Buffer.from(selected || `${address}:${index}`, "utf8")
      .toString("base64url")
      .slice(0, 96)}`,
    label: [primaryText, secondaryText].filter(Boolean).join(", "),
    primaryText,
    secondaryText,
    address,
    city,
    state,
    zip,
    precision: "PREMISE",
    provider: "smarty",
    requiresResolution: !requiresSecondaryExpansion,
    entries,
    requiresSecondaryExpansion,
    selected,
  };
}

function formatStreetAddressFromComponents(
  components: SmartyStreetCandidate["components"]
): string {
  if (!components) return "";
  const street = [
    components.primary_number,
    components.street_predirection,
    components.street_name,
    components.street_suffix,
    components.street_postdirection,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
  const secondary = [
    components.secondary_designator,
    components.secondary_number,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");

  return [street, secondary].filter(Boolean).join(" ");
}

function isDeliverableSmartyCandidate(
  candidate: SmartyStreetCandidate
): boolean {
  const dpvMatchCode = normalizeText(candidate.analysis?.dpv_match_code)
    .toUpperCase()
    .slice(0, 1);
  return dpvMatchCode === "Y" || dpvMatchCode === "D";
}

function getFiniteSmartyCoordinates(
  candidate: SmartyStreetCandidate
): { lat: number; lng: number } | null {
  const lat = candidate.metadata?.latitude;
  const lng = candidate.metadata?.longitude;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat === 0 ||
    lng === 0 ||
    (lat as number) < -90 ||
    (lat as number) > 90 ||
    (lng as number) < -180 ||
    (lng as number) > 180
  ) {
    return null;
  }

  return { lat: lat as number, lng: lng as number };
}

function mapSmartyStreetCandidateToSuggestion(
  candidate: SmartyStreetCandidate,
  input: SmartyAddressValidationInput
): AddressAutocompleteSuggestion | null {
  if (!isDeliverableSmartyCandidate(candidate)) {
    return null;
  }

  const coords = getFiniteSmartyCoordinates(candidate);
  if (!coords) {
    return null;
  }

  const components = candidate.components;
  const validatedAddress =
    normalizeText(candidate.delivery_line_1) ||
    formatStreetAddressFromComponents(components) ||
    normalizeText(input.address);
  const city =
    normalizeText(components?.city_name) || normalizeText(input.city);
  const state =
    normalizeText(components?.state_abbreviation).toUpperCase() ||
    normalizeText(input.state).toUpperCase();
  const zip = normalizeText(components?.zipcode) || normalizeText(input.zip);
  if (!validatedAddress || !city || !state || !zip) {
    return null;
  }

  const selectedAddress = normalizeText(input.typedAddress) || validatedAddress;
  const secondaryText = [city, `${state} ${zip}`.trim()]
    .filter(Boolean)
    .join(", ");
  const now = Date.now();

  return {
    id: input.sourceId.startsWith("smarty:")
      ? input.sourceId
      : `smarty:${input.sourceId}`,
    label: [selectedAddress, secondaryText].filter(Boolean).join(", "),
    primaryText: selectedAddress,
    secondaryText,
    address: selectedAddress,
    city,
    state,
    zip,
    precision: "PREMISE",
    provider: "smarty",
    placeId: input.placeId ?? input.sourceId,
    requiresResolution: false,
    addressSuggestionToken: signAddressSuggestionToken({
      provider: "smarty",
      precision: "PREMISE",
      sourceId: input.sourceId,
      userId: input.userId,
      address: validatedAddress,
      city,
      state,
      zip,
      lat: coords.lat,
      lng: coords.lng,
      issuedAt: now,
      expiresAt: now + ADDRESS_SUGGESTION_TOKEN_TTL_MS,
    }),
  };
}

export async function suggestSmartyAddresses(
  query: string,
  options: {
    limit: number;
    selected?: string;
    signal?: AbortSignal;
  }
): Promise<AddressAutocompleteSuggestion[]> {
  assertSmartyAddressCaptureAvailable();

  const search = query.trim().slice(0, SMARTY_SEARCH_MAX_LENGTH);
  const params = new URLSearchParams({
    search,
    max_results: String(Math.max(1, Math.min(10, Math.trunc(options.limit)))),
    prefer_geolocation: "none",
  });
  const selected = options.selected?.trim();
  if (selected) {
    params.set("selected", selected);
  }

  try {
    const response = await fetchWithTimeout(
      `${SMARTY_AUTOCOMPLETE_URL}?${params.toString()}`,
      {
        method: "GET",
        signal: options.signal,
        timeout: SMARTY_AUTOCOMPLETE_TIMEOUT_MS,
        headers: {
          Authorization: getSmartyAuthorizationHeader(),
        },
      }
    );

    if (response.status === 402 || response.status === 429) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address autocomplete is capped or rate limited",
        "CAPPED"
      );
    }
    if (!response.ok) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address autocomplete request failed",
        "UPSTREAM"
      );
    }

    recordGeocodingProviderUsage({
      provider: "smarty",
      surface: "address_capture",
      operation: selected
        ? "us_autocomplete_pro_secondary_expansion"
        : "us_autocomplete_pro_lookup",
    });

    const payload = (await response.json()) as SmartyAutocompleteResponse;
    return (payload.suggestions ?? [])
      .map(mapSmartySuggestion)
      .filter(
        (suggestion): suggestion is AddressAutocompleteSuggestion =>
          suggestion !== null
      )
      .slice(0, options.limit);
  } catch (error) {
    if (error instanceof SmartyAddressAutocompleteUnavailableError) {
      throw error;
    }
    if (error instanceof FetchTimeoutError) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address autocomplete request timed out",
        "TIMEOUT"
      );
    }
    throw new SmartyAddressAutocompleteUnavailableError(
      "Smarty address autocomplete request failed",
      "UPSTREAM"
    );
  }
}

export async function validateSmartyAddressSuggestionForToken(
  input: SmartyAddressValidationInput
): Promise<AddressAutocompleteSuggestion | null> {
  assertSmartyAddressCaptureAvailable();

  const params = new URLSearchParams({
    street: input.address,
    city: input.city,
    state: input.state,
    zipcode: input.zip,
    candidates: "1",
  });

  try {
    const response = await fetchWithTimeout(
      `${SMARTY_STREET_ADDRESS_URL}?${params.toString()}`,
      {
        method: "GET",
        signal: input.signal,
        timeout: SMARTY_STREET_ADDRESS_TIMEOUT_MS,
        headers: {
          Authorization: getSmartyAuthorizationHeader(),
        },
      }
    );

    if (response.status === 402 || response.status === 429) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address validation is capped or rate limited",
        "CAPPED"
      );
    }
    if (!response.ok) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address validation request failed",
        "UPSTREAM"
      );
    }

    recordGeocodingProviderUsage({
      provider: "smarty",
      surface: "address_capture",
      operation: "us_street_address_validation",
    });

    const candidates = (await response.json()) as SmartyStreetCandidate[];
    const candidate = candidates[0];
    return candidate
      ? mapSmartyStreetCandidateToSuggestion(candidate, input)
      : null;
  } catch (error) {
    if (error instanceof SmartyAddressAutocompleteUnavailableError) {
      throw error;
    }
    if (error instanceof FetchTimeoutError) {
      throw new SmartyAddressAutocompleteUnavailableError(
        "Smarty address validation request timed out",
        "TIMEOUT"
      );
    }
    throw new SmartyAddressAutocompleteUnavailableError(
      "Smarty address validation request failed",
      "UPSTREAM"
    );
  }
}
