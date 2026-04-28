/**
 * Tests for /api/nearby route - Unicode and i18n Edge Cases
 * Tests handling of various Unicode scripts, RTL text, emojis, and special characters
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: any,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      mockJsonFn(data, init);
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      };
    },
  },
}));

// Mock auth
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

// Mock rate limiting to return null (allow request)
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/nearby/route";
import { auth } from "@/auth";

describe("POST /api/nearby - Unicode and i18n Edge Cases", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  const baseRequest = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    radiusMeters: 1609,
  };

  // Helper to create request
  function createRequest(body: any): Request {
    return new Request("http://localhost/api/nearby", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  // Helper to create mock Radar place with Unicode name
  function createMockPlace(name: string, address = "123 Test St") {
    return {
      _id: `place-${Date.now()}-${Math.random()}`,
      name,
      formattedAddress: address,
      categories: ["food-beverage"],
      location: {
        type: "Point",
        coordinates: [-122.4194, 37.7749],
      },
    };
  }

  function mockRadarSuccess(places: any[]) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    process.env.RADAR_SECRET_KEY = "test-radar-key";
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
  });

  describe("RTL Scripts", () => {
    it("handles Hebrew text in place names", async () => {
      const hebrewName = "חנות עברית";
      mockRadarSuccess([createMockPlace(hebrewName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(hebrewName);
    });

    it("handles Arabic text in place names", async () => {
      const arabicName = "مطعم عربي";
      mockRadarSuccess([createMockPlace(arabicName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(arabicName);
    });

    it("handles mixed RTL/LTR text (bidirectional)", async () => {
      const bidiName = "English عربي 日本語 עברית";
      mockRadarSuccess([createMockPlace(bidiName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(bidiName);
    });
  });

  describe("CJK Scripts", () => {
    it("handles Japanese text (mixed scripts - Hiragana, Katakana, Kanji)", async () => {
      const japaneseName = "日本料理ラーメンひらがな";
      mockRadarSuccess([createMockPlace(japaneseName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(japaneseName);
    });

    it("handles Korean text (Hangul)", async () => {
      const koreanName = "한글 상점 맛집";
      mockRadarSuccess([createMockPlace(koreanName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(koreanName);
    });

    it("handles Chinese text (Simplified and Traditional)", async () => {
      const chineseName = "中文餐厅 傳統漢字";
      mockRadarSuccess([createMockPlace(chineseName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(chineseName);
    });
  });

  describe("Other Scripts", () => {
    it("handles Thai script", async () => {
      const thaiName = "ร้านค้าไทย อาหารอร่อย";
      mockRadarSuccess([createMockPlace(thaiName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(thaiName);
    });

    it("handles Devanagari script (Hindi)", async () => {
      const hindiName = "हिंदी दुकान खाना";
      mockRadarSuccess([createMockPlace(hindiName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(hindiName);
    });

    it("handles Cyrillic script (Russian)", async () => {
      const russianName = "Русский магазин";
      mockRadarSuccess([createMockPlace(russianName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(russianName);
    });

    it("handles Greek script", async () => {
      const greekName = "Ελληνικό εστιατόριο";
      mockRadarSuccess([createMockPlace(greekName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(greekName);
    });
  });

  describe("Emoji Handling", () => {
    it("handles basic emojis in place names", async () => {
      const emojiName = "🍕 Pizza Place 🍕";
      mockRadarSuccess([createMockPlace(emojiName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(emojiName);
    });

    it("handles emoji with skin tone modifiers", async () => {
      const emojiName = "👨🏽‍🍳 Chef's Kitchen 👩🏻‍🍳";
      mockRadarSuccess([createMockPlace(emojiName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(emojiName);
    });

    it("handles ZWJ emoji sequences (family, profession emojis)", async () => {
      const zwjEmoji = "👨‍👩‍👧‍👦 Family Restaurant";
      mockRadarSuccess([createMockPlace(zwjEmoji)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(zwjEmoji);
    });

    it("handles flag emojis (regional indicators)", async () => {
      const flagEmoji = "🇺🇸 American Diner 🇲🇽 Mexican Food";
      mockRadarSuccess([createMockPlace(flagEmoji)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(flagEmoji);
    });
  });

  describe("Special Characters", () => {
    it("handles combining diacritical marks (café with combining acute)", async () => {
      // Using combining acute accent (U+0301) after 'e'
      const combiningName = "Cafe\u0301 Français";
      mockRadarSuccess([createMockPlace(combiningName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(combiningName);
    });

    it("handles zero-width characters", async () => {
      // Zero-width space (U+200B)
      const zwsName = "Test\u200BName\u200BPlace";
      mockRadarSuccess([createMockPlace(zwsName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(zwsName);
    });

    it("handles non-breaking spaces", async () => {
      // Non-breaking space (U+00A0)
      const nbspName = "Test\u00A0Name\u00A0Place";
      mockRadarSuccess([createMockPlace(nbspName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(nbspName);
    });

    it("handles special punctuation marks", async () => {
      const punctuationName = "O'Reilly's Café — Restaurant « Français »";
      mockRadarSuccess([createMockPlace(punctuationName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(punctuationName);
    });
  });

  describe("Unicode Normalization", () => {
    it("handles NFC vs NFD normalized text", async () => {
      // 'é' as single character (NFC) vs 'e' + combining acute (NFD)
      const nfcName = "café"; // NFC
      mockRadarSuccess([createMockPlace(nfcName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should preserve the original form
      expect(data.places[0].name).toBe(nfcName);
    });
  });

  describe("Edge Cases", () => {
    it("handles very long Unicode names (500+ characters)", async () => {
      const longName = "日本".repeat(250); // 500 characters of Japanese
      mockRadarSuccess([createMockPlace(longName)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe(longName);
    });

    it("handles Unicode in addresses", async () => {
      const unicodeAddress = "東京都渋谷区道玄坂1-2-3";
      mockRadarSuccess([createMockPlace("Test Place", unicodeAddress)]);

      const response = await POST(
        createRequest({
          ...baseRequest,
          categories: ["food-beverage"],
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].address).toBe(unicodeAddress);
    });

    it("handles mixed scripts in query parameter", async () => {
      // Test that Unicode queries don't break the autocomplete path
      const unicodeQuery = "寿司";
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              formattedAddress: "123 Test St",
              placeLabel: "寿司レストラン",
              layer: "place",
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          ...baseRequest,
          query: unicodeQuery, // Text search triggers autocomplete
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      // Autocomplete should handle Unicode query
    });
  });
});
