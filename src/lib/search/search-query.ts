import { MAX_SAFE_PAGE } from "@/lib/constants";
import {
  buildRawParamsFromSearchParams,
  normalizeSearchFilters,
  parseSearchParams,
  type RawSearchParams,
} from "@/lib/search-params";
import type { FilterParams, SortOption } from "@/lib/search-types";

export type QueryChangeKind =
  | "location"
  | "filter"
  | "sort"
  | "pagination"
  | "map-pan"
  | "saved-search-reopen";

export interface NormalizedSearchQuery {
  query?: string;
  locationLabel?: string;
  vibeQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  endDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  languages?: string[];
  roomType?: string;
  genderPreference?: string;
  householdGender?: string;
  bookingMode?: string;
  minSlots?: number;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  lat?: number;
  lng?: number;
  sort?: SortOption;
  nearMatches?: boolean;
  page?: number;
  cursor?: string;
}

interface SerializeOptions {
  includePagination?: boolean;
}

const BOUNDS_PRECISION = 3;

function getFirstValue(
  value:
    | string
    | string[]
    | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function toRawSearchParams(
  input: RawSearchParams | URLSearchParams
): RawSearchParams {
  if (input instanceof URLSearchParams) {
    return buildRawParamsFromSearchParams(input) as RawSearchParams;
  }
  return input;
}

function parseFiniteFloat(
  value: string | undefined,
  min?: number,
  max?: number
): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) return undefined;
  let next = parsed;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, MAX_SAFE_PAGE);
}

