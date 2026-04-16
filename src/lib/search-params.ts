import { normalizeLanguages } from "./languages";
import {
  MAX_SAFE_PRICE,
  MAX_SAFE_PAGE,
  MAX_ARRAY_ITEMS,
  MAX_QUERY_LENGTH,
} from "./constants";
import type { SortOption, FilterParams, FilterCriteria } from "./search-types";
import {
  boundsTupleToObject,
  deriveSearchBoundsFromPoint,
} from "./search/location-bounds";
import {
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_LEASE_DURATIONS,
  LEASE_DURATION_ALIASES,
  VALID_ROOM_TYPES,
  ROOM_TYPE_ALIASES,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
} from "./filter-schema";

// Re-export filter constants for consumers that import from search-params
export {
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_LEASE_DURATIONS,
  LEASE_DURATION_ALIASES,
  VALID_ROOM_TYPES,
  ROOM_TYPE_ALIASES,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
};

// Re-export for backward compatibility
export { MAX_SAFE_PRICE, MAX_SAFE_PAGE, MAX_ARRAY_ITEMS };

// Canonical type definitions live in search-types.ts (single source of truth).
// Re-exported here for consumers that import from search-params.
export type { SortOption, FilterParams, FilterCriteria };

/**
 * Returns true if any narrowing filter is active (excludes query, bounds, sort, nearMatches).
 * Used to distinguish "unbounded browse" (no filters) from "filtered browse" (filters but no query/bounds).
 */
export function hasActiveFilters(params: FilterParams): boolean {
  return Boolean(
    params.minPrice != null ||
    params.maxPrice != null ||
    (params.amenities && params.amenities.length > 0) ||
    params.moveInDate ||
    params.endDate ||
    params.leaseDuration ||
    (params.houseRules && params.houseRules.length > 0) ||
    params.roomType ||
    (params.languages && params.languages.length > 0) ||
    params.genderPreference ||
    params.householdGender ||
    params.bookingMode ||
    (params.minAvailableSlots != null && params.minAvailableSlots > 1)
  );
}

export interface RawSearchParams {
  q?: string | string[];
  where?: string | string[];
  what?: string | string[];
  minPrice?: string | string[];
  maxPrice?: string | string[];
  // Budget aliases — canonical (minPrice/maxPrice) take precedence
  minBudget?: string | string[];
  maxBudget?: string | string[];
  amenities?: string | string[];
  startDate?: string | string[];
  moveInDate?: string | string[];
  endDate?: string | string[];
  leaseDuration?: string | string[];
  houseRules?: string | string[];
  languages?: string | string[];
  roomType?: string | string[];
  genderPreference?: string | string[];
  householdGender?: string | string[];
  bookingMode?: string | string[];
  minSlots?: string | string[];
  minLat?: string | string[];
  maxLat?: string | string[];
  minLng?: string | string[];
  maxLng?: string | string[];
  lat?: string | string[];
  lng?: string | string[];
  page?: string | string[];
  pageNumber?: string | string[];
  cursor?: string | string[];
  cursorStack?: string | string[];
  sort?: string | string[];
  nearMatches?: string | string[];
}

export interface ParsedSearchParams {
  q?: string;
  locationLabel?: string;
  what?: string;
  requestedPage: number;
  sortOption: SortOption;
  filterParams: NormalizedSearchFilters;
  /**
   * True when a text query exists but no geographic bounds were provided.
   * This indicates an unbounded search that would cause full-table scans.
   * Callers should block or warn about such searches.
   */
  boundsRequired: boolean;
  /**
   * True when browsing without query or bounds (browse-all mode).
   * Results will be capped at MAX_UNBOUNDED_RESULTS to prevent full-table scans.
   * UI should indicate that more results are available with location filter.
   */
  browseMode: boolean;
}

export interface NormalizedSearchFilters extends FilterCriteria {
  availabilityIntent?: "availability";
}

interface NormalizeSearchFiltersOptions {
  invalidRange?: "drop" | "throw";
  overlongText?: "truncate" | "drop";
}

