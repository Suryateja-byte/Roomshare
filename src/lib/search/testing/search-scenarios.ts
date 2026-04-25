import type { ListingData, MapListingData } from "@/lib/search-types";
import type { NormalizedSearchQuery } from "@/lib/search/search-query";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import {
  createSearchResponseMeta,
  type SearchListPayload,
  type SearchListState,
  type SearchMapState,
  type SearchResponseMeta,
} from "@/lib/search/search-response";

export const SEARCH_SCENARIO_HEADER = "x-e2e-search-scenario";

const SEARCH_SCENARIOS = [
  "default-results",
  "zero-results",
  "near-match",
  "rate-limited",
  "v2-fails-v1-succeeds",
  "load-more-error",
  "map-empty",
  "slow-first-fast-second",
] as const;

const SCENARIO_PAGE_SIZE = 3;
const DEFAULT_LAT = 30.2672;
const DEFAULT_LNG = -97.7431;
const DEFAULT_LOCATION = "Austin, TX";
const RESPONSE_DELAY_MS = {
  slow: 900,
  fast: 50,
} as const;

export type SearchScenario = (typeof SEARCH_SCENARIOS)[number];

export interface SearchScenarioLoadMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
  meta: SearchResponseMeta;
  degraded?: boolean;
  rateLimited?: boolean;
}

interface ResolveSearchScenarioInput {
  headerValue?: string | null;
  override?: string | null;
}

interface ScenarioContext {
  query: NormalizedSearchQuery;
  cursor?: string | null;
  queryHashOverride?: string | null;
}

interface ScenarioListData {
  items: ListingData[];
  nextCursor: string | null;
  total: number;
  nearMatchExpansion?: string;
  vibeAdvisory?: string;
}

function isSearchScenario(value: string): value is SearchScenario {
  return (SEARCH_SCENARIOS as readonly string[]).includes(value);
}

function isSearchScenarioEnabled(): boolean {
  return process.env.ENABLE_SEARCH_TEST_SCENARIOS === "true";
}

