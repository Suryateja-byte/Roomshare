import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FilterParams } from "@/lib/search-types";
import {
  buildSearchDocListWhereConditions,
  buildSearchDocWhereConditions,
  mapRawListingsToPublic,
  mapRawMapListingsToPublic,
} from "@/lib/search/search-doc-queries";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ListRaw = Parameters<typeof mapRawListingsToPublic>[0][number];
type MapRaw = Parameters<typeof mapRawMapListingsToPublic>[0][number];

type SharedRawFixture = {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  openSlots: number | null;
  availableUntil: string | null;
  minStayMonths: number;
  lastConfirmedAt: string | null;
  status: string;
  statusReason: string | null;
  needsMigrationReview: boolean;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage: string;
  leaseDuration: string;
  roomType: string;
  moveInDate: string;
  viewCount: number;
  city: string;
  state: string;
  lat: number;
  lng: number;
  avgRating: number;
  reviewCount: number;
  recommendedScore: number;
  createdAt: string;
};

function createIsoTimestamp(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * ONE_DAY_MS).toISOString();
}

function createIsoDate(daysFromNow: number): string {
  return createIsoTimestamp(daysFromNow).slice(0, 10);
}

function createSharedRawFixture(
  overrides: Partial<SharedRawFixture> = {}
): SharedRawFixture {
  return {
    id: "eligible-host-managed",
    title: "Eligible Host Managed Listing",
    description: "Quiet room in a transit-rich neighborhood.",
    price: 1800,
    images: ["primary-image.jpg", "secondary-image.jpg"],
    availableSlots: 2,
    totalSlots: 4,
    availabilitySource: "HOST_MANAGED",
    openSlots: 2,
    availableUntil: createIsoDate(120),
    minStayMonths: 3,
    lastConfirmedAt: createIsoTimestamp(-1),
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    amenities: ["WiFi", "Washer"],
    houseRules: ["No Smoking"],
    householdLanguages: ["English", "Spanish"],
    primaryHomeLanguage: "English",
    leaseDuration: "6_months",
    roomType: "private",
    moveInDate: createIsoDate(30),
    viewCount: 12,
    city: "San Francisco",
    state: "CA",
    lat: 37.7749,
    lng: -122.4194,
    avgRating: 4.8,
    reviewCount: 12,
    recommendedScore: 98.4,
    createdAt: createIsoTimestamp(-45),
    ...overrides,
  };
}

function toListRaw(fixture: SharedRawFixture): ListRaw {
  return {
    id: fixture.id,
    title: fixture.title,
    description: fixture.description,
    price: fixture.price,
    images: fixture.images,
    availableSlots: fixture.availableSlots,
    totalSlots: fixture.totalSlots,
    availabilitySource: fixture.availabilitySource,
    openSlots: fixture.openSlots,
    availableUntil: fixture.availableUntil,
    minStayMonths: fixture.minStayMonths,
    lastConfirmedAt: fixture.lastConfirmedAt,
    status: fixture.status,
    statusReason: fixture.statusReason,
    needsMigrationReview: fixture.needsMigrationReview,
    amenities: fixture.amenities,
    houseRules: fixture.houseRules,
    householdLanguages: fixture.householdLanguages,
    primaryHomeLanguage: fixture.primaryHomeLanguage,
    leaseDuration: fixture.leaseDuration,
    roomType: fixture.roomType,
    moveInDate: fixture.moveInDate,
    createdAt: fixture.createdAt,
    viewCount: fixture.viewCount,
    city: fixture.city,
    state: fixture.state,
    lat: fixture.lat,
    lng: fixture.lng,
    avgRating: fixture.avgRating,
    reviewCount: fixture.reviewCount,
  };
}

function toMapRaw(fixture: SharedRawFixture): MapRaw {
  return {
    id: fixture.id,
    title: fixture.title,
    price: fixture.price,
    availableSlots: fixture.availableSlots,
    totalSlots: fixture.totalSlots,
    availabilitySource: fixture.availabilitySource,
    openSlots: fixture.openSlots,
    availableUntil: fixture.availableUntil,
    minStayMonths: fixture.minStayMonths,
    lastConfirmedAt: fixture.lastConfirmedAt,
    status: fixture.status,
    statusReason: fixture.statusReason,
    needsMigrationReview: fixture.needsMigrationReview,
    primaryImage: fixture.images[0] ?? null,
    roomType: fixture.roomType,
    moveInDate: fixture.moveInDate,
    city: fixture.city,
    state: fixture.state,
    lat: fixture.lat,
    lng: fixture.lng,
    avgRating: fixture.avgRating,
    reviewCount: fixture.reviewCount,
    recommendedScore: fixture.recommendedScore,
    createdAt: fixture.createdAt,
  };
}