type SearchFilterNormalizationInput = {
  query?: unknown;
  locationLabel?: unknown;
  vibeQuery?: unknown;
  minPrice?: unknown;
  maxPrice?: unknown;
  amenities?: unknown;
  moveInDate?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  leaseDuration?: unknown;
  houseRules?: unknown;
  languages?: unknown;
  roomType?: unknown;
  genderPreference?: unknown;
  householdGender?: unknown;
  bookingMode?: unknown;
  bounds?: unknown;
  minAvailableSlots?: unknown;
  minSlots?: unknown;
  nearMatches?: unknown;
  sort?: unknown;
  availabilityIntent?: unknown;
};

/**
 * Canonical filter params that affect the result set.
 * Excludes pagination/sort and map viewport keys.
 */
export const FILTER_QUERY_KEYS = [
  "q",
  "what",
  "minPrice",
  "maxPrice",
  "amenities",
  "moveInDate",
  "endDate",
  "leaseDuration",
  "houseRules",
  "languages",
  "roomType",
  "genderPreference",
  "householdGender",
  "bookingMode",
  "minSlots",
  "nearMatches",
] as const;

/**
 * Convert URLSearchParams to a raw params object, preserving duplicate keys as arrays.
 * This is needed because Object.fromEntries(searchParams.entries()) loses duplicates.
 *
 * Example: ?amenities=Wifi&amenities=AC → { amenities: ['Wifi', 'AC'] }
 * Example: ?amenities=Wifi → { amenities: 'Wifi' } (single values stay as strings)
 */
export function buildRawParamsFromSearchParams(
  searchParams: URLSearchParams
): Record<string, string | string[] | undefined> {
  const rawParams: Record<string, string | string[] | undefined> = {};

  searchParams.forEach((value, key) => {
    const existing = rawParams[key];
    if (existing) {
      // Handle multiple values for same key
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        rawParams[key] = [existing, value];
      }
    } else {
      rawParams[key] = value;
    }
  });

  return rawParams;
}

/**
 * Build canonical filter query params from URLSearchParams.
 * This ensures every consumer (list/map/count/cache keys) uses the same parsed filter set.
 */
export function buildCanonicalFilterParamsFromSearchParams(
  searchParams: URLSearchParams
): URLSearchParams {
  const raw = buildRawParamsFromSearchParams(searchParams);
  const parsed = parseSearchParams(raw as RawSearchParams);
  return buildCanonicalFilterSearchParams(parsed.filterParams);
}

const validSortOptions: SortOption[] = [...VALID_SORT_OPTIONS];

const getFirstValue = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const safeParseArray = (
  values: string | string[] | undefined,
  allowlist: readonly string[],
  maxItems: number = MAX_ARRAY_ITEMS
): string[] | undefined => {
  if (!values) return undefined;
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  const list = (typeof values === "string" ? [values] : values).flatMap(
    (value) => value.split(",")
  );
  const validated = list
    .map((value) => value.trim())
    .map((value) => allowMap.get(value.toLowerCase()))
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(validated)].slice(0, maxItems);
  return unique.length > 0 ? unique : undefined;
};

const safeParseEnum = <T extends string>(
  value: string | undefined,
  allowlist: readonly T[],
  defaultVal?: T,
  aliases?: Record<string, string>
): T | undefined => {
  if (!value) return defaultVal;
  const trimmed = value.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // First check aliases to resolve alternative formats
  if (aliases) {
    const aliasedValue = aliases[lowerTrimmed];
    if (aliasedValue && allowlist.includes(aliasedValue as T)) {
      return aliasedValue === "any" ? undefined : (aliasedValue as T);
    }
  }

  // Case-insensitive matching: find the canonical form from allowlist
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  const canonical = allowMap.get(lowerTrimmed);
  if (canonical) {
    return canonical === "any" ? undefined : (canonical as T);
  }
  return defaultVal;
};

