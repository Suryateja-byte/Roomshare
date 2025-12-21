/**
 * Canonical Filter Schema
 *
 * Single source of truth for filter validation using Zod.
 * Used by both URL parsing and server-side validation.
 */

import { z } from 'zod';
import { normalizeLanguages, isValidLanguageCode, LanguageCode } from './languages';

// ============================================
// Constants
// ============================================

export const MAX_SAFE_PRICE = 1_000_000_000;
export const MAX_SAFE_PAGE = 100;
export const MAX_ARRAY_ITEMS = 20;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

// ============================================
// Valid Values (Enums)
// ============================================

export const VALID_AMENITIES = [
  'Wifi',
  'AC',
  'Parking',
  'Washer',
  'Dryer',
  'Kitchen',
  'Gym',
  'Pool',
] as const;

export const VALID_HOUSE_RULES = [
  'Pets allowed',
  'Smoking allowed',
  'Couples allowed',
  'Guests allowed',
] as const;

export const VALID_LEASE_DURATIONS = [
  'any',
  'Month-to-month',
  '3 months',
  '6 months',
  '12 months',
  'Flexible',
] as const;

export const VALID_ROOM_TYPES = [
  'any',
  'Private Room',
  'Shared Room',
  'Entire Place',
] as const;

export const VALID_GENDER_PREFERENCES = [
  'any',
  'MALE_ONLY',
  'FEMALE_ONLY',
  'NO_PREFERENCE',
] as const;

export const VALID_HOUSEHOLD_GENDERS = [
  'any',
  'ALL_MALE',
  'ALL_FEMALE',
  'MIXED',
] as const;

export const VALID_SORT_OPTIONS = [
  'recommended',
  'price_asc',
  'price_desc',
  'newest',
  'rating',
] as const;

// ============================================
// Types
// ============================================

export type Amenity = (typeof VALID_AMENITIES)[number];
export type HouseRule = (typeof VALID_HOUSE_RULES)[number];
export type LeaseDuration = (typeof VALID_LEASE_DURATIONS)[number];
export type RoomType = (typeof VALID_ROOM_TYPES)[number];
export type GenderPreference = (typeof VALID_GENDER_PREFERENCES)[number];
export type HouseholdGender = (typeof VALID_HOUSEHOLD_GENDERS)[number];
export type SortOption = (typeof VALID_SORT_OPTIONS)[number];

// ============================================
// Helper Schemas
// ============================================

/**
 * Case-insensitive enum validation with canonical form return
 */
function caseInsensitiveEnum<T extends readonly string[]>(
  allowlist: T,
  options?: { treatAnyAsUndefined?: boolean }
) {
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));

  return z.string().transform((val) => {
    const trimmed = val.trim();
    if (!trimmed) return undefined;

    const canonical = allowMap.get(trimmed.toLowerCase());
    if (!canonical) return undefined;

    // 'any' means "no filter"
    if (options?.treatAnyAsUndefined && canonical === 'any') {
      return undefined;
    }

    return canonical as T[number];
  });
}

/**
 * Array field with case-insensitive validation against allowlist
 */
function caseInsensitiveArrayEnum<T extends readonly string[]>(
  allowlist: T
) {
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));

  return z.array(z.string()).transform((arr) => {
    const validated = arr
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .map((v) => allowMap.get(v.toLowerCase()))
      .filter((v): v is T[number] => Boolean(v));

    const unique = [...new Set(validated)].slice(0, MAX_ARRAY_ITEMS);
    return unique.length > 0 ? unique : undefined;
  });
}

/**
 * Price validation with clamping
 */
const priceSchema = z
  .number()
  .transform((val) => {
    if (!Number.isFinite(val)) return undefined;
    return Math.max(0, Math.min(val, MAX_SAFE_PRICE));
  })
  .optional();

/**
 * Date validation (YYYY-MM-DD format, today to 2 years in future)
 */
const dateSchema = z.string().transform((val) => {
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
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
});

/**
 * Geographic bounds schema
 */
