import { normalizeLanguages } from "./languages";
import {
  MAX_SAFE_PRICE,
  MAX_SAFE_PAGE,
  MAX_ARRAY_ITEMS,
  LAT_OFFSET_DEGREES,
} from "./constants";

// Re-export for backward compatibility
export { MAX_SAFE_PRICE, MAX_SAFE_PAGE, MAX_ARRAY_ITEMS };

export type SortOption =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "rating";

export interface FilterParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  roomType?: string;
  languages?: string[];
  genderPreference?: string;
  householdGender?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  sort?: SortOption;
  nearMatches?: boolean;
}

export interface RawSearchParams {
  q?: string | string[];
  minPrice?: string | string[];
  maxPrice?: string | string[];
  amenities?: string | string[];
  moveInDate?: string | string[];
  leaseDuration?: string | string[];
  houseRules?: string | string[];
  languages?: string | string[];
  roomType?: string | string[];
  genderPreference?: string | string[];
  householdGender?: string | string[];
  minLat?: string | string[];
  maxLat?: string | string[];
  minLng?: string | string[];
  maxLng?: string | string[];
  lat?: string | string[];
  lng?: string | string[];
  page?: string | string[];
  sort?: string | string[];
  nearMatches?: string | string[];
}

export interface ParsedSearchParams {
  q?: string;
  requestedPage: number;
  sortOption: SortOption;
  filterParams: FilterParams;
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

/**
 * Convert URLSearchParams to a raw params object, preserving duplicate keys as arrays.
 * This is needed because Object.fromEntries(searchParams.entries()) loses duplicates.
 *
 * Example: ?amenities=Wifi&amenities=AC → { amenities: ['Wifi', 'AC'] }
 * Example: ?amenities=Wifi → { amenities: 'Wifi' } (single values stay as strings)
 */
export function buildRawParamsFromSearchParams(
  searchParams: URLSearchParams,
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

export const VALID_AMENITIES = [
  "Wifi",
  "AC",
  "Parking",
  "Washer",
  "Dryer",
  "Kitchen",
  "Gym",
  "Pool",
  "Furnished",
] as const;
export const VALID_HOUSE_RULES = [
  "Pets allowed",
  "Smoking allowed",
  "Couples allowed",
  "Guests allowed",
] as const;
export const VALID_LEASE_DURATIONS = [
  "any",
  "Month-to-month",
  "3 months",
  "6 months",
  "12 months",
  "Flexible",
] as const;
// Alias mappings for alternative formats (URL-friendly formats like 6_MONTHS)
export const LEASE_DURATION_ALIASES: Record<string, string> = {
  "month-to-month": "Month-to-month",
  month_to_month: "Month-to-month",
  mtm: "Month-to-month",
  "3_months": "3 months",
  "3months": "3 months",
  "6_months": "6 months",
  "6months": "6 months",
  "12_months": "12 months",
  "12months": "12 months",
  "1_year": "12 months",
  "1year": "12 months",
};
export const VALID_ROOM_TYPES = [
  "any",
  "Private Room",
  "Shared Room",
  "Entire Place",
] as const;
// Alias mappings for alternative formats (URL-friendly formats like PRIVATE)
export const ROOM_TYPE_ALIASES: Record<string, string> = {
  private: "Private Room",
  private_room: "Private Room",
  privateroom: "Private Room",
  shared: "Shared Room",
  shared_room: "Shared Room",
  sharedroom: "Shared Room",
  entire: "Entire Place",
  entire_place: "Entire Place",
  entireplace: "Entire Place",
  whole: "Entire Place",
  studio: "Entire Place",
};
export const VALID_GENDER_PREFERENCES = [
  "any",
  "MALE_ONLY",
  "FEMALE_ONLY",
  "NO_PREFERENCE",
] as const;
export const VALID_HOUSEHOLD_GENDERS = [
  "any",
  "ALL_MALE",
  "ALL_FEMALE",
  "MIXED",
] as const;
export const VALID_SORT_OPTIONS = [
  "recommended",
  "price_asc",
  "price_desc",
  "newest",
  "rating",
] as const;

const validSortOptions: SortOption[] = [
  "recommended",
  "price_asc",
  "price_desc",
  "newest",
  "rating",
];

const getFirstValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const safeParseArray = (
  values: string | string[] | undefined,
  allowlist: readonly string[],
  maxItems: number = MAX_ARRAY_ITEMS,
): string[] | undefined => {
  if (!values) return undefined;
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  const list = (typeof values === "string" ? [values] : values).flatMap(
    (value) => value.split(","),
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
  aliases?: Record<string, string>,
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
  max?: number,
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
  defaultVal?: number,
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

export function parseSearchParams(raw: RawSearchParams): ParsedSearchParams {
  const rawQuery = getFirstValue(raw.q);
  const query = rawQuery ? rawQuery.trim() : "";
  const q = query || undefined;

  const requestedPage = safeParseInt(
    getFirstValue(raw.page),
    1,
    MAX_SAFE_PAGE,
    1,
  );

  const validMinPrice = safeParseFloat(
    getFirstValue(raw.minPrice),
    0,
    MAX_SAFE_PRICE,
  );
  const validMaxPrice = safeParseFloat(
    getFirstValue(raw.maxPrice),
    0,
    MAX_SAFE_PRICE,
  );

  // P1-13: Reject inverted price ranges instead of silently swapping
  // This matches the behavior in filter-schema.ts normalizeFilters()
  if (
    validMinPrice !== undefined &&
    validMaxPrice !== undefined &&
    validMinPrice > validMaxPrice
  ) {
    throw new Error("minPrice cannot exceed maxPrice");
  }

  const validLat = safeParseFloat(getFirstValue(raw.lat), -90, 90);
  const validLng = safeParseFloat(getFirstValue(raw.lng), -180, 180);
  const validMinLat = safeParseFloat(getFirstValue(raw.minLat), -90, 90);
  const validMaxLat = safeParseFloat(getFirstValue(raw.maxLat), -90, 90);
  const validMinLng = safeParseFloat(getFirstValue(raw.minLng), -180, 180);
  const validMaxLng = safeParseFloat(getFirstValue(raw.maxLng), -180, 180);

  // P1-3: Lat inversion now throws (consistent with price inversion)
  if (
    validMinLat !== undefined &&
    validMaxLat !== undefined &&
    validMinLat > validMaxLat
  ) {
    throw new Error("minLat cannot exceed maxLat");
  }

  const amenitiesList = safeParseArray(raw.amenities, VALID_AMENITIES);
  const houseRulesList = safeParseArray(raw.houseRules, VALID_HOUSE_RULES);

  const languagesList = (() => {
    const list = raw.languages
      ? Array.isArray(raw.languages)
        ? raw.languages
        : [raw.languages]
      : [];
    const flattened = list
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 32);
    const normalized = normalizeLanguages(flattened);
    return Array.from(new Set(normalized)).slice(0, MAX_ARRAY_ITEMS);
  })();

  let bounds: FilterParams["bounds"];
  if (
    validMinLat !== undefined &&
    validMaxLat !== undefined &&
    validMinLng !== undefined &&
    validMaxLng !== undefined
  ) {
    bounds = {
      minLat: validMinLat,
      maxLat: validMaxLat,
      minLng: validMinLng,
      maxLng: validMaxLng,
    };
  } else if (validLat !== undefined && validLng !== undefined) {
    // Use canonical LAT_OFFSET_DEGREES (~10km radius)
    const cosLat = Math.cos((validLat * Math.PI) / 180);
    const lngOffset = cosLat < 0.01 ? 180 : LAT_OFFSET_DEGREES / cosLat;
    bounds = {
      minLat: Math.max(-90, validLat - LAT_OFFSET_DEGREES),
      maxLat: Math.min(90, validLat + LAT_OFFSET_DEGREES),
      minLng: Math.max(-180, validLng - lngOffset),
      maxLng: Math.min(180, validLng + lngOffset),
    };
  }

  const sortOption: SortOption = validSortOptions.includes(
    getFirstValue(raw.sort) as SortOption,
  )
    ? (getFirstValue(raw.sort) as SortOption)
    : "recommended";

  const validMoveInDate = safeParseDate(getFirstValue(raw.moveInDate));
  const validRoomType = safeParseEnum(
    getFirstValue(raw.roomType),
    VALID_ROOM_TYPES as readonly string[],
    undefined,
    ROOM_TYPE_ALIASES,
  );
  const validLeaseDuration = safeParseEnum(
    getFirstValue(raw.leaseDuration),
    VALID_LEASE_DURATIONS as readonly string[],
    undefined,
    LEASE_DURATION_ALIASES,
  );
  const validGenderPreference = safeParseEnum(
    getFirstValue(raw.genderPreference),
    VALID_GENDER_PREFERENCES as readonly string[],
  );
  const validHouseholdGender = safeParseEnum(
    getFirstValue(raw.householdGender),
    VALID_HOUSEHOLD_GENDERS as readonly string[],
  );

  // Parse nearMatches boolean flag
  const nearMatchesRaw = getFirstValue(raw.nearMatches);
  const nearMatches =
    nearMatchesRaw === "true"
      ? true
      : nearMatchesRaw === "false"
        ? false
        : undefined;

  const filterParams: FilterParams = {
    query: q,
    minPrice: validMinPrice,
    maxPrice: validMaxPrice,
    amenities: amenitiesList,
    moveInDate: validMoveInDate,
    leaseDuration: validLeaseDuration,
    houseRules: houseRulesList,
    languages: languagesList.length > 0 ? languagesList : undefined,
    roomType: validRoomType,
    genderPreference: validGenderPreference,
    householdGender: validHouseholdGender,
    bounds,
    sort: sortOption,
    nearMatches,
  };

  const boundsRequired = isBoundsRequired({ query: q, bounds });

  // Flag browse-all mode: no query and no bounds
  // Results will be capped but UI should inform user that more are available
  const browseMode = !q && !bounds;

  return {
    q,
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
  type: "min" | "max",
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
  if (!filters || typeof filters !== "object") {
    return {};
  }

  const input = filters as Record<string, unknown>;
  const validated: FilterParams = {};

  // Query validation
  if (typeof input.query === "string") {
    const trimmed = input.query.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      validated.query = trimmed;
    }
  }

  // Price validation with MAX_SAFE_PRICE clamping
  if (typeof input.minPrice === "number" && Number.isFinite(input.minPrice)) {
    validated.minPrice = Math.max(0, Math.min(input.minPrice, MAX_SAFE_PRICE));
  }
  if (typeof input.maxPrice === "number" && Number.isFinite(input.maxPrice)) {
    validated.maxPrice = Math.max(0, Math.min(input.maxPrice, MAX_SAFE_PRICE));
  }

  // P1-13: Reject inverted price ranges instead of silently swapping
  // This matches the behavior in filter-schema.ts normalizeFilters() and parseSearchParams()
  if (
    validated.minPrice !== undefined &&
    validated.maxPrice !== undefined &&
    validated.minPrice > validated.maxPrice
  ) {
    throw new Error("minPrice cannot exceed maxPrice");
  }

  // Array field validation helper
  const validateArrayField = (
    field: unknown,
    allowlist: readonly string[],
  ): string[] | undefined => {
    if (!Array.isArray(field)) return undefined;
    const allowMap = new Map(
      allowlist.map((item) => [item.toLowerCase(), item]),
    );
    const validated = field
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .map((v) => allowMap.get(v.toLowerCase()))
      .filter((v): v is string => Boolean(v));
    const unique = [...new Set(validated)].slice(0, MAX_ARRAY_ITEMS);
    return unique.length > 0 ? unique : undefined;
  };

  // Amenities validation
  validated.amenities = validateArrayField(input.amenities, VALID_AMENITIES);

  // House rules validation
  validated.houseRules = validateArrayField(
    input.houseRules,
    VALID_HOUSE_RULES,
  );

  // Languages validation (uses normalizeLanguages for normalization)
  if (Array.isArray(input.languages)) {
    const langList = input.languages
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= 32);
    const normalized = normalizeLanguages(langList);
    const unique = [...new Set(normalized)].slice(0, MAX_ARRAY_ITEMS);
    if (unique.length > 0) {
      validated.languages = unique;
    }
  }

  // Enum field validation helper
  const validateEnumField = (
    field: unknown,
    allowlist: readonly string[],
  ): string | undefined => {
    if (typeof field !== "string") return undefined;
    const trimmed = field.trim();
    if (!allowlist.includes(trimmed)) return undefined;
    return trimmed === "any" ? undefined : trimmed;
  };

  // Room type validation
  validated.roomType = validateEnumField(input.roomType, VALID_ROOM_TYPES);

  // Lease duration validation
  validated.leaseDuration = validateEnumField(
    input.leaseDuration,
    VALID_LEASE_DURATIONS,
  );

  // Gender preference validation
  validated.genderPreference = validateEnumField(
    input.genderPreference,
    VALID_GENDER_PREFERENCES,
  );

  // Household gender validation
  validated.householdGender = validateEnumField(
    input.householdGender,
    VALID_HOUSEHOLD_GENDERS,
  );

  // Move-in date validation (reuse safeParseDate logic)
  if (typeof input.moveInDate === "string") {
    validated.moveInDate = safeParseDate(input.moveInDate);
  }

  // Sort validation
  if (typeof input.sort === "string") {
    const trimmed = input.sort.trim();
    if (validSortOptions.includes(trimmed as SortOption)) {
      validated.sort = trimmed as SortOption;
    }
  }

  // Bounds validation
  if (input.bounds && typeof input.bounds === "object") {
    const b = input.bounds as Record<string, unknown>;
    if (
      typeof b.minLat === "number" &&
      Number.isFinite(b.minLat) &&
      typeof b.maxLat === "number" &&
      Number.isFinite(b.maxLat) &&
      typeof b.minLng === "number" &&
      Number.isFinite(b.minLng) &&
      typeof b.maxLng === "number" &&
      Number.isFinite(b.maxLng)
    ) {
      const clampedBounds = {
        minLat: Math.max(-90, Math.min(90, b.minLat)),
        maxLat: Math.max(-90, Math.min(90, b.maxLat)),
        minLng: Math.max(-180, Math.min(180, b.minLng)),
        maxLng: Math.max(-180, Math.min(180, b.maxLng)),
      };
      // P1-3: Throw for inverted lat (consistent with price)
      if (clampedBounds.minLat > clampedBounds.maxLat) {
        throw new Error("minLat cannot exceed maxLat");
      }
      validated.bounds = clampedBounds;
    }
  }

  return validated;
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
  bounds?: unknown;
}): boolean {
  return !!params.query && !params.bounds;
}
