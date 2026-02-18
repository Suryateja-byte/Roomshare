/**
 * Tests for Search API v2 - Keyset Cursor Utilities
 *
 * Tests keyset cursor encoding, decoding, and cursor building for stable pagination.
 */

import {
  encodeKeysetCursor,
  decodeKeysetCursor,
  buildCursorFromRow,
  decodeCursorAny,
  decodeLegacyCursor,
  SORT_OPTIONS,
  type KeysetCursor,
  type CursorRowData,
} from "@/lib/search/cursor";

describe("search/cursor", () => {
  const originalCursorSecret = process.env.CURSOR_SECRET;

  afterEach(() => {
    if (originalCursorSecret === undefined) {
      delete process.env.CURSOR_SECRET;
    } else {
      process.env.CURSOR_SECRET = originalCursorSecret;
    }
    jest.resetModules();
  });

  describe("encodeKeysetCursor / decodeKeysetCursor roundtrip", () => {
    it("should encode and decode recommended cursor", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "recommended",
        k: ["85.50", "2024-01-15T10:00:00.000Z"],
        id: "clx123abc",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should encode and decode newest cursor", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clx456def",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should encode and decode price_asc cursor", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "price_asc",
        k: ["1500.00", "2024-01-15T10:00:00.000Z"],
        id: "clx789ghi",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should encode and decode price_desc cursor", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "price_desc",
        k: ["2500.00", "2024-01-15T10:00:00.000Z"],
        id: "clxabcxyz",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should encode and decode rating cursor", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "rating",
        k: ["4.50", "10", "2024-01-15T10:00:00.000Z"],
        id: "clxqrstuv",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should handle null values in keys", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "recommended",
        k: [null, "2024-01-15T10:00:00.000Z"],
        id: "clxnulltest",
      };

      const encoded = encodeKeysetCursor(cursor);
      const decoded = decodeKeysetCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it("should produce base64url encoded string", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxbase64",
      };

      const encoded = encodeKeysetCursor(cursor);

      // base64url doesn't contain +, /, or padding =
      expect(encoded).not.toMatch(/[+/=]/);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe("decodeKeysetCursor validation", () => {
    it("should return null for invalid base64", () => {
      expect(decodeKeysetCursor("!!!invalid!!!")).toBeNull();
      expect(decodeKeysetCursor("")).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      const invalidJson = Buffer.from("not json").toString("base64url");
      expect(decodeKeysetCursor(invalidJson)).toBeNull();
    });

    it("should return null for wrong version", () => {
      const wrongVersion = Buffer.from(
        JSON.stringify({
          v: 2, // Wrong version
          s: "newest",
          k: ["2024-01-15T10:00:00.000Z"],
          id: "clxtest",
        }),
      ).toString("base64url");

      expect(decodeKeysetCursor(wrongVersion)).toBeNull();
    });

    it("should return null for invalid sort option", () => {
      const invalidSort = Buffer.from(
        JSON.stringify({
          v: 1,
          s: "invalid_sort", // Not a valid sort option
          k: ["2024-01-15T10:00:00.000Z"],
          id: "clxtest",
        }),
      ).toString("base64url");

      expect(decodeKeysetCursor(invalidSort)).toBeNull();
    });

    it("should return null for missing id", () => {
      const missingId = Buffer.from(
        JSON.stringify({
          v: 1,
          s: "newest",
          k: ["2024-01-15T10:00:00.000Z"],
          // Missing id
        }),
      ).toString("base64url");

      expect(decodeKeysetCursor(missingId)).toBeNull();
    });

    it("should return null for empty id", () => {
      const emptyId = Buffer.from(
        JSON.stringify({
          v: 1,
          s: "newest",
          k: ["2024-01-15T10:00:00.000Z"],
          id: "",
        }),
      ).toString("base64url");

      expect(decodeKeysetCursor(emptyId)).toBeNull();
    });

    it("should return null when expectedSort does not match", () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtest",
      };

      const encoded = encodeKeysetCursor(cursor);

      // Decode with different expected sort
      expect(decodeKeysetCursor(encoded, "recommended")).toBeNull();
      expect(decodeKeysetCursor(encoded, "price_asc")).toBeNull();

      // But should work with correct expected sort
      expect(decodeKeysetCursor(encoded, "newest")).toEqual(cursor);
    });

    it("should return null for wrong key count", () => {
      // recommended expects 2 keys, but we provide 1
      const wrongKeyCount = Buffer.from(
        JSON.stringify({
          v: 1,
          s: "recommended",
          k: ["2024-01-15T10:00:00.000Z"], // Should have 2 keys
          id: "clxtest",
        }),
      ).toString("base64url");

      expect(decodeKeysetCursor(wrongKeyCount)).toBeNull();
    });

    it("should validate key count for each sort option", () => {
      // Each sort has expected key count
      const sortKeyExpectations: Array<{ sort: string; expectedKeys: number }> =
        [
          { sort: "recommended", expectedKeys: 2 },
          { sort: "newest", expectedKeys: 1 },
          { sort: "price_asc", expectedKeys: 2 },
          { sort: "price_desc", expectedKeys: 2 },
          { sort: "rating", expectedKeys: 3 },
        ];

      for (const { sort, expectedKeys } of sortKeyExpectations) {
        // Create cursor with wrong number of keys
        const wrongKeyCount = Buffer.from(
          JSON.stringify({
            v: 1,
            s: sort,
            k: [], // Empty keys - always wrong
            id: "clxtest",
          }),
        ).toString("base64url");

        expect(decodeKeysetCursor(wrongKeyCount)).toBeNull();

        // Create cursor with correct number of keys
        const keys = Array(expectedKeys).fill("test");
        const correctKeyCount = Buffer.from(
          JSON.stringify({
            v: 1,
            s: sort,
            k: keys,
            id: "clxtest",
          }),
        ).toString("base64url");

        expect(decodeKeysetCursor(correctKeyCount)).not.toBeNull();
      }
    });
  });

  describe("HMAC-signed cursor mode", () => {
    it("round-trips signed cursors when CURSOR_SECRET is set", async () => {
      process.env.CURSOR_SECRET = "0123456789abcdef0123456789abcdef";
      jest.resetModules();

      const { encodeKeysetCursor: encodeSigned, decodeKeysetCursor: decodeSigned } =
        await import("@/lib/search/cursor");

      const cursor = {
        v: 1 as const,
        s: "newest" as const,
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxsigned",
      };

      const encoded = encodeSigned(cursor);
      expect(decodeSigned(encoded)).toEqual(cursor);
    });

    it("rejects tampered signed cursors", async () => {
      process.env.CURSOR_SECRET = "0123456789abcdef0123456789abcdef";
      jest.resetModules();

      const { encodeKeysetCursor: encodeSigned, decodeKeysetCursor: decodeSigned } =
        await import("@/lib/search/cursor");

      const cursor = {
        v: 1 as const,
        s: "newest" as const,
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtamper",
      };

      const encoded = encodeSigned(cursor);
      const envelope = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
      envelope.p = envelope.p.replace("clxtamper", "clxfakeid");
      const tampered = Buffer.from(JSON.stringify(envelope)).toString("base64url");

      expect(decodeSigned(tampered)).toBeNull();
    });
  });

  describe("buildCursorFromRow", () => {
    const baseRow: CursorRowData = {
      id: "clxtestlisting",
      listing_created_at: "2024-01-15T10:00:00.000Z",
      recommended_score: "85.50",
      price: "1500.00",
      avg_rating: "4.50",
      review_count: "10",
    };

    it("should build recommended cursor with correct keys", () => {
      const cursor = buildCursorFromRow(baseRow, "recommended");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("recommended");
      expect(cursor.k).toEqual(["85.50", "2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("clxtestlisting");
    });

    it("should build newest cursor with correct keys", () => {
      const cursor = buildCursorFromRow(baseRow, "newest");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("newest");
      expect(cursor.k).toEqual(["2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("clxtestlisting");
    });

    it("should build price_asc cursor with correct keys", () => {
      const cursor = buildCursorFromRow(baseRow, "price_asc");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("price_asc");
      expect(cursor.k).toEqual(["1500.00", "2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("clxtestlisting");
    });

    it("should build price_desc cursor with correct keys", () => {
      const cursor = buildCursorFromRow(baseRow, "price_desc");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("price_desc");
      expect(cursor.k).toEqual(["1500.00", "2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("clxtestlisting");
    });

    it("should build rating cursor with correct keys", () => {
      const cursor = buildCursorFromRow(baseRow, "rating");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("rating");
      expect(cursor.k).toEqual(["4.50", "10", "2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("clxtestlisting");
    });

    it("should handle null/undefined values in row", () => {
      const rowWithNulls: CursorRowData = {
        id: "clxnullrow",
        listing_created_at: "2024-01-15T10:00:00.000Z",
        // recommended_score is undefined
        // price is undefined
        // avg_rating is undefined
        // review_count is undefined
      };

      const recommendedCursor = buildCursorFromRow(rowWithNulls, "recommended");
      expect(recommendedCursor.k).toEqual([null, "2024-01-15T10:00:00.000Z"]);

      const priceCursor = buildCursorFromRow(rowWithNulls, "price_asc");
      expect(priceCursor.k).toEqual([null, "2024-01-15T10:00:00.000Z"]);

      const ratingCursor = buildCursorFromRow(rowWithNulls, "rating");
      expect(ratingCursor.k).toEqual([null, null, "2024-01-15T10:00:00.000Z"]);
    });

    it("should build cursor that can be roundtripped", () => {
      for (const sort of SORT_OPTIONS) {
        const cursor = buildCursorFromRow(baseRow, sort);
        const encoded = encodeKeysetCursor(cursor);
        const decoded = decodeKeysetCursor(encoded);

        expect(decoded).toEqual(cursor);
      }
    });
  });

  describe("decodeLegacyCursor", () => {
    it("should decode legacy page cursor", () => {
      const legacyCursor = Buffer.from(JSON.stringify({ p: 5 })).toString(
        "base64url",
      );
      expect(decodeLegacyCursor(legacyCursor)).toBe(5);
    });

    it("should return null for invalid legacy cursor", () => {
      expect(decodeLegacyCursor("invalid")).toBeNull();
      expect(decodeLegacyCursor("")).toBeNull();
    });

    it("should return null for page <= 0", () => {
      const zeroPage = Buffer.from(JSON.stringify({ p: 0 })).toString(
        "base64url",
      );
      expect(decodeLegacyCursor(zeroPage)).toBeNull();

      const negativePage = Buffer.from(JSON.stringify({ p: -1 })).toString(
        "base64url",
      );
      expect(decodeLegacyCursor(negativePage)).toBeNull();
    });

    it("should return null for keyset cursor (has v property)", () => {
      const keysetCursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtest",
      };

      const encoded = encodeKeysetCursor(keysetCursor);
      expect(decodeLegacyCursor(encoded)).toBeNull();
    });

    it("should return null for non-numeric page", () => {
      const stringPage = Buffer.from(JSON.stringify({ p: "5" })).toString(
        "base64url",
      );
      expect(decodeLegacyCursor(stringPage)).toBeNull();
    });
  });

  describe("decodeCursorAny", () => {
    it("should detect keyset cursor", () => {
      const keysetCursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtest",
      };

      const encoded = encodeKeysetCursor(keysetCursor);
      const result = decodeCursorAny(encoded, "newest");

      expect(result).toEqual({
        type: "keyset",
        cursor: keysetCursor,
      });
    });

    it("should detect legacy cursor", () => {
      const legacyCursor = Buffer.from(JSON.stringify({ p: 5 })).toString(
        "base64url",
      );
      const result = decodeCursorAny(legacyCursor, "newest");

      expect(result).toEqual({
        type: "legacy",
        page: 5,
      });
    });

    it("should return null for invalid cursor", () => {
      expect(decodeCursorAny("invalid", "newest")).toBeNull();
      expect(decodeCursorAny("", "newest")).toBeNull();
    });

    it("should return null when keyset sort doesn't match", () => {
      const keysetCursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtest",
      };

      const encoded = encodeKeysetCursor(keysetCursor);

      // Should return null when expected sort doesn't match
      expect(decodeCursorAny(encoded, "recommended")).toBeNull();
    });

    it("should prefer keyset over legacy format", () => {
      // This tests that keyset format is tried first
      const keysetCursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "clxtest",
      };

      const encoded = encodeKeysetCursor(keysetCursor);
      const result = decodeCursorAny(encoded, "newest");

      expect(result?.type).toBe("keyset");
    });
  });

  describe("SORT_OPTIONS constant", () => {
    it("should contain all expected sort options", () => {
      expect(SORT_OPTIONS).toContain("recommended");
      expect(SORT_OPTIONS).toContain("newest");
      expect(SORT_OPTIONS).toContain("price_asc");
      expect(SORT_OPTIONS).toContain("price_desc");
      expect(SORT_OPTIONS).toContain("rating");
    });

    it("should have 5 sort options", () => {
      expect(SORT_OPTIONS).toHaveLength(5);
    });
  });
});