const boundsSchema = z
  .object({
    minLat: z.number(),
    maxLat: z.number(),
    minLng: z.number(),
    maxLng: z.number(),
  })
  .transform((bounds) => {
    // Clamp values
    let minLat = Math.max(-90, Math.min(90, bounds.minLat));
    let maxLat = Math.max(-90, Math.min(90, bounds.maxLat));
    const minLng = Math.max(-180, Math.min(180, bounds.minLng));
    const maxLng = Math.max(-180, Math.min(180, bounds.maxLng));

    // Swap lat if inverted
    if (minLat > maxLat) {
      [minLat, maxLat] = [maxLat, minLat];
    }

    // Note: lng NOT swapped to support antimeridian crossing

    return { minLat, maxLat, minLng, maxLng };
  });

/**
 * Language array with normalization
 */
const languagesSchema = z.array(z.string()).transform((arr) => {
  const flattened = arr
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 32);

  const normalized = normalizeLanguages(flattened);
  const unique = [...new Set(normalized)].slice(0, MAX_ARRAY_ITEMS);

  return unique.length > 0 ? unique : undefined;
});

// ============================================
// Main Filter Schema
// ============================================

/**
 * Canonical filter schema for validated filters
 */
export const filterSchema = z.object({
  // Text search
  query: z
    .string()
    .transform((val) => {
      const trimmed = val.trim();
      if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) return undefined;
      return trimmed;
    })
    .optional(),

  // Price range
  minPrice: priceSchema,
  maxPrice: priceSchema,

  // Array filters
  amenities: caseInsensitiveArrayEnum(VALID_AMENITIES).optional(),
  houseRules: caseInsensitiveArrayEnum(VALID_HOUSE_RULES).optional(),
  languages: languagesSchema.optional(),

  // Enum filters (treat 'any' as undefined)
  roomType: caseInsensitiveEnum(VALID_ROOM_TYPES, { treatAnyAsUndefined: true }).optional(),
  leaseDuration: caseInsensitiveEnum(VALID_LEASE_DURATIONS, { treatAnyAsUndefined: true }).optional(),
  genderPreference: caseInsensitiveEnum(VALID_GENDER_PREFERENCES, { treatAnyAsUndefined: true }).optional(),
  householdGender: caseInsensitiveEnum(VALID_HOUSEHOLD_GENDERS, { treatAnyAsUndefined: true }).optional(),

  // Date filter
  moveInDate: dateSchema.optional(),

  // Geographic bounds
  bounds: boundsSchema.optional(),

  // Sort
  sort: caseInsensitiveEnum(VALID_SORT_OPTIONS).optional(),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z
    .number()
    .int()
    .transform((val) => Math.max(1, Math.min(val, MAX_SAFE_PAGE)))
    .default(1),
  limit: z
    .number()
    .int()
    .transform((val) => Math.max(1, Math.min(val, MAX_PAGE_SIZE)))
    .default(DEFAULT_PAGE_SIZE),
});

/**
 * Combined filter + pagination schema
 */
export const searchParamsSchema = filterSchema.merge(paginationSchema);

// ============================================
// Types derived from schemas
// ============================================

export type FilterParams = z.infer<typeof filterSchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;

// ============================================
// Normalized Filter Type (canonical form)
// ============================================

export interface NormalizedFilters {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: Amenity[];
  houseRules?: HouseRule[];
  languages?: LanguageCode[];
  roomType?: Exclude<RoomType, 'any'>;
  leaseDuration?: Exclude<LeaseDuration, 'any'>;
  genderPreference?: Exclude<GenderPreference, 'any'>;
  householdGender?: Exclude<HouseholdGender, 'any'>;
  moveInDate?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  sort?: SortOption;
  page: number;
  limit: number;
}

// ============================================
// Normalization Function
// ============================================

/**
 * Normalize filters to canonical form.
 *
 * - Trims strings
 * - Lowercases and validates enums (case-insensitive)
 * - Sorts arrays for determinism
 * - Deduplicates array values
 * - Removes blank/undefined values
 * - Enforces min <= max for ranges
 * - Clamps values to valid ranges
 * - Applies defaults
 *
 * @param input - Raw filter input (from URL, API, etc.)
 * @returns Normalized filters in canonical form
 */
