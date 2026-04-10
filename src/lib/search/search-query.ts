import { MAX_SAFE_PAGE, MAX_SAFE_PRICE } from "@/lib/constants";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
  type RawSearchParams,
} from "@/lib/search-params";
import type { SortOption } from "@/lib/search-types";

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

export function normalizeSearchQuery(
  input: RawSearchParams | URLSearchParams
): NormalizedSearchQuery {
  const raw = toRawSearchParams(input);
  const parsed = parseSearchParams(raw);

  const rawMinPrice = parseFiniteFloat(
    getFirstValue(raw.minPrice) ?? getFirstValue(raw.minBudget),
    0,
    MAX_SAFE_PRICE
  );
  const rawMaxPrice = parseFiniteFloat(
    getFirstValue(raw.maxPrice) ?? getFirstValue(raw.maxBudget),
    0,
    MAX_SAFE_PRICE
  );

  let minPrice = rawMinPrice;
  let maxPrice = rawMaxPrice;
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

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
    minPrice,
    maxPrice,
    amenities: sortUnique(parsed.filterParams.amenities),
    moveInDate: parsed.filterParams.moveInDate,
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
  const params = new URLSearchParams();

  if (query.query) params.set("q", query.query);
  if (query.locationLabel) params.set("where", query.locationLabel);
  if (query.vibeQuery) params.set("what", query.vibeQuery);
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  query.amenities?.forEach((value) => params.append("amenities", value));
  if (query.moveInDate) params.set("moveInDate", query.moveInDate);
  if (query.leaseDuration) params.set("leaseDuration", query.leaseDuration);
  query.houseRules?.forEach((value) => params.append("houseRules", value));
  query.languages?.forEach((value) => params.append("languages", value));
  if (query.roomType) params.set("roomType", query.roomType);
  if (query.genderPreference) {
    params.set("genderPreference", query.genderPreference);
  }
  if (query.householdGender) {
    params.set("householdGender", query.householdGender);
  }
  if (query.bookingMode) params.set("bookingMode", query.bookingMode);
  if (query.minSlots !== undefined) params.set("minSlots", String(query.minSlots));
  if (query.nearMatches === true) params.set("nearMatches", "true");
  if (query.sort) params.set("sort", query.sort);

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

export function applySearchQueryChange(
  current: NormalizedSearchQuery,
  change: QueryChangeKind,
  patch: Partial<NormalizedSearchQuery>
): NormalizedSearchQuery {
  const next: NormalizedSearchQuery = normalizeSearchQuery(
    serializeSearchQuery({
      ...current,
      ...patch,
      amenities: patch.amenities ?? current.amenities,
      houseRules: patch.houseRules ?? current.houseRules,
      languages: patch.languages ?? current.languages,
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