const safeParseFloat = (
  value: string | undefined,
  min?: number,
  max?: number
): number | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  let result = parsed;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
};

const safeParseInt = (
  value: string | undefined,
  min?: number,
  max?: number,
  defaultVal?: number
): number => {
  if (!value) return defaultVal ?? 1;
  const trimmed = value.trim();
  if (!trimmed) return defaultVal ?? 1;
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) return defaultVal ?? 1;
  if (!Number.isFinite(parsed)) return defaultVal ?? 1;
  let result = parsed;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
};

const safeParseDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() != year ||
    date.getMonth() != month - 1 ||
    date.getDate() != day
  ) {
    return undefined;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return undefined;
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  if (date > maxDate) return undefined;
  return trimmed;
};

const getFirstInputValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const toStringArrayInput = (
  value: unknown
): string | string[] | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
};

const normalizeTextField = (
  value: unknown,
  overflow: "truncate" | "drop" = "truncate"
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_QUERY_LENGTH) {
    return trimmed;
  }
  return overflow === "truncate"
    ? trimmed.slice(0, MAX_QUERY_LENGTH)
    : undefined;
};

const normalizeFiniteNumber = (
  value: unknown,
  min?: number,
  max?: number
): number | undefined => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    let normalized = value;
    if (min !== undefined && normalized < min) normalized = min;
    if (max !== undefined && normalized > max) normalized = max;
    return normalized;
  }

  if (typeof value === "string") {
    return safeParseFloat(value, min, max);
  }

  return undefined;
};

const normalizePriceValue = (value: unknown): number | undefined => {
  return normalizeFiniteNumber(value, 0, MAX_SAFE_PRICE);
};

const normalizeBookingMode = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;

  switch (value.trim().toLowerCase()) {
    case "shared":
      return "SHARED";
    case "whole_unit":
    case "whole-unit":
    case "whole unit":
    case "wholeunit":
      return "WHOLE_UNIT";
    case "per_slot":
    case "per-slot":
    case "per slot":
    case "perslot":
      return "SHARED";
    default:
      return undefined;
  }
};

const normalizeMinAvailableSlots = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    const normalized = Math.trunc(value);
    return normalized >= 1 && normalized <= 20 ? normalized : undefined;
  }

  if (typeof value === "string") {
    const parsed = parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20
      ? parsed
      : undefined;
  }

  return undefined;
};

const normalizeNearMatches = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
      return true;
    case "false":
    case "0":
      return false;
    default:
      return undefined;
  }
};

const normalizeSortOption = (value: unknown): SortOption | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return validSortOptions.includes(trimmed as SortOption)
    ? (trimmed as SortOption)
    : undefined;
};

const normalizeBoundsInput = (
  value: unknown,
  invalidRange: "drop" | "throw"
): FilterParams["bounds"] => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const bounds = value as Record<string, unknown>;
  const minLat = normalizeFiniteNumber(bounds.minLat, -90, 90);
  const maxLat = normalizeFiniteNumber(bounds.maxLat, -90, 90);
  const minLng = normalizeFiniteNumber(bounds.minLng, -180, 180);
  const maxLng = normalizeFiniteNumber(bounds.maxLng, -180, 180);

  if (
    minLat === undefined ||
    maxLat === undefined ||
    minLng === undefined ||
    maxLng === undefined
  ) {
    return undefined;
  }

  const clampedBounds = {
    minLat: Math.max(-90, Math.min(90, minLat)),
    maxLat: Math.max(-90, Math.min(90, maxLat)),
    minLng: Math.max(-180, Math.min(180, minLng)),
    maxLng: Math.max(-180, Math.min(180, maxLng)),
  };

  if (clampedBounds.minLat > clampedBounds.maxLat) {
    if (invalidRange === "throw") {
      throw new Error("minLat cannot exceed maxLat");
    }
    return undefined;
  }

  return clampedBounds;
};