describe("CFM-406 list/map parity regression guards", () => {
  it("builder-parity-across-filter-shapes", () => {
    const filterShapes: FilterParams[] = [
      {},
      {
        bounds: {
          minLat: 37.7,
          maxLat: 37.9,
          minLng: -122.6,
          maxLng: -122.3,
        },
        minPrice: 1200,
        maxPrice: 2400,
      },
      {
        query: "sunset",
        bounds: {
          minLat: 37.65,
          maxLat: 37.95,
          minLng: -122.55,
          maxLng: -122.25,
        },
        minPrice: 900,
        maxPrice: 2600,
        amenities: ["Pool", "WiFi"],
        moveInDate: createIsoDate(21),
        endDate: createIsoDate(120),
        leaseDuration: "6_months",
        houseRules: ["No Smoking"],
        roomType: "private",
        languages: ["English", "Spanish"],
        genderPreference: "female",
        householdGender: "female",
        bookingMode: "instant",
        minAvailableSlots: 2,
      },
    ];

    for (const filterParams of filterShapes) {
      const mapResult = buildSearchDocWhereConditions(filterParams);
      const listResult = buildSearchDocListWhereConditions(filterParams);

      expect(mapResult.conditions).toEqual(listResult.conditions);
      expect(mapResult.params).toEqual(listResult.params);
      expect(mapResult.paramIndex).toBe(listResult.paramIndex);
    }
  });

  it("mapper-parity-on-eligibility-cohorts", () => {
    const sharedFixtures = [
      createSharedRawFixture({ id: "eligible-host-managed" }),
      createSharedRawFixture({
        id: "zero-open-slots",
        openSlots: 0,
      }),
      createSharedRawFixture({
        id: "stale-host-managed",
        lastConfirmedAt: createIsoTimestamp(-30),
      }),
      createSharedRawFixture({
        id: "legacy-needs-review",
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: true,
      }),
      createSharedRawFixture({
        id: "legacy-migration-review",
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: false,
        statusReason: "MIGRATION_REVIEW",
      }),
    ];

    const listIds = mapRawListingsToPublic(sharedFixtures.map(toListRaw)).map(
      (listing) => listing.id
    );
    const mapIds = mapRawMapListingsToPublic(sharedFixtures.map(toMapRaw)).map(
      (listing) => listing.id
    );

    expect(new Set(listIds)).toEqual(new Set(mapIds));
    expect(listIds).toEqual(["eligible-host-managed"]);
    expect(mapIds).toEqual(["eligible-host-managed"]);
  });

  it("no-map-only-flag", () => {
    const envSource = readFileSync(
      join(process.cwd(), "src/lib/env.ts"),
      "utf8"
    );
    const searchDocSource = readFileSync(
      join(process.cwd(), "src/lib/search/search-doc-queries.ts"),
      "utf8"
    );
    const searchV2RouteSource = readFileSync(
      join(process.cwd(), "src/app/api/search/v2/route.ts"),
      "utf8"
    );
    const combinedSource = [
      envSource,
      searchDocSource,
      searchV2RouteSource,
    ].join("\n");

    expect(combinedSource).toContain("ENABLE_SEARCH_DOC");
    expect(combinedSource).toContain("features.searchV2");
    expect(combinedSource).not.toMatch(
      /\bENABLE_MAP\b|\bMAP_SEARCH_DOC\b|\bmapSearchDoc\b|\bsearchV2Map\b/
    );
  });

  it("response-contract-overlap-lock", () => {
    const fixture = createSharedRawFixture();
    const listResult = mapRawListingsToPublic([toListRaw(fixture)])[0] as unknown as Record<
      string,
      unknown
    >;
    const mapResult = mapRawMapListingsToPublic([toMapRaw(fixture)])[0] as unknown as Record<
      string,
      unknown
    >;

    const overlappingKeys = [
      "id",
      "title",
      "price",
      "availableSlots",
      "totalSlots",
      "availabilitySource",
      "openSlots",
      "availableUntil",
      "minStayMonths",
      "lastConfirmedAt",
      "status",
      "statusReason",
      "publicAvailability",
      "location",
      "roomType",
      "moveInDate",
      "avgRating",
      "reviewCount",
    ] as const;

    for (const key of overlappingKeys) {
      expect(mapResult[key]).toEqual(listResult[key]);
    }
  });
});