function sortUnique(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function quantizeBound(value: number): number {
  return Number((Math.round(value * 10 ** BOUNDS_PRECISION) / 10 ** BOUNDS_PRECISION).toFixed(BOUNDS_PRECISION));
}

function normalizeBounds(
  bounds?: NormalizedSearchQuery["bounds"]
): NormalizedSearchQuery["bounds"] {
  if (!bounds) return undefined;
  return {
    minLat: quantizeBound(bounds.minLat),
    maxLat: quantizeBound(bounds.maxLat),
    minLng: quantizeBound(bounds.minLng),
    maxLng: quantizeBound(bounds.maxLng),
  };
}

function getNormalizedQueryFilters(
  query: NormalizedSearchQuery
): FilterParams {
  const { availabilityIntent: _availabilityIntent, ...filters } =
    normalizeSearchFilters(
      {
        query: query.query,
        locationLabel: query.locationLabel,
        vibeQuery: query.vibeQuery,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        amenities: query.amenities,
        moveInDate: query.moveInDate,
        endDate: query.endDate,
        leaseDuration: query.leaseDuration,
        houseRules: query.houseRules,
        languages: query.languages,
        roomType: query.roomType,
        genderPreference: query.genderPreference,
        householdGender: query.householdGender,
        bookingMode: query.bookingMode,
        bounds: query.bounds,
        minAvailableSlots: query.minSlots,
        nearMatches: query.nearMatches,
        sort: query.sort,
      },
      {
        invalidRange: "drop",
      }
    );

  return filters;
}

export function normalizeSearchQuery(
  input: RawSearchParams | URLSearchParams
): NormalizedSearchQuery {
  const raw = toRawSearchParams(input);
  const parsed = parseSearchParams(raw);

  const lat = parseFiniteFloat(getFirstValue(raw.lat), -90, 90);
  const lng = parseFiniteFloat(getFirstValue(raw.lng), -180, 180);
  const hasPointCoords = lat !== undefined && lng !== undefined;

  const cursor = getFirstValue(raw.cursor)?.trim() || undefined;
  const page =
    cursor === undefined
      ? parsePositiveInt(
          getFirstValue(raw.page) ?? getFirstValue(raw.pageNumber)
        )
      : undefined;

  return {
    query: parsed.q,
    locationLabel: parsed.locationLabel,
    vibeQuery: parsed.what,
    minPrice: parsed.filterParams.minPrice,
    maxPrice: parsed.filterParams.maxPrice,
    amenities: sortUnique(parsed.filterParams.amenities),
    moveInDate: parsed.filterParams.moveInDate,
    endDate: parsed.filterParams.endDate,
    leaseDuration: parsed.filterParams.leaseDuration,
    houseRules: sortUnique(parsed.filterParams.houseRules),
    languages: sortUnique(parsed.filterParams.languages),
    roomType: parsed.filterParams.roomType,
    genderPreference: parsed.filterParams.genderPreference,
    householdGender: parsed.filterParams.householdGender,
    bookingMode: parsed.filterParams.bookingMode,
    minSlots: parsed.filterParams.minAvailableSlots,
    bounds: normalizeBounds(parsed.filterParams.bounds),
    lat: hasPointCoords ? lat : undefined,
    lng: hasPointCoords ? lng : undefined,
    sort:
      parsed.sortOption && parsed.sortOption !== "recommended"
        ? parsed.sortOption
        : undefined,
    nearMatches: parsed.filterParams.nearMatches === true ? true : undefined,
    page: page && page > 1 ? page : undefined,
    cursor,
  };
}

export function serializeSearchQuery(
  query: NormalizedSearchQuery,
  options: SerializeOptions = {}
): URLSearchParams {
  const { includePagination = true } = options;
  const normalizedFilters = getNormalizedQueryFilters(query);
  const params = new URLSearchParams();

  if (normalizedFilters.query) params.set("q", normalizedFilters.query);
  if (normalizedFilters.locationLabel) {
    params.set("where", normalizedFilters.locationLabel);
  }
  if (normalizedFilters.vibeQuery) params.set("what", normalizedFilters.vibeQuery);
  if (normalizedFilters.minPrice !== undefined) {
    params.set("minPrice", String(normalizedFilters.minPrice));
  }
  if (normalizedFilters.maxPrice !== undefined) {
    params.set("maxPrice", String(normalizedFilters.maxPrice));
  }
  sortUnique(normalizedFilters.amenities)?.forEach((value) =>
    params.append("amenities", value)
  );
  if (normalizedFilters.moveInDate) {
    params.set("moveInDate", normalizedFilters.moveInDate);
  }
  if (normalizedFilters.endDate) params.set("endDate", normalizedFilters.endDate);
  if (normalizedFilters.leaseDuration) {
    params.set("leaseDuration", normalizedFilters.leaseDuration);
  }
  sortUnique(normalizedFilters.houseRules)?.forEach((value) =>
    params.append("houseRules", value)
  );
  sortUnique(normalizedFilters.languages)?.forEach((value) =>
    params.append("languages", value)
  );
  if (normalizedFilters.roomType) params.set("roomType", normalizedFilters.roomType);
  if (normalizedFilters.genderPreference) {
    params.set("genderPreference", normalizedFilters.genderPreference);
  }
  if (normalizedFilters.householdGender) {
    params.set("householdGender", normalizedFilters.householdGender);
  }
  if (normalizedFilters.bookingMode) {
    params.set("bookingMode", normalizedFilters.bookingMode);
  }
  if (normalizedFilters.minAvailableSlots !== undefined) {
    params.set("minSlots", String(normalizedFilters.minAvailableSlots));
  }
  if (normalizedFilters.nearMatches === true) params.set("nearMatches", "true");
  if (normalizedFilters.sort && normalizedFilters.sort !== "recommended") {
    params.set("sort", normalizedFilters.sort);
  }

  if (query.lat !== undefined && query.lng !== undefined) {
    params.set("lat", String(query.lat));
    params.set("lng", String(query.lng));
  }

  const bounds = normalizeBounds(query.bounds);
  if (bounds) {
    params.set("minLat", bounds.minLat.toFixed(BOUNDS_PRECISION));
    params.set("maxLat", bounds.maxLat.toFixed(BOUNDS_PRECISION));
    params.set("minLng", bounds.minLng.toFixed(BOUNDS_PRECISION));
    params.set("maxLng", bounds.maxLng.toFixed(BOUNDS_PRECISION));
  }

  if (includePagination) {
    if (query.cursor) {
      params.set("cursor", query.cursor);
    } else if (query.page && query.page > 1) {
      params.set("page", String(query.page));
    }
  }

  params.sort();
  return params;
}

export function buildCanonicalSearchUrl(
  query: NormalizedSearchQuery,
  options?: SerializeOptions
): string {
  const params = serializeSearchQuery(query, options);
  const queryString = params.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

/**
 * Build the SEO `<link rel="canonical">` URL for the search page.
 *
 * Strips *all* filter params (minPrice, maxPrice, amenities, roomType,
 * genderPreference, bounds, sort, pagination, etc.) and keeps only the
 * `q` location narrowing term. This collapses every filter and pagination
 * combination into the same canonical page so search engines don't index
 * thousands of near-duplicate variants.
 *
 * Distinct from `buildCanonicalSearchUrl`, which is a misnomer — that
 * function is actually used by 14+ client-side callers (form submits,
 * map updates, sort changes, filter batching, etc.) that all require
 * filter params to be preserved. Renaming it is out-of-scope for this
 * fix; this function exists to serve the single SEO caller without
 * regressing anyone else.
 *
 * Covered by `tests/e2e/seo/search-seo-meta.anon.spec.ts:166` (SEO-04).
 */
export function buildSeoCanonicalSearchUrl(
  query: NormalizedSearchQuery
): string {
  const params = new URLSearchParams();
  if (query.query) params.set("q", query.query);
  const queryString = params.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

export function applySearchQueryChange(
  current: NormalizedSearchQuery,
  change: QueryChangeKind,
  patch: Partial<NormalizedSearchQuery>
): NormalizedSearchQuery {
  const hasPatchKey = <K extends keyof NormalizedSearchQuery>(key: K) =>
    Object.prototype.hasOwnProperty.call(patch, key);

  const next: NormalizedSearchQuery = normalizeSearchQuery(
    serializeSearchQuery({
      ...current,
      ...patch,
      amenities: hasPatchKey("amenities") ? patch.amenities : current.amenities,
      houseRules: hasPatchKey("houseRules")
        ? patch.houseRules
        : current.houseRules,
      languages: hasPatchKey("languages") ? patch.languages : current.languages,
    })
  );

  if (
    change === "location" ||
    change === "filter" ||
    change === "sort" ||
    change === "map-pan" ||
    change === "saved-search-reopen"
  ) {
    next.page = undefined;
    next.cursor = undefined;
  }

  if (change === "filter") {
    next.bounds = patch.bounds ?? current.bounds;
    next.lat = patch.lat ?? current.lat;
    next.lng = patch.lng ?? current.lng;
  }

  if (change === "sort") {
    next.bounds = current.bounds;
    next.lat = current.lat;
    next.lng = current.lng;
  }

  if (change === "location") {
    next.page = undefined;
    next.cursor = undefined;
  }

  if (change === "map-pan") {
    next.lat = undefined;
    next.lng = undefined;
  }

  if (change === "saved-search-reopen") {
    next.page = undefined;
    next.cursor = undefined;
  }

  return next;
}

export function normalizedSearchQueryToFilterParams(
  query: NormalizedSearchQuery
): FilterParams {
  return getNormalizedQueryFilters(query);
}