export function normalizeSearchFilters(
  input: SearchFilterNormalizationInput,
  options: NormalizeSearchFiltersOptions = {}
): NormalizedSearchFilters {
  const {
    invalidRange = "drop",
    overlongText = "truncate",
  } = options;

  const query = normalizeTextField(getFirstInputValue(input.query), overlongText);
  const locationLabel = normalizeTextField(
    getFirstInputValue(input.locationLabel),
    overlongText
  );
  const vibeQuery = normalizeTextField(
    getFirstInputValue(input.vibeQuery),
    overlongText
  );

  let minPrice = normalizePriceValue(getFirstInputValue(input.minPrice));
  let maxPrice = normalizePriceValue(getFirstInputValue(input.maxPrice));
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    if (invalidRange === "throw") {
      throw new Error("minPrice cannot exceed maxPrice");
    }
    minPrice = undefined;
    maxPrice = undefined;
  }

  const amenities = safeParseArray(
    toStringArrayInput(input.amenities),
    VALID_AMENITIES
  );
  const houseRules = safeParseArray(
    toStringArrayInput(input.houseRules),
    VALID_HOUSE_RULES
  );

  const languages = (() => {
    const list = toStringArrayInput(input.languages);
    if (!list) return undefined;

    const flattened = (typeof list === "string" ? [list] : list)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 32);
    const normalized = normalizeLanguages(flattened);
    const unique = Array.from(new Set(normalized)).slice(0, MAX_ARRAY_ITEMS);
    return unique.length > 0 ? unique : undefined;
  })();

  const moveInSource =
    getFirstInputValue(input.moveInDate) ?? getFirstInputValue(input.startDate);
  const moveInDate = safeParseDate(
    typeof moveInSource === "string" ? moveInSource : undefined
  );
  const parsedEndDate = safeParseDate(
    typeof getFirstInputValue(input.endDate) === "string"
      ? (getFirstInputValue(input.endDate) as string)
      : undefined
  );
  const endDate =
    moveInDate && parsedEndDate && parsedEndDate > moveInDate
      ? parsedEndDate
      : undefined;

  const roomType = safeParseEnum(
    typeof getFirstInputValue(input.roomType) === "string"
      ? (getFirstInputValue(input.roomType) as string)
      : undefined,
    VALID_ROOM_TYPES as readonly string[],
    undefined,
    ROOM_TYPE_ALIASES
  );
  const leaseDuration = safeParseEnum(
    typeof getFirstInputValue(input.leaseDuration) === "string"
      ? (getFirstInputValue(input.leaseDuration) as string)
      : undefined,
    VALID_LEASE_DURATIONS as readonly string[],
    undefined,
    LEASE_DURATION_ALIASES
  );
  const genderPreference = safeParseEnum(
    typeof getFirstInputValue(input.genderPreference) === "string"
      ? (getFirstInputValue(input.genderPreference) as string)
      : undefined,
    VALID_GENDER_PREFERENCES as readonly string[]
  );
  const householdGender = safeParseEnum(
    typeof getFirstInputValue(input.householdGender) === "string"
      ? (getFirstInputValue(input.householdGender) as string)
      : undefined,
    VALID_HOUSEHOLD_GENDERS as readonly string[]
  );
  const bookingMode = normalizeBookingMode(getFirstInputValue(input.bookingMode));
  const minAvailableSlots = normalizeMinAvailableSlots(
    getFirstInputValue(input.minAvailableSlots) ??
      getFirstInputValue(input.minSlots)
  );
  const nearMatches = normalizeNearMatches(getFirstInputValue(input.nearMatches));
  const bounds = normalizeBoundsInput(input.bounds, invalidRange);
  const sort = normalizeSortOption(getFirstInputValue(input.sort));
  const availabilityIntent =
    getFirstInputValue(input.availabilityIntent) === "availability"
      ? "availability"
      : undefined;

  const normalized: NormalizedSearchFilters = {};

  if (query !== undefined) normalized.query = query;
  if (locationLabel !== undefined) normalized.locationLabel = locationLabel;
  if (vibeQuery !== undefined) normalized.vibeQuery = vibeQuery;
  if (minPrice !== undefined) normalized.minPrice = minPrice;
  if (maxPrice !== undefined) normalized.maxPrice = maxPrice;
  if (amenities !== undefined) normalized.amenities = amenities;
  if (moveInDate !== undefined) normalized.moveInDate = moveInDate;
  if (endDate !== undefined) normalized.endDate = endDate;
  if (leaseDuration !== undefined) normalized.leaseDuration = leaseDuration;
  if (houseRules !== undefined) normalized.houseRules = houseRules;
  if (languages !== undefined) normalized.languages = languages;
  if (roomType !== undefined) normalized.roomType = roomType;
  if (genderPreference !== undefined) {
    normalized.genderPreference = genderPreference;
  }
  if (householdGender !== undefined) {
    normalized.householdGender = householdGender;
  }
  if (bookingMode !== undefined) normalized.bookingMode = bookingMode;
  if (bounds !== undefined) normalized.bounds = bounds;
  if (minAvailableSlots !== undefined) {
    normalized.minAvailableSlots = minAvailableSlots;
  }
  if (nearMatches !== undefined) normalized.nearMatches = nearMatches;
  if (sort !== undefined) normalized.sort = sort;
  if (availabilityIntent !== undefined) {
    normalized.availabilityIntent = availabilityIntent;
  }

  return normalized;
}