export function normalizeFilters(input: unknown): NormalizedFilters {
  // Handle null/undefined
  if (!input || typeof input !== 'object') {
    return { page: 1, limit: DEFAULT_PAGE_SIZE };
  }

  const raw = input as Record<string, unknown>;

  // Normalize query
  let query: string | undefined;
  if (typeof raw.query === 'string') {
    const trimmed = raw.query.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_QUERY_LENGTH) {
      query = trimmed;
    }
  }

  // Normalize price range
  let minPrice = normalizePrice(raw.minPrice);
  let maxPrice = normalizePrice(raw.maxPrice);

  // Swap if inverted
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  // Normalize array filters
  const amenities = normalizeArrayEnum(raw.amenities, VALID_AMENITIES);
  const houseRules = normalizeArrayEnum(raw.houseRules, VALID_HOUSE_RULES);
  const languages = normalizeLanguageArray(raw.languages);

  // Normalize enum filters
  const roomType = normalizeEnum(raw.roomType, VALID_ROOM_TYPES);
  const leaseDuration = normalizeEnum(raw.leaseDuration, VALID_LEASE_DURATIONS);
  const genderPreference = normalizeEnum(raw.genderPreference, VALID_GENDER_PREFERENCES);
  const householdGender = normalizeEnum(raw.householdGender, VALID_HOUSEHOLD_GENDERS);

  // Normalize date
  const moveInDate = normalizeDate(raw.moveInDate);

  // Normalize bounds
  const bounds = normalizeBounds(raw.bounds);

  // Normalize sort
  const sortMap = new Map(VALID_SORT_OPTIONS.map((s) => [s.toLowerCase(), s]));
  let sort: SortOption | undefined;
  if (typeof raw.sort === 'string') {
    const normalized = sortMap.get(raw.sort.trim().toLowerCase());
    if (normalized) {
      sort = normalized;
    }
  }

  // Normalize pagination
  const page = normalizeInt(raw.page, 1, MAX_SAFE_PAGE, 1);
  const limit = normalizeInt(raw.limit, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

  // Build result, excluding undefined values
  const result: NormalizedFilters = { page, limit };

  if (query !== undefined) result.query = query;
  if (minPrice !== undefined) result.minPrice = minPrice;
  if (maxPrice !== undefined) result.maxPrice = maxPrice;
  if (amenities !== undefined) result.amenities = amenities;
  if (houseRules !== undefined) result.houseRules = houseRules;
  if (languages !== undefined) result.languages = languages;
  if (roomType !== undefined) result.roomType = roomType;
  if (leaseDuration !== undefined) result.leaseDuration = leaseDuration;
  if (genderPreference !== undefined) result.genderPreference = genderPreference;
  if (householdGender !== undefined) result.householdGender = householdGender;
  if (moveInDate !== undefined) result.moveInDate = moveInDate;
  if (bounds !== undefined) result.bounds = bounds;
  if (sort !== undefined) result.sort = sort;

  return result;
}

// ============================================
// Helper Functions
// ============================================

function normalizePrice(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.trim());
    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(0, Math.min(parsed, MAX_SAFE_PRICE));
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(value, MAX_SAFE_PRICE));
  }
  return undefined;
}

function normalizeInt(
  value: unknown,
  min: number,
  max: number,
  defaultVal: number
): number {
  if (value === undefined || value === null) return defaultVal;

  let parsed: number;
  if (typeof value === 'string') {
    parsed = parseInt(value.trim(), 10);
  } else if (typeof value === 'number') {
    parsed = Math.floor(value);
  } else {
    return defaultVal;
  }

  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.max(min, Math.min(parsed, max));
}

function normalizeArrayEnum<T extends readonly string[]>(
  value: unknown,
  allowlist: T
): T[number][] | undefined {
  if (value === undefined || value === null) return undefined;

  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  let items: string[];

  if (typeof value === 'string') {
    items = value.split(',');
  } else if (Array.isArray(value)) {
    items = value.flatMap((v) => (typeof v === 'string' ? v.split(',') : []));
  } else {
    return undefined;
  }

  const validated = items
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .map((v) => allowMap.get(v.toLowerCase()))
    .filter((v): v is T[number] => Boolean(v));

  // Sort for determinism
  const unique = [...new Set(validated)].sort().slice(0, MAX_ARRAY_ITEMS);
  return unique.length > 0 ? unique : undefined;
}

function normalizeLanguageArray(value: unknown): LanguageCode[] | undefined {
  if (value === undefined || value === null) return undefined;

  let items: string[];
  if (typeof value === 'string') {
    items = value.split(',');
  } else if (Array.isArray(value)) {
    items = value.flatMap((v) => (typeof v === 'string' ? v.split(',') : []));
  } else {
    return undefined;
  }

  const trimmed = items
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0 && v.length <= 32);

  const normalized = normalizeLanguages(trimmed);
  // Sort for determinism
  const unique = [...new Set(normalized)].sort().slice(0, MAX_ARRAY_ITEMS);

  return unique.length > 0 ? unique : undefined;
}

