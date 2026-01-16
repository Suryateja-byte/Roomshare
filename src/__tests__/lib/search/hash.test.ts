/**
 * Tests for Search API v2 - Query Hash and Cursor Utilities
 *
 * Tests stable hash generation and cursor encoding for pagination.
 */

import {
  generateQueryHash,
  encodeCursor,
  decodeCursor,
  type HashableFilterParams,
} from "@/lib/search/hash";
import { BOUNDS_EPSILON } from "@/lib/search/types";

describe("search/hash", () => {
  describe("generateQueryHash", () => {
    it("should generate a 16-character hash", () => {
      const params: HashableFilterParams = {
        query: "test query",
      };
      const hash = generateQueryHash(params);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/); // hex string
    });

    it("should generate same hash for same params in different order", () => {
      const params1: HashableFilterParams = {
        query: "test",
        minPrice: 1000,
        maxPrice: 2000,
        amenities: ["wifi", "parking"],
      };

      const params2: HashableFilterParams = {
        maxPrice: 2000,
        minPrice: 1000,
        amenities: ["wifi", "parking"],
        query: "test",
      };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });

    it("should generate same hash for arrays in different order", () => {
      const params1: HashableFilterParams = {
        amenities: ["wifi", "parking", "gym"],
        houseRules: ["no_smoking", "no_pets"],
      };

      const params2: HashableFilterParams = {
        amenities: ["gym", "wifi", "parking"],
        houseRules: ["no_pets", "no_smoking"],
      };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });

    it("should be case-insensitive for query string", () => {
      const params1: HashableFilterParams = { query: "Test Query" };
      const params2: HashableFilterParams = { query: "test query" };
      const params3: HashableFilterParams = { query: "TEST QUERY" };

      const hash1 = generateQueryHash(params1);
      const hash2 = generateQueryHash(params2);
      const hash3 = generateQueryHash(params3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should be case-insensitive for roomType and leaseDuration", () => {
      const params1: HashableFilterParams = {
        roomType: "PRIVATE",
        leaseDuration: "SHORT",
      };
      const params2: HashableFilterParams = {
        roomType: "private",
        leaseDuration: "short",
      };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });

    it("should generate different hashes for different params", () => {
      const params1: HashableFilterParams = { query: "test1" };
      const params2: HashableFilterParams = { query: "test2" };

      expect(generateQueryHash(params1)).not.toBe(generateQueryHash(params2));
    });

    it("should quantize bounds with BOUNDS_EPSILON", () => {
      // Two bounds within BOUNDS_EPSILON (~100m) should hash the same
      const params1: HashableFilterParams = {
        bounds: {
          minLat: 37.7749,
          maxLat: 37.7849,
          minLng: -122.4194,
          maxLng: -122.4094,
        },
      };

      // Add small offset within epsilon
      const params2: HashableFilterParams = {
        bounds: {
          minLat: 37.7749 + BOUNDS_EPSILON * 0.4,
          maxLat: 37.7849 + BOUNDS_EPSILON * 0.4,
          minLng: -122.4194 + BOUNDS_EPSILON * 0.4,
          maxLng: -122.4094 + BOUNDS_EPSILON * 0.4,
        },
      };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });

    it("should generate different hashes for bounds beyond epsilon", () => {
      const params1: HashableFilterParams = {
        bounds: {
          minLat: 37.7749,
          maxLat: 37.7849,
          minLng: -122.4194,
          maxLng: -122.4094,
        },
      };

      // Offset beyond epsilon
      const params2: HashableFilterParams = {
        bounds: {
          minLat: 37.7749 + BOUNDS_EPSILON * 2,
          maxLat: 37.7849 + BOUNDS_EPSILON * 2,
          minLng: -122.4194 + BOUNDS_EPSILON * 2,
          maxLng: -122.4094 + BOUNDS_EPSILON * 2,
        },
      };

      expect(generateQueryHash(params1)).not.toBe(generateQueryHash(params2));
    });

    it("should handle empty params", () => {
      const params: HashableFilterParams = {};
      const hash = generateQueryHash(params);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should handle undefined values consistently", () => {
      const params1: HashableFilterParams = {};
      const params2: HashableFilterParams = {
        query: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        amenities: undefined,
      };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });

    it("should include nearMatches in hash", () => {
      const params1: HashableFilterParams = { nearMatches: true };
      const params2: HashableFilterParams = { nearMatches: false };
      const params3: HashableFilterParams = {};

      expect(generateQueryHash(params1)).not.toBe(generateQueryHash(params2));
      expect(generateQueryHash(params2)).toBe(generateQueryHash(params3)); // false == default
    });

    it("should trim whitespace from query", () => {
      const params1: HashableFilterParams = { query: "  test  " };
      const params2: HashableFilterParams = { query: "test" };

      expect(generateQueryHash(params1)).toBe(generateQueryHash(params2));
    });
  });

  describe("encodeCursor", () => {
    it("should encode page number to base64url string", () => {
      const cursor = encodeCursor(1);
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(0);
      // base64url doesn't contain +, /, or =
      expect(cursor).not.toMatch(/[+/=]/);
    });

    it("should produce different cursors for different pages", () => {
      const cursor1 = encodeCursor(1);
      const cursor2 = encodeCursor(2);
      const cursor3 = encodeCursor(10);

      expect(cursor1).not.toBe(cursor2);
      expect(cursor2).not.toBe(cursor3);
    });

    it("should produce consistent cursors for same page", () => {
      const cursor1 = encodeCursor(5);
      const cursor2 = encodeCursor(5);

      expect(cursor1).toBe(cursor2);
    });
  });

  describe("decodeCursor", () => {
    it("should decode cursor back to page number", () => {
      const page = 5;
      const cursor = encodeCursor(page);
      const decoded = decodeCursor(cursor);

      expect(decoded).toBe(page);
    });

    it("should round-trip encode/decode for various pages", () => {
      const pages = [1, 2, 5, 10, 50, 100, 1000];

      for (const page of pages) {
        const cursor = encodeCursor(page);
        const decoded = decodeCursor(cursor);
        expect(decoded).toBe(page);
      }
    });

    it("should return null for invalid cursor", () => {
      expect(decodeCursor("invalid")).toBeNull();
      expect(decodeCursor("")).toBeNull();
      expect(decodeCursor("!!!")).toBeNull();
    });

    it("should return null for malformed JSON in cursor", () => {
      // Valid base64url but not valid JSON
      const invalidJson = Buffer.from("not json").toString("base64url");
      expect(decodeCursor(invalidJson)).toBeNull();
    });

    it("should return null for cursor with non-numeric page", () => {
      // Valid JSON but page is string
      const invalidPage = Buffer.from('{"p":"5"}').toString("base64url");
      expect(decodeCursor(invalidPage)).toBeNull();
    });

    it("should return null for cursor with page <= 0", () => {
      // Page 0 is invalid (pages start at 1)
      const zeroPage = Buffer.from('{"p":0}').toString("base64url");
      expect(decodeCursor(zeroPage)).toBeNull();

      // Negative page
      const negativePage = Buffer.from('{"p":-1}').toString("base64url");
      expect(decodeCursor(negativePage)).toBeNull();
    });

    it("should return null for cursor without page property", () => {
      const noPage = Buffer.from('{"foo":"bar"}').toString("base64url");
      expect(decodeCursor(noPage)).toBeNull();
    });
  });

  describe("cursor round-trip", () => {
    it("should maintain data integrity through encode/decode cycle", () => {
      // Test a range of typical pagination values
      for (let page = 1; page <= 100; page++) {
        const encoded = encodeCursor(page);
        const decoded = decodeCursor(encoded);
        expect(decoded).toBe(page);
      }
    });
  });
});