function buildCanonicalFilterSearchParams(
  filters: SearchFilterNormalizationInput
): URLSearchParams {
  const normalized = normalizeSearchFilters(filters, {
    invalidRange: "drop",
  });
  const canonical = new URLSearchParams();

  if (normalized.query) {
    canonical.set("q", normalized.query);
  }
  if (normalized.vibeQuery) {
    canonical.set("what", normalized.vibeQuery);
  }
  if (normalized.minPrice !== undefined) {
    canonical.set("minPrice", String(normalized.minPrice));
  }
  if (normalized.maxPrice !== undefined) {
    canonical.set("maxPrice", String(normalized.maxPrice));
  }

  [...(normalized.amenities ?? [])]
    .sort((left, right) => left.localeCompare(right))
    .forEach((value) => canonical.append("amenities", value));
  [...(normalized.houseRules ?? [])]
    .sort((left, right) => left.localeCompare(right))
    .forEach((value) => canonical.append("houseRules", value));
  [...(normalized.languages ?? [])]
    .sort((left, right) => left.localeCompare(right))
    .forEach((value) => canonical.append("languages", value));

  if (normalized.moveInDate) {
    canonical.set("moveInDate", normalized.moveInDate);
  }
  if (normalized.endDate) {
    canonical.set("endDate", normalized.endDate);
  }
  if (normalized.leaseDuration) {
    canonical.set("leaseDuration", normalized.leaseDuration);
  }
  if (normalized.roomType) {
    canonical.set("roomType", normalized.roomType);
  }
  if (normalized.genderPreference) {
    canonical.set("genderPreference", normalized.genderPreference);
  }
  if (normalized.householdGender) {
    canonical.set("householdGender", normalized.householdGender);
  }
  if (normalized.bookingMode) {
    canonical.set("bookingMode", normalized.bookingMode);
  }
  if (normalized.minAvailableSlots !== undefined) {
    canonical.set("minSlots", String(normalized.minAvailableSlots));
  }
  if (typeof normalized.nearMatches === "boolean") {
    canonical.set("nearMatches", normalized.nearMatches ? "true" : "false");
  }

  canonical.sort();
  return canonical;
}