function withOptionalQueryHash(
  meta: SearchResponseMeta,
  queryHashOverride?: string | null
): SearchResponseMeta {
  if (!queryHashOverride || queryHashOverride.trim().length === 0) {
    return meta;
  }

  return {
    ...meta,
    queryHash: queryHashOverride.trim(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAnchor(query: NormalizedSearchQuery): { lat: number; lng: number } {
  if (query.lat !== undefined && query.lng !== undefined) {
    return { lat: query.lat, lng: query.lng };
  }

  if (query.bounds) {
    return {
      lat: (query.bounds.minLat + query.bounds.maxLat) / 2,
      lng: (query.bounds.minLng + query.bounds.maxLng) / 2,
    };
  }

  return { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
}

function getLocationLabel(query: NormalizedSearchQuery): string {
  return query.locationLabel || query.query || DEFAULT_LOCATION;
}

function createListing(
  query: NormalizedSearchQuery,
  suffix: string,
  price: number,
  latOffset: number,
  lngOffset: number,
  overrides: Partial<ListingData> = {}
): ListingData {
  const anchor = getAnchor(query);
  const locationLabel = getLocationLabel(query);

  return {
    id: `scenario-${suffix}`,
    title: `${locationLabel} Room ${suffix.toUpperCase()}`,
    description: `Deterministic scenario listing ${suffix} for ${locationLabel}.`,
    price,
    images: ["/images/team/surya.webp"],
    availableSlots: overrides.availableSlots ?? 1,
    totalSlots: overrides.totalSlots ?? 2,
    amenities: overrides.amenities ?? ["Wifi", "Laundry"],
    houseRules: overrides.houseRules ?? ["No Smoking"],
    householdLanguages:
      overrides.householdLanguages ?? ["English", "Spanish"],
    primaryHomeLanguage: overrides.primaryHomeLanguage ?? "English",
    genderPreference: overrides.genderPreference,
    householdGender: overrides.householdGender,
    leaseDuration: overrides.leaseDuration ?? "6 months",
    roomType: overrides.roomType ?? "Private Room",
    moveInDate:
      overrides.moveInDate ?? new Date("2026-06-01T00:00:00.000Z"),
    ownerId: overrides.ownerId ?? "scenario-owner",
    location: {
      address: `${suffix.toUpperCase()} Example St`,
      city: locationLabel.split(",")[0] || "Austin",
      state: locationLabel.split(",")[1]?.trim() || "TX",
      zip: "78701",
      lat: Number((anchor.lat + latOffset).toFixed(5)),
      lng: Number((anchor.lng + lngOffset).toFixed(5)),
    },
    publicAvailability:
      overrides.publicAvailability ??
      buildPublicAvailability({
        availableSlots: overrides.availableSlots ?? 1,
        totalSlots: overrides.totalSlots ?? 2,
        moveInDate:
          overrides.moveInDate ?? new Date("2026-06-01T00:00:00.000Z"),
      }),
    isNearMatch: overrides.isNearMatch,
  };
}

function buildBaseListings(query: NormalizedSearchQuery): ListingData[] {
  return [
    createListing(query, "a", 900, 0.012, -0.015, {
      amenities: ["Wifi", "Parking"],
      roomType: "Private Room",
    }),
    createListing(query, "b", 1100, 0.006, 0.009, {
      amenities: ["Wifi"],
      roomType: "Private Room",
    }),
    createListing(query, "c", 1300, -0.004, -0.011, {
      amenities: ["Laundry", "Gym"],
      roomType: "Private Room",
    }),
    createListing(query, "d", 1500, -0.009, 0.013, {
      amenities: ["Parking"],
      roomType: "Shared Room",
      availableSlots: 2,
      totalSlots: 3,
    }),
    createListing(query, "e", 1700, 0.015, 0.017, {
      amenities: ["Wifi", "Gym"],
      roomType: "Entire Place",
    }),
    createListing(query, "f", 1900, -0.015, -0.018, {
      amenities: ["Laundry", "Parking"],
      roomType: "Private Room",
    }),
  ];
}

function applyScenarioFilters(
  listings: ListingData[],
  query: NormalizedSearchQuery
): ListingData[] {
  return listings.filter((listing) => {
    if (query.minPrice !== undefined && listing.price < query.minPrice) {
      return false;
    }
    if (query.maxPrice !== undefined && listing.price > query.maxPrice) {
      return false;
    }
    if (
      query.roomType &&
      listing.roomType?.toLowerCase() !== query.roomType.toLowerCase()
    ) {
      return false;
    }
    if (
      query.amenities &&
      query.amenities.length > 0 &&
      !query.amenities.every((amenity) =>
        listing.amenities.some(
          (listingAmenity) =>
            listingAmenity.toLowerCase() === amenity.toLowerCase()
        )
      )
    ) {
      return false;
    }
    return true;
  });
}

function sortScenarioListings(
  listings: ListingData[],
  query: NormalizedSearchQuery
): ListingData[] {
  const next = [...listings];

  switch (query.sort) {
    case "price_asc":
      next.sort((left, right) => left.price - right.price);
      return next;
    case "price_desc":
      next.sort((left, right) => right.price - left.price);
      return next;
    case "newest":
      return next.reverse();
    default:
      return [next[2], next[0], next[4], next[1], next[5], next[3]].filter(
        Boolean
      ) as ListingData[];
  }
}

function createScenarioCursor(page: number): string {
  return `scenario-page-${page}`;
}

function parseScenarioCursor(cursor?: string | null): number {
  if (!cursor) return 1;
  const match = cursor.match(/^scenario-page-(\d+)$/);
  const page = match ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function paginateScenarioListings(
  listings: ListingData[],
  cursor?: string | null
): ScenarioListData {
  const currentPage = parseScenarioCursor(cursor);
  const startIndex = (currentPage - 1) * SCENARIO_PAGE_SIZE;
  const items = listings.slice(startIndex, startIndex + SCENARIO_PAGE_SIZE);
  const nextCursor =
    startIndex + SCENARIO_PAGE_SIZE < listings.length
      ? createScenarioCursor(currentPage + 1)
      : null;

  return {
    items,
    nextCursor,
    total: listings.length,
  };
}

function buildDefaultScenarioData(
  query: NormalizedSearchQuery,
  cursor?: string | null
): ScenarioListData {
  const filtered = applyScenarioFilters(buildBaseListings(query), query);
  const sorted = sortScenarioListings(filtered, query);
  return paginateScenarioListings(sorted, cursor);
}

function buildSlowScenarioData(
  query: NormalizedSearchQuery
): ScenarioListData {
  const maxPrice = query.maxPrice ?? 0;
  const isSlow = maxPrice > 0 && maxPrice <= 1200;
  const title = isSlow ? "Slow result" : "Fast result";
  const item = createListing(
    query,
    isSlow ? "slow" : "fast",
    isSlow ? 1200 : 1500,
    0.004,
    0.004,
    { title }
  );

  return {
    items: [item],
    nextCursor: null,
    total: 1,
  };
}

function toMapListings(listings: ListingData[]): MapListingData[] {
  return listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    price: listing.price,
    availableSlots: listing.availableSlots,
    totalSlots: listing.totalSlots,
    images: listing.images.slice(0, 1),
    moveInDate: listing.moveInDate,
    location: {
      lat: listing.location.lat,
      lng: listing.location.lng,
    },
    publicAvailability: listing.publicAvailability,
  }));
}

async function applyScenarioDelay(
  scenario: SearchScenario,
  query: NormalizedSearchQuery
): Promise<void> {
  if (scenario !== "slow-first-fast-second") {
    return;
  }

  const maxPrice = query.maxPrice ?? 0;
  const delayMs =
    maxPrice > 0 && maxPrice <= 1200
      ? RESPONSE_DELAY_MS.slow
      : RESPONSE_DELAY_MS.fast;
  await sleep(delayMs);
}

export function resolveSearchScenario({
  headerValue,
  override,
}: ResolveSearchScenarioInput): SearchScenario | null {
  if (!isSearchScenarioEnabled()) {
    return null;
  }

  const candidate = (override ?? headerValue ?? "").trim();
  return candidate && isSearchScenario(candidate) ? candidate : null;
}

export async function buildScenarioSearchListState(
  scenario: SearchScenario,
  context: ScenarioContext
): Promise<SearchListState> {
  const { query, cursor, queryHashOverride } = context;
  const buildMeta = (source: "v2" | "v1-fallback") =>
    withOptionalQueryHash(
      createSearchResponseMeta(query, source),
      queryHashOverride
    );

  await applyScenarioDelay(scenario, query);

  if (scenario === "rate-limited") {
    return {
      kind: "rate-limited",
      retryAfter: 30,
      meta: buildMeta("v2"),
    };
  }

  if (scenario === "zero-results") {
    return {
      kind: "zero-results",
      meta: buildMeta("v2"),
    };
  }

  if (scenario === "near-match") {
    return {
      kind: "zero-results",
      suggestions: [
        {
          label: "Include near matches",
          type: "near-match",
        },
      ],
      meta: buildMeta("v2"),
    };
  }

  if (scenario === "v2-fails-v1-succeeds") {
    return {
      kind: "degraded",
      source: "v1-fallback",
      data: buildDefaultScenarioData(query, cursor),
      meta: buildMeta("v1-fallback"),
    };
  }

  if (scenario === "slow-first-fast-second") {
    return {
      kind: "ok",
      data: buildSlowScenarioData(query),
      meta: buildMeta("v2"),
    };
  }

  return {
    kind: "ok",
    data: buildDefaultScenarioData(query, cursor),
    meta: buildMeta("v2"),
  };
}

export async function buildScenarioSearchMapState(
  scenario: SearchScenario,
  context: ScenarioContext
): Promise<SearchMapState> {
  const { query, queryHashOverride } = context;
  const meta = withOptionalQueryHash(
    createSearchResponseMeta(query, "map-api"),
    queryHashOverride
  );

  await applyScenarioDelay(scenario, query);

  if (scenario === "rate-limited") {
    return {
      kind: "rate-limited",
      retryAfter: 30,
      meta,
    };
  }

  if (scenario === "zero-results" || scenario === "map-empty") {
    return {
      kind: "zero-results",
      meta,
    };
  }

  if (scenario === "slow-first-fast-second") {
    return {
      kind: "ok",
      data: { listings: toMapListings(buildSlowScenarioData(query).items) },
      meta,
    };
  }

  if (scenario === "near-match") {
    return {
      kind: "zero-results",
      meta,
    };
  }

  const listData = buildDefaultScenarioData(query);

  return {
    kind: "ok",
    data: { listings: toMapListings(listData.items) },
    meta,
  };
}

export async function buildScenarioLoadMoreResult(
  scenario: SearchScenario,
  context: ScenarioContext
): Promise<SearchScenarioLoadMoreResult> {
  const { query, cursor, queryHashOverride } = context;
  const buildMeta = (source: "v2" | "v1-fallback") =>
    withOptionalQueryHash(
      createSearchResponseMeta(query, source),
      queryHashOverride
    );

  await applyScenarioDelay(scenario, query);

  if (scenario === "rate-limited") {
    return {
      items: [],
      nextCursor: null,
      hasNextPage: false,
      rateLimited: true,
      meta: buildMeta("v2"),
    };
  }

  if (scenario === "load-more-error") {
    return {
      items: [],
      nextCursor: cursor ?? null,
      hasNextPage: true,
      degraded: true,
      meta: buildMeta("v2"),
    };
  }

  if (scenario === "v2-fails-v1-succeeds") {
    return {
      items: [],
      nextCursor: null,
      hasNextPage: false,
      degraded: true,
      meta: buildMeta("v1-fallback"),
    };
  }

  const data =
    scenario === "slow-first-fast-second"
      ? buildSlowScenarioData(query)
      : buildDefaultScenarioData(query, cursor);

  return {
    items: data.items,
    nextCursor: data.nextCursor,
    hasNextPage: data.nextCursor !== null,
    meta: buildMeta("v2"),
  };
}

export function getScenarioResponseMeta(
  scenario: SearchScenario,
  query: NormalizedSearchQuery,
  queryHashOverride?: string | null
): SearchResponseMeta {
  const source = scenario === "v2-fails-v1-succeeds" ? "v1-fallback" : "v2";
  return withOptionalQueryHash(
    createSearchResponseMeta(query, source),
    queryHashOverride
  );
}

export function getScenarioHeaderValue(
  scenario: SearchScenario | null | undefined
): Record<string, string> {
  if (!scenario) {
    return {};
  }

  return {
    [SEARCH_SCENARIO_HEADER]: scenario,
  };
}
