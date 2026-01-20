/**
 * Tests for Search API v2 - Transform Utilities
 *
 * Tests data transformation from existing shapes to v2 response format.
 */

import {
  determineMode,
  shouldIncludePins,
  transformToListItem,
  transformToListItems,
  transformToGeoJSON,
  transformToPins,
  transformToMapResponse,
} from "@/lib/search/transform";
import { CLUSTER_THRESHOLD } from "@/lib/search/types";
import type { ListingData, MapListingData } from "@/lib/data";

// Mock marker-utils to control pin limit
jest.mock("@/lib/maps/marker-utils", () => ({
  ...jest.requireActual("@/lib/maps/marker-utils"),
  getPrimaryPinLimit: jest.fn(() => 15),
}));

describe("search/transform", () => {
  describe("determineMode", () => {
    it("should return 'pins' when count is below threshold", () => {
      expect(determineMode(0)).toBe("pins");
      expect(determineMode(10)).toBe("pins");
      expect(determineMode(49)).toBe("pins");
    });

    it("should return 'geojson' when count equals threshold", () => {
      expect(determineMode(CLUSTER_THRESHOLD)).toBe("geojson");
      expect(determineMode(50)).toBe("geojson");
    });

    it("should return 'geojson' when count exceeds threshold", () => {
      expect(determineMode(51)).toBe("geojson");
      expect(determineMode(100)).toBe("geojson");
      expect(determineMode(1000)).toBe("geojson");
    });
  });

  describe("shouldIncludePins", () => {
    it("should return true when count is below threshold", () => {
      expect(shouldIncludePins(0)).toBe(true);
      expect(shouldIncludePins(10)).toBe(true);
      expect(shouldIncludePins(49)).toBe(true);
    });

    it("should return false when count equals or exceeds threshold", () => {
      expect(shouldIncludePins(CLUSTER_THRESHOLD)).toBe(false);
      expect(shouldIncludePins(50)).toBe(false);
      expect(shouldIncludePins(51)).toBe(false);
      expect(shouldIncludePins(100)).toBe(false);
    });
  });

  describe("transformToListItem", () => {
    const createListingData = (
      overrides: Partial<ListingData> = {},
    ): ListingData => ({
      id: "test-id",
      title: "Test Listing",
      description: "Test description",
      price: 1500,
      images: ["image1.jpg", "image2.jpg"],
      availableSlots: 1,
      totalSlots: 1,
      amenities: [],
      houseRules: [],
      householdLanguages: [],
      location: {
        address: "123 Test St",
        city: "San Francisco",
        state: "CA",
        zip: "94102",
        lat: 37.7749,
        lng: -122.4194,
      },
      isNearMatch: false,
      ...overrides,
    });

    it("should transform basic listing data", () => {
      const listing = createListingData();
      const item = transformToListItem(listing);

      expect(item).toEqual({
        id: "test-id",
        title: "Test Listing",
        price: 1500,
        image: "image1.jpg",
        lat: 37.7749,
        lng: -122.4194,
        badges: undefined,
      });
    });

    it("should use first image or null if no images", () => {
      const listingWithImages = createListingData({
        images: ["first.jpg", "second.jpg"],
      });
      const listingNoImages = createListingData({ images: [] });

      expect(transformToListItem(listingWithImages).image).toBe("first.jpg");
      expect(transformToListItem(listingNoImages).image).toBeNull();
    });

    it("should add near-match badge when isNearMatch is true", () => {
      const listing = createListingData({ isNearMatch: true });
      const item = transformToListItem(listing);

      expect(item.badges).toContain("near-match");
    });

    it("should add multi-room badge when totalSlots > 1", () => {
      const listing = createListingData({ totalSlots: 3 });
      const item = transformToListItem(listing);

      expect(item.badges).toContain("multi-room");
    });

    it("should add both badges when applicable", () => {
      const listing = createListingData({ isNearMatch: true, totalSlots: 2 });
      const item = transformToListItem(listing);

      expect(item.badges).toHaveLength(2);
      expect(item.badges).toContain("near-match");
      expect(item.badges).toContain("multi-room");
    });
  });

  describe("transformToListItems", () => {
    const createListingData = (
      id: string,
      title: string = "Test",
    ): ListingData => ({
      id,
      title,
      description: "Test description",
      price: 1000,
      images: ["img.jpg"],
      availableSlots: 1,
      totalSlots: 1,
      amenities: [],
      houseRules: [],
      householdLanguages: [],
      location: {
        address: "123 Test St",
        city: "San Francisco",
        state: "CA",
        zip: "94102",
        lat: 37.7749,
        lng: -122.4194,
      },
      isNearMatch: false,
    });

    it("should transform array of listings", () => {
      const listings = [
        createListingData("1", "First"),
        createListingData("2", "Second"),
        createListingData("3", "Third"),
      ];

      const items = transformToListItems(listings);

      expect(items).toHaveLength(3);
      expect(items.map((i) => i.id)).toEqual(["1", "2", "3"]);
      expect(items.map((i) => i.title)).toEqual(["First", "Second", "Third"]);
    });

    it("should return empty array for empty input", () => {
      expect(transformToListItems([])).toEqual([]);
    });
  });

  describe("transformToGeoJSON", () => {
    const createMapListingData = (
      id: string,
      lat: number,
      lng: number,
    ): MapListingData => ({
      id,
      title: `Listing ${id}`,
      price: 1000,
      images: ["img.jpg"],
      location: { lat, lng },
      availableSlots: 1,
      ownerId: "owner-1",
    });

    it("should return valid FeatureCollection", () => {
      const listings = [createMapListingData("1", 37.7749, -122.4194)];
      const geojson = transformToGeoJSON(listings);

      expect(geojson.type).toBe("FeatureCollection");
      expect(Array.isArray(geojson.features)).toBe(true);
    });

    it("should transform listings to Point features", () => {
      const listings = [
        createMapListingData("1", 37.7749, -122.4194),
        createMapListingData("2", 37.785, -122.41),
      ];

      const geojson = transformToGeoJSON(listings);

      expect(geojson.features).toHaveLength(2);
      geojson.features.forEach((feature) => {
        expect(feature.type).toBe("Feature");
        expect(feature.geometry.type).toBe("Point");
      });
    });

    it("should set coordinates as [lng, lat] (GeoJSON order)", () => {
      const listings = [createMapListingData("1", 37.7749, -122.4194)];
      const geojson = transformToGeoJSON(listings);

      const [lng, lat] = geojson.features[0].geometry.coordinates;
      expect(lng).toBe(-122.4194); // longitude first
      expect(lat).toBe(37.7749); // latitude second
    });

    it("should include correct properties in features", () => {
      const listings: MapListingData[] = [
        {
          id: "test-id",
          title: "Test Title",
          price: 1500,
          images: ["first.jpg", "second.jpg"],
          location: { lat: 37.7749, lng: -122.4194 },
          availableSlots: 1,
          ownerId: "owner",
        },
      ];

      const geojson = transformToGeoJSON(listings);
      const props = geojson.features[0].properties;

      expect(props.id).toBe("test-id");
      expect(props.title).toBe("Test Title");
      expect(props.price).toBe(1500);
      expect(props.image).toBe("first.jpg");
    });

    it("should use null for image when no images", () => {
      const listings: MapListingData[] = [
        {
          id: "1",
          title: "No Images",
          price: 1000,
          images: [],
          location: { lat: 37.7749, lng: -122.4194 },
          availableSlots: 1,
          ownerId: "owner",
        },
      ];

      const geojson = transformToGeoJSON(listings);
      expect(geojson.features[0].properties.image).toBeNull();
    });

    it("should return empty features array for empty input", () => {
      const geojson = transformToGeoJSON([]);

      expect(geojson.type).toBe("FeatureCollection");
      expect(geojson.features).toEqual([]);
    });
  });

  describe("transformToPins", () => {
    const createMapListingData = (
      id: string,
      lat: number = 37.7749,
      lng: number = -122.4194,
      price: number = 1000,
    ): MapListingData => ({
      id,
      title: `Listing ${id}`,
      price,
      images: ["img.jpg"],
      location: { lat, lng },
      availableSlots: 1,
      ownerId: "owner-1",
    });

    it("should return empty array for empty input", () => {
      expect(transformToPins([])).toEqual([]);
    });

    it("should transform listings to pins with correct properties", () => {
      const listings = [createMapListingData("1", 37.7749, -122.4194, 1500)];
      const pins = transformToPins(listings);

      expect(pins).toHaveLength(1);
      expect(pins[0]).toMatchObject({
        id: "1",
        lat: 37.7749,
        lng: -122.4194,
        price: 1500,
      });
    });

    it("should include tier property on pins", () => {
      const listings = [createMapListingData("1")];
      const pins = transformToPins(listings);

      expect(pins[0].tier).toMatch(/^(primary|mini)$/);
    });

    it("should group listings at same coordinates", () => {
      // 3 listings at exact same coordinates
      const listings = [
        createMapListingData("1", 37.7749, -122.4194),
        createMapListingData("2", 37.7749, -122.4194),
        createMapListingData("3", 37.7749, -122.4194),
      ];

      const pins = transformToPins(listings);

      // Should be grouped into 1 pin
      expect(pins).toHaveLength(1);
      expect(pins[0].stackCount).toBe(3);
    });

    it("should not set stackCount for single listing", () => {
      const listings = [createMapListingData("1")];
      const pins = transformToPins(listings);

      expect(pins[0].stackCount).toBeUndefined();
    });

    it("should create separate pins for different coordinates", () => {
      const listings = [
        createMapListingData("1", 37.7749, -122.4194),
        createMapListingData("2", 37.785, -122.41), // Different location
      ];

      const pins = transformToPins(listings);

      expect(pins).toHaveLength(2);
    });

    it("should assign primary tier to top-ranked pins", () => {
      // With getPrimaryPinLimit mocked to 15, first 15 should be primary
      const listings = Array.from({ length: 20 }, (_, i) =>
        createMapListingData(
          `${i}`,
          37.7749 + i * 0.01, // Different coordinates
          -122.4194,
        ),
      );

      const pins = transformToPins(listings);

      // First 15 should be primary, rest should be mini
      const primaryCount = pins.filter((p) => p.tier === "primary").length;
      const miniCount = pins.filter((p) => p.tier === "mini").length;

      expect(primaryCount).toBe(15);
      expect(miniCount).toBe(5);
    });
  });

  describe("transformToMapResponse", () => {
    const createMapListingData = (
      id: string,
      lat: number = 37.7749,
      lng: number = -122.4194,
    ): MapListingData => ({
      id,
      title: `Listing ${id}`,
      price: 1000,
      images: ["img.jpg"],
      location: { lat, lng },
      availableSlots: 1,
      ownerId: "owner-1",
    });

    it("should always include geojson", () => {
      const sparseListings = [createMapListingData("1")];
      const sparseResponse = transformToMapResponse(sparseListings);
      expect(sparseResponse.geojson).toBeDefined();
      expect(sparseResponse.geojson.type).toBe("FeatureCollection");

      // Even with many listings
      const manyListings = Array.from({ length: 100 }, (_, i) =>
        createMapListingData(`${i}`),
      );
      const denseResponse = transformToMapResponse(manyListings);
      expect(denseResponse.geojson).toBeDefined();
    });

    it("should include pins when sparse (<50 listings)", () => {
      const listings = Array.from({ length: 30 }, (_, i) =>
        createMapListingData(`${i}`, 37.7749 + i * 0.01, -122.4194),
      );

      const response = transformToMapResponse(listings);

      expect(response.pins).toBeDefined();
      expect(response.pins?.length).toBeGreaterThan(0);
    });

    it("should NOT include pins when dense (>=50 listings)", () => {
      const listings = Array.from({ length: 50 }, (_, i) =>
        createMapListingData(`${i}`),
      );

      const response = transformToMapResponse(listings);

      expect(response.pins).toBeUndefined();
    });

    it("should handle empty input", () => {
      const response = transformToMapResponse([]);

      expect(response.geojson.type).toBe("FeatureCollection");
      expect(response.geojson.features).toEqual([]);
      expect(response.pins).toEqual([]);
    });

    it("should include pins at threshold boundary (49 listings)", () => {
      const listings = Array.from({ length: 49 }, (_, i) =>
        createMapListingData(`${i}`, 37.7749 + i * 0.01, -122.4194),
      );

      const response = transformToMapResponse(listings);
      expect(response.pins).toBeDefined();
    });

    it("should exclude pins at threshold (50 listings)", () => {
      const listings = Array.from({ length: 50 }, (_, i) =>
        createMapListingData(`${i}`, 37.7749 + i * 0.01, -122.4194),
      );

      const response = transformToMapResponse(listings);
      expect(response.pins).toBeUndefined();
    });
  });
});