export function parseSearchParams(raw: RawSearchParams): ParsedSearchParams {
  const q = normalizeTextField(getFirstValue(raw.q));
  const explicitLocationLabel = normalizeTextField(getFirstValue(raw.where));
  const what = normalizeTextField(getFirstValue(raw.what));

  const requestedPage = safeParseInt(
    getFirstValue(raw.page),
    1,
    MAX_SAFE_PAGE,
    1
  );

  const validLat = safeParseFloat(getFirstValue(raw.lat), -90, 90);
  const validLng = safeParseFloat(getFirstValue(raw.lng), -180, 180);
  const validMinLat = safeParseFloat(getFirstValue(raw.minLat), -90, 90);
  const validMaxLat = safeParseFloat(getFirstValue(raw.maxLat), -90, 90);
  const validMinLng = safeParseFloat(getFirstValue(raw.minLng), -180, 180);
  const validMaxLng = safeParseFloat(getFirstValue(raw.maxLng), -180, 180);

  const isLegacyPointLocationQuery =
    !explicitLocationLabel &&
    q !== undefined &&
    validLat !== undefined &&
    validLng !== undefined;
  const locationLabel = explicitLocationLabel ?? (isLegacyPointLocationQuery ? q : undefined);
  const effectiveQuery = isLegacyPointLocationQuery ? undefined : q;

  let effectiveMinLat = validMinLat;
  let effectiveMaxLat = validMaxLat;
  if (
    validMinLat !== undefined &&
    validMaxLat !== undefined &&
    validMinLat > validMaxLat
  ) {
    effectiveMinLat = undefined;
    effectiveMaxLat = undefined;
  }

  let bounds: FilterParams["bounds"];
  if (
    effectiveMinLat !== undefined &&
    effectiveMaxLat !== undefined &&
    validMinLng !== undefined &&
    validMaxLng !== undefined
  ) {
    bounds = {
      minLat: effectiveMinLat,
      maxLat: effectiveMaxLat,
      minLng: validMinLng,
      maxLng: validMaxLng,
    };
  } else if (validLat !== undefined && validLng !== undefined) {
    bounds = boundsTupleToObject(
      deriveSearchBoundsFromPoint(validLat, validLng)
    );
  }

  const normalizedFilters = normalizeSearchFilters(
    {
      query: effectiveQuery,
      locationLabel,
      vibeQuery: what,
      minPrice: getFirstValue(raw.minPrice) ?? getFirstValue(raw.minBudget),
      maxPrice: getFirstValue(raw.maxPrice) ?? getFirstValue(raw.maxBudget),
      amenities: raw.amenities,
      moveInDate: getFirstValue(raw.moveInDate),
      startDate: getFirstValue(raw.startDate),
      endDate: getFirstValue(raw.endDate),
      leaseDuration: getFirstValue(raw.leaseDuration),
      houseRules: raw.houseRules,
      languages: raw.languages,
      roomType: getFirstValue(raw.roomType),
      genderPreference: getFirstValue(raw.genderPreference),
      householdGender: getFirstValue(raw.householdGender),
      bookingMode: getFirstValue(raw.bookingMode),
      bounds,
      minSlots: getFirstValue(raw.minSlots),
      nearMatches: getFirstValue(raw.nearMatches),
      sort: getFirstValue(raw.sort),
    },
    {
      invalidRange: "drop",
      overlongText: "truncate",
    }
  );

  const sortOption = normalizedFilters.sort ?? "recommended";
  const filterParams: NormalizedSearchFilters = {
    ...normalizedFilters,
    query: effectiveQuery,
    locationLabel,
    vibeQuery: what,
    bounds,
    sort: sortOption,
  };

  const boundsRequired = isBoundsRequired({
    query: effectiveQuery,
    vibeQuery: what,
    bounds,
  });

  // Flag browse-all mode: no query and no bounds
  // Results will be capped but UI should inform user that more are available
  const browseMode = !effectiveQuery && !what && !bounds;

  return {
    q: effectiveQuery,
    locationLabel,
    what,
    requestedPage,
    sortOption,
    filterParams,
    boundsRequired,
    browseMode,
  };
}

/**
 * Get price parameter from URL search params with support for budget aliases.
 * Handles both canonical (minPrice/maxPrice) and alias (minBudget/maxBudget) formats.
 * Canonical params take precedence over aliases.
 *
 * @param searchParams - URL search params
 * @param type - 'min' or 'max' to specify which price bound
 * @returns The parsed price value or undefined
 */