function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  allowlist: T
): Exclude<T[number], 'any'> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  const canonical = allowMap.get(trimmed.toLowerCase());

  if (!canonical || canonical === 'any') return undefined;
  return canonical as Exclude<T[number], 'any'>;
}

function normalizeDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
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
}

function normalizeBounds(
  value: unknown
): NormalizedFilters['bounds'] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return undefined;

  const b = value as Record<string, unknown>;

  const minLatRaw = typeof b.minLat === 'number' ? b.minLat : undefined;
  const maxLatRaw = typeof b.maxLat === 'number' ? b.maxLat : undefined;
  const minLngRaw = typeof b.minLng === 'number' ? b.minLng : undefined;
  const maxLngRaw = typeof b.maxLng === 'number' ? b.maxLng : undefined;

  if (
    minLatRaw === undefined ||
    maxLatRaw === undefined ||
    minLngRaw === undefined ||
    maxLngRaw === undefined
  ) {
    return undefined;
  }

  if (
    !Number.isFinite(minLatRaw) ||
    !Number.isFinite(maxLatRaw) ||
    !Number.isFinite(minLngRaw) ||
    !Number.isFinite(maxLngRaw)
  ) {
    return undefined;
  }

  // Clamp values
  let minLat = Math.max(-90, Math.min(90, minLatRaw));
  let maxLat = Math.max(-90, Math.min(90, maxLatRaw));
  const minLng = Math.max(-180, Math.min(180, minLngRaw));
  const maxLng = Math.max(-180, Math.min(180, maxLngRaw));

  // Swap lat if inverted
  if (minLat > maxLat) {
    [minLat, maxLat] = [maxLat, minLat];
  }

  // Note: lng NOT swapped to support antimeridian crossing

  return { minLat, maxLat, minLng, maxLng };
}

// ============================================
// Validation for API responses
// ============================================

/**
 * Validate filters strictly (for API endpoints).
 * Returns validation result with errors.
 */
export function validateFilters(
  input: unknown
): { success: true; data: NormalizedFilters } | { success: false; errors: string[] } {
  try {
    const normalized = normalizeFilters(input);
    return { success: true, data: normalized };
  } catch {
    return { success: false, errors: ['Invalid filter input'] };
  }
}

/**
 * Check if normalized filters are empty (no active filters)
 */
export function isEmptyFilters(filters: NormalizedFilters): boolean {
  return (
    filters.query === undefined &&
    filters.minPrice === undefined &&
    filters.maxPrice === undefined &&
    filters.amenities === undefined &&
    filters.houseRules === undefined &&
    filters.languages === undefined &&
    filters.roomType === undefined &&
    filters.leaseDuration === undefined &&
    filters.genderPreference === undefined &&
    filters.householdGender === undefined &&
    filters.moveInDate === undefined &&
    filters.bounds === undefined
  );
}

/**
 * Convert normalized filters to URL search params
 */
export function filtersToSearchParams(filters: NormalizedFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query) params.set('q', filters.query);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.amenities?.length) params.set('amenities', filters.amenities.join(','));
  if (filters.houseRules?.length) params.set('houseRules', filters.houseRules.join(','));
  if (filters.languages?.length) params.set('languages', filters.languages.join(','));
  if (filters.roomType) params.set('roomType', filters.roomType);
  if (filters.leaseDuration) params.set('leaseDuration', filters.leaseDuration);
  if (filters.genderPreference) params.set('genderPreference', filters.genderPreference);
  if (filters.householdGender) params.set('householdGender', filters.householdGender);
  if (filters.moveInDate) params.set('moveInDate', filters.moveInDate);
  if (filters.bounds) {
    params.set('minLat', String(filters.bounds.minLat));
    params.set('maxLat', String(filters.bounds.maxLat));
    params.set('minLng', String(filters.bounds.minLng));
    params.set('maxLng', String(filters.bounds.maxLng));
  }
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.limit !== DEFAULT_PAGE_SIZE) params.set('limit', String(filters.limit));

  return params;
}
