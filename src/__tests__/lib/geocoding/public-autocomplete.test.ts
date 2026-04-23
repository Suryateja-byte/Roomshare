const mockQueryRawUnsafe = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

jest.mock("@/lib/geocoding/public-autocomplete-telemetry", () => ({
  recordPublicAutocompleteFallbackUsed: jest.fn(),
  recordPublicAutocompletePrivacyViolation: jest.fn(),
  recordPublicAutocompleteVisibilityMismatch: jest.fn(),
}));

import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_AUTOCOMPLETE_SELECT_SQL,
  buildPublicAutocompleteLabel,
  isLikelyStreetAddressQuery,
  searchPublicAutocomplete,
  tokenizePublicAutocompleteText,
} from "@/lib/geocoding/public-autocomplete";

describe("public autocomplete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryRawUnsafe.mockResolvedValue([]);
  });

  it("prefers public area labels when they are narrower than the city", () => {
    expect(
      buildPublicAutocompleteLabel({
        city: "Austin",
        state: "TX",
        publicAreaName: "Downtown",
      })
    ).toEqual({
      placeName: "Downtown, TX",
      placeType: ["neighborhood"],
    });

    expect(
      buildPublicAutocompleteLabel({
        city: "Austin",
        state: "TX",
        publicAreaName: "Austin",
      })
    ).toEqual({
      placeName: "Austin, TX",
      placeType: ["place"],
    });
  });

  it("tokenizes labels into sanitized coarse tokens only", () => {
    expect(tokenizePublicAutocompleteText("South Loop, IL")).toEqual([
      "south",
      "loop",
      "il",
    ]);
    expect(tokenizePublicAutocompleteText("123 Main St")).toEqual([
      "main",
      "st",
    ]);
  });

  it("blocks likely street-address queries before hitting the database", async () => {
    await expect(
      searchPublicAutocomplete("123 Main St", { limit: 5 })
    ).resolves.toEqual([]);
    expect(isLikelyStreetAddressQuery("123 Main St")).toBe(true);
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("drops unsafe address-like labels returned by projection rows", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "listing-unsafe",
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        openSlots: null,
        totalSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        city: "123 Main St",
        state: "TX",
        publicAreaName: null,
        publicCellId: "30.27,-97.74",
      },
    ]);

    await expect(
      searchPublicAutocomplete("main", { limit: 5 })
    ).resolves.toEqual([]);
  });

  it("returns only public-search-eligible coarse suggestions and deduplicates by label + cell", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      {
        id: "listing-1",
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        openSlots: null,
        totalSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        city: "Austin",
        state: "TX",
        publicAreaName: "Austin",
        publicCellId: "30.27,-97.74",
      },
      {
        id: "listing-2",
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        openSlots: null,
        totalSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        city: "Austin",
        state: "TX",
        publicAreaName: "Austin",
        publicCellId: "30.27,-97.74",
      },
      {
        id: "listing-3",
        availabilitySource: "HOST_MANAGED",
        availableSlots: 0,
        openSlots: 0,
        totalSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        city: "Austin",
        state: "TX",
        publicAreaName: "East Austin",
        publicCellId: "30.28,-97.73",
      },
      {
        id: "listing-4",
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        openSlots: null,
        totalSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: true,
        city: "Austin",
        state: "TX",
        publicAreaName: null,
        publicCellId: "30.29,-97.72",
      },
    ]);

    const results = await searchPublicAutocomplete("aus tx", { limit: 5 });

    expect(results).toEqual([
      {
        id: expect.stringMatching(/^public:/),
        place_name: "Austin, TX",
        center: [-97.74, 30.27],
        place_type: ["place"],
        bbox: [-97.745, 30.265, -97.735, 30.275],
      },
    ]);
    expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
      PUBLIC_AUTOCOMPLETE_SELECT_SQL,
      "%aus%tx%",
      125
    );
  });

  it("keeps the flag-on SQL away from address, zip, and exact-coordinate fields", () => {
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.address/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.zip/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/loc\.coords/i);
    expect(PUBLIC_AUTOCOMPLETE_SELECT_SQL).not.toMatch(/exact_point/i);
  });

  it("keeps the implementation file free of raw-address selects on the public path", () => {
    const filePath = path.join(
      process.cwd(),
      "src/lib/geocoding/public-autocomplete.ts"
    );
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).not.toContain('loc.address');
    expect(source).not.toContain('loc.zip');
    expect(source).not.toContain('loc.coords');
    expect(source).not.toContain('exact_point');
  });
});