export function getPriceParam(
  searchParams: URLSearchParams,
  type: "min" | "max"
): number | undefined {
  // Canonical param names take precedence
  const canonicalKey = type === "min" ? "minPrice" : "maxPrice";
  const aliasKey = type === "min" ? "minBudget" : "maxBudget";

  const canonicalValue = searchParams.get(canonicalKey);
  const aliasValue = searchParams.get(aliasKey);

  const value = canonicalValue || aliasValue;
  if (!value) return undefined;

  const parsed = parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  if (parsed > MAX_SAFE_PRICE) return MAX_SAFE_PRICE;

  return parsed;
}

/**
 * Validate and sanitize SearchFilters from untrusted input (e.g., client submissions).
 * Used by server actions before storing filters in the database.
 */
export function validateSearchFilters(filters: unknown): FilterParams {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return {};
  }

  const input = filters as Record<string, unknown>;
  const boundsInput =
    input.bounds && typeof input.bounds === "object"
      ? (() => {
          const bounds = input.bounds as Record<string, unknown>;
          if (
            typeof bounds.minLat === "number" &&
            typeof bounds.maxLat === "number" &&
            typeof bounds.minLng === "number" &&
            typeof bounds.maxLng === "number"
          ) {
            return {
              minLat: bounds.minLat,
              maxLat: bounds.maxLat,
              minLng: bounds.minLng,
              maxLng: bounds.maxLng,
            };
          }
          return undefined;
        })()
      : undefined;

  return normalizeSearchFilters(
    {
      query: typeof input.query === "string" ? input.query : undefined,
      locationLabel:
        typeof input.locationLabel === "string" ? input.locationLabel : undefined,
      vibeQuery: typeof input.vibeQuery === "string" ? input.vibeQuery : undefined,
      minPrice: typeof input.minPrice === "number" ? input.minPrice : undefined,
      maxPrice: typeof input.maxPrice === "number" ? input.maxPrice : undefined,
      amenities: Array.isArray(input.amenities) ? input.amenities : undefined,
      moveInDate:
        typeof input.moveInDate === "string" ? input.moveInDate : undefined,
      endDate: typeof input.endDate === "string" ? input.endDate : undefined,
      leaseDuration:
        typeof input.leaseDuration === "string" ? input.leaseDuration : undefined,
      houseRules: Array.isArray(input.houseRules) ? input.houseRules : undefined,
      languages: Array.isArray(input.languages) ? input.languages : undefined,
      roomType: typeof input.roomType === "string" ? input.roomType : undefined,
      genderPreference:
        typeof input.genderPreference === "string"
          ? input.genderPreference
          : undefined,
      householdGender:
        typeof input.householdGender === "string"
          ? input.householdGender
          : undefined,
      bookingMode:
        typeof input.bookingMode === "string" ? input.bookingMode : undefined,
      bounds: boundsInput,
      minAvailableSlots:
        typeof input.minAvailableSlots === "number"
          ? input.minAvailableSlots
          : undefined,
      nearMatches:
        typeof input.nearMatches === "boolean" ? input.nearMatches : undefined,
      sort: typeof input.sort === "string" ? input.sort : undefined,
    },
    {
    invalidRange: "throw",
    overlongText: "drop",
    }
  );
}

/**
 * Check whether a search request requires geographic bounds.
 * A text query without bounds would cause a full-table scan.
 *
 * Endpoint behavior when bounds are required but missing:
 * - /api/search/v2:      200 + { unboundedSearch: true }
 * - /api/search/facets:  400 + { boundsRequired: true }
 * - /api/search-count:   200 + { boundsRequired: true }
 */
export function isBoundsRequired(params: {
  query?: string | null;
  vibeQuery?: string | null;
  bounds?: unknown;
}): boolean {
  return !!(params.query || params.vibeQuery) && !params.bounds;
}
