import {
  parseSearchParams,
  validateSearchFilters,
  buildRawParamsFromSearchParams,
  MAX_SAFE_PAGE,
  MAX_SAFE_PRICE,
  MAX_ARRAY_ITEMS,
} from "@/lib/search-params";

const formatLocalDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
};

const today = formatLocalDate(new Date());
const tomorrow = formatLocalDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
const nextYearDate = new Date();
nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
const nextYear = formatLocalDate(nextYearDate);
const farFutureDate = new Date();
farFutureDate.setFullYear(farFutureDate.getFullYear() + 3);
const farFuture = formatLocalDate(farFutureDate);

const manyLanguages = [
  "en",
  "es",
  "zh",
  "hi",
  "ar",
  "pt",
  "ru",
  "ja",
  "de",
  "fr",
  "ko",
  "vi",
  "it",
  "nl",
  "pl",
  "tr",
  "th",
  "te",
  "ta",
  "bn",
  "pa",
  "gu",
  "mr",
  "kn",
  "ml",
  "ur",
];

describe("parseSearchParams - query cases", () => {
  const cases: Array<
    [string, string | string[] | undefined, string | undefined]
  > = [
    ["simple", "downtown", "downtown"],
    ["trimmed", "  downtown  ", "downtown"],
    ["single char", "a", "a"],
    ["single char trimmed", "  a ", "a"],
    ["whitespace only", "   ", undefined],
    ["tabs/newlines", "\n\t", undefined],
    ["unicode", "北京", "北京"],
    ["punctuation", "St. Louis", "St. Louis"],
    ["comma", "Austin, TX", "Austin, TX"],
    ["plus", "room + bath", "room + bath"],
    ["hyphen", "co-living", "co-living"],
    ["array uses first", ["first", "second"], "first"],
  ];

  test.each(cases)("%s", (_label, q, expected) => {
    const result = parseSearchParams({ q });
    expect(result.q).toBe(expected);
    expect(result.filterParams.query).toBe(expected);
  });
});

describe("parseSearchParams - price cases", () => {
  const cases: Array<
    [
      string,
      string | undefined,
      string | undefined,
      number | undefined,
      number | undefined,
    ]
  > = [
    ["min zero", "0", undefined, 0, undefined],
    ["max zero", undefined, "0", undefined, 0],
    ["negative min clamps", "-50", undefined, 0, undefined],
    ["negative max clamps", undefined, "-10", undefined, 0],
    ["normal range", "500", "1000", 500, 1000],
    ["trim min", " 750 ", undefined, 750, undefined],
    ["trim max", undefined, " 2500 ", undefined, 2500],
    ["min too large clamps", "10000000000", undefined, 1000000000, undefined],
    ["max too large clamps", undefined, "10000000000", undefined, 1000000000],
    ["min infinity ignored", "Infinity", undefined, undefined, undefined],
    ["max overflow ignored", undefined, "1e309", undefined, undefined],
    ["min NaN ignored", "NaN", undefined, undefined, undefined],
    ["decimal min", "0.99", undefined, 0.99, undefined],
    ["decimal max", undefined, "1234.56", undefined, 1234.56],
  ];

  test.each(cases)(
    "%s",
    (_label, minPrice, maxPrice, expectedMin, expectedMax) => {
      const result = parseSearchParams({ minPrice, maxPrice });
      expect(result.filterParams.minPrice).toBe(expectedMin);
      expect(result.filterParams.maxPrice).toBe(expectedMax);
    },
  );

  // P1-13: Inverted price ranges now throw error instead of silently swapping
  it("throws error for inverted price range", () => {
    expect(() => parseSearchParams({ minPrice: "2000", maxPrice: "1000" }))
      .toThrow("minPrice cannot exceed maxPrice");
  });
});

describe("parseSearchParams - amenity cases", () => {
  const cases: Array<
    [string, string | string[] | undefined, string[] | undefined]
  > = [
    ["single", "Wifi", ["Wifi"]],
    ["case normalize", "wifi", ["Wifi"]],
    ["comma list", "Wifi,Parking", ["Wifi", "Parking"]],
    ["array list", ["Parking", "Kitchen"], ["Parking", "Kitchen"]],
    ["dedupe", ["Parking", "parking", "PARKING"], ["Parking"]],
    ["invalid dropped", "Invalid", undefined],
    ["mixed valid/invalid", "Wifi,Invalid", ["Wifi"]],
    [
      "full set",
      "Wifi,Parking,Kitchen,Pool,AC,Dryer,Washer,Gym",
      ["Wifi", "Parking", "Kitchen", "Pool", "AC", "Dryer", "Washer", "Gym"],
    ],
    ["empty string", "", undefined],
    ["trimmed values", ["Wifi", " Parking "], ["Wifi", "Parking"]],
  ];

  test.each(cases)("%s", (_label, amenities, expected) => {
    const result = parseSearchParams({ amenities });
    expect(result.filterParams.amenities).toEqual(expected);
  });
});

describe("parseSearchParams - house rules cases", () => {
  const cases: Array<
    [string, string | string[] | undefined, string[] | undefined]
  > = [
    ["single", "Pets allowed", ["Pets allowed"]],
    ["case normalize", "pets allowed", ["Pets allowed"]],
    [
      "comma list",
      "Pets allowed,Smoking allowed",
      ["Pets allowed", "Smoking allowed"],
    ],
    [
      "array list",
      ["Guests allowed", "Couples allowed"],
      ["Guests allowed", "Couples allowed"],
    ],
    ["dedupe", ["Guests allowed", "guests allowed"], ["Guests allowed"]],
    ["invalid dropped", "No pets", undefined],
    ["mixed valid/invalid", "Pets allowed,Invalid", ["Pets allowed"]],
    [
      "full set",
      "Pets allowed,Smoking allowed,Couples allowed,Guests allowed",
      ["Pets allowed", "Smoking allowed", "Couples allowed", "Guests allowed"],
    ],
    ["empty string", "", undefined],
    [
      "trimmed values",
      ["Pets allowed", " Guests allowed "],
      ["Pets allowed", "Guests allowed"],
    ],
  ];

  test.each(cases)("%s", (_label, houseRules, expected) => {
    const result = parseSearchParams({ houseRules });
    expect(result.filterParams.houseRules).toEqual(expected);
  });
});

describe("parseSearchParams - language cases", () => {
  const cases: Array<
    [string, string | string[] | undefined, string[] | undefined]
  > = [
    ["code", "en", ["en"]],
    ["uppercase code", "EN", ["en"]],
    ["legacy name", "English", ["en"]],
    ["legacy pair", ["English", "Spanish"], ["en", "es"]],
    ["dedupe codes", ["es", "Spanish"], ["es"]],
    ["invalid dropped", "xyz", undefined],
    ["comma list", "en,es", ["en", "es"]],
    ["array dedupe", ["en", "es", "en"], ["en", "es"]],
    ["mandarin alias", "Mandarin", ["zh"]],
    ["telugu alias", "Telugu", ["te"]],
    ["mixed with invalid", ["en", "invalid", "es"], ["en", "es"]],
    ["max items", manyLanguages, manyLanguages.slice(0, 20)],
  ];

  test.each(cases)("%s", (_label, languages, expected) => {
    const result = parseSearchParams({ languages });
    expect(result.filterParams.languages).toEqual(expected);
  });
});

describe("parseSearchParams - enum cases", () => {
  // Note: parseSearchParams uses case-insensitive matching for better UX
  const cases: Array<
    [
      string,
      Partial<{
        roomType: string;
        leaseDuration: string;
        genderPreference: string;
        householdGender: string;
      }>,
      Partial<{
        roomType?: string;
        leaseDuration?: string;
        genderPreference?: string;
        householdGender?: string;
      }>,
    ]
  > = [
    [
      "room type valid",
      { roomType: "Private Room" },
      { roomType: "Private Room" },
    ],
    ["room type any", { roomType: "any" }, { roomType: undefined }],
    [
      "room type case-insensitive",
      { roomType: "private room" },
      { roomType: "Private Room" },
    ],
    [
      "room type truly invalid",
      { roomType: "InvalidRoom" },
      { roomType: undefined },
    ],
    [
      "lease duration valid",
      { leaseDuration: "6 months" },
      { leaseDuration: "6 months" },
    ],
    [
      "lease duration any",
      { leaseDuration: "any" },
      { leaseDuration: undefined },
    ],
    [
      "lease duration case-insensitive",
      { leaseDuration: "6 Months" },
      { leaseDuration: "6 months" },
    ],
    [
      "lease duration truly invalid",
      { leaseDuration: "7 months" },
      { leaseDuration: undefined },
    ],
    [
      "gender pref valid",
      { genderPreference: "MALE_ONLY" },
      { genderPreference: "MALE_ONLY" },
    ],
    [
      "gender pref any",
      { genderPreference: "any" },
      { genderPreference: undefined },
    ],
    [
      "household gender valid",
      { householdGender: "MIXED" },
      { householdGender: "MIXED" },
    ],
    [
      "household gender case-insensitive",
      { householdGender: "all_male" },
      { householdGender: "ALL_MALE" },
    ],
    [
      "household gender truly invalid",
      { householdGender: "invalid_gender" },
      { householdGender: undefined },
    ],
  ];

  test.each(cases)("%s", (_label, input, expected) => {
    const result = parseSearchParams(input);
    expect(result.filterParams.roomType).toBe(expected.roomType);
    expect(result.filterParams.leaseDuration).toBe(expected.leaseDuration);
    expect(result.filterParams.genderPreference).toBe(
      expected.genderPreference,
    );
    expect(result.filterParams.householdGender).toBe(expected.householdGender);
  });
});

describe("parseSearchParams - date cases", () => {
  const cases: Array<[string, string | undefined, string | undefined]> = [
    ["today valid", today, today],
    ["tomorrow valid", tomorrow, tomorrow],
    ["next year valid", nextYear, nextYear],
    ["trimmed valid", ` ${tomorrow} `, tomorrow],
    ["invalid format slash", "2024/01/01", undefined],
    ["invalid format short", "2024-1-1", undefined],
    ["invalid format time", `${tomorrow}T00:00:00`, undefined],
    ["invalid date", "2024-02-30", undefined],
    ["past date", "2000-01-01", undefined],
    ["far future", farFuture, undefined],
  ];

  test.each(cases)("%s", (_label, moveInDate, expected) => {
    const result = parseSearchParams({ moveInDate });
    expect(result.filterParams.moveInDate).toBe(expected);
  });
});

describe("parseSearchParams - bounds cases", () => {
  test("lat only -> no bounds", () => {
    const result = parseSearchParams({ lat: "10" });
    expect(result.filterParams.bounds).toBeUndefined();
  });

  test("lng only -> no bounds", () => {
    const result = parseSearchParams({ lng: "10" });
    expect(result.filterParams.bounds).toBeUndefined();
  });

  test("invalid lat/lng -> no bounds", () => {
    const result = parseSearchParams({ lat: "abc", lng: "def" });
    expect(result.filterParams.bounds).toBeUndefined();
  });

  test("incomplete explicit bounds -> no bounds", () => {
    const result = parseSearchParams({ minLat: "1", maxLat: "2", minLng: "3" });
    expect(result.filterParams.bounds).toBeUndefined();
  });

  test("explicit bounds throw for inverted lat (P1-3: consistent with price)", () => {
    // P1-3: Lat inversion now throws like price inversion
    expect(() =>
      parseSearchParams({
        minLat: "20",
        maxLat: "10",
        minLng: "3",
        maxLng: "4",
      })
    ).toThrow("minLat cannot exceed maxLat");
  });

  test("explicit bounds preserve antimeridian lng", () => {
    const result = parseSearchParams({
      minLat: "1",
      maxLat: "2",
      minLng: "170",
      maxLng: "-170",
    });
    expect(result.filterParams.bounds).toEqual({
      minLat: 1,
      maxLat: 2,
      minLng: 170,
      maxLng: -170,
    });
  });

  test("lat at 90 clamps maxLat", () => {
    const result = parseSearchParams({ lat: "90", lng: "0" });
    expect(result.filterParams.bounds?.maxLat).toBe(90);
  });

  test("lat at -90 clamps minLat", () => {
    const result = parseSearchParams({ lat: "-90", lng: "0" });
    expect(result.filterParams.bounds?.minLat).toBe(-90);
  });

  test("lng at 180 clamps maxLng", () => {
    const result = parseSearchParams({ lat: "0", lng: "180" });
    expect(result.filterParams.bounds?.maxLng).toBe(180);
  });

  test("lng at -180 clamps minLng", () => {
    const result = parseSearchParams({ lat: "0", lng: "-180" });
    expect(result.filterParams.bounds?.minLng).toBe(-180);
  });

  test("explicit bounds override lat/lng", () => {
    const result = parseSearchParams({
      minLat: "1",
      maxLat: "2",
      minLng: "3",
      maxLng: "4",
      lat: "50",
      lng: "60",
    });
    expect(result.filterParams.bounds).toEqual({
      minLat: 1,
      maxLat: 2,
      minLng: 3,
      maxLng: 4,
    });
  });
});

describe("parseSearchParams - sort cases", () => {
  const sorts = [
    "recommended",
    "price_asc",
    "price_desc",
    "newest",
    "rating",
  ] as const;
  test.each(sorts)("valid sort: %s", (sort) => {
    const result = parseSearchParams({ sort });
    expect(result.sortOption).toBe(sort);
  });

  const invalidSorts = ["BAD", "price", "desc", "new", ""];
  test.each(invalidSorts)("invalid sort: %s", (sort) => {
    const result = parseSearchParams({ sort });
    expect(result.sortOption).toBe("recommended");
  });
});

describe("parseSearchParams - page cases", () => {
  const cases: Array<[string, string | undefined, number]> = [
    ["undefined page", undefined, 1],
    ["page zero", "0", 1],
    ["page negative", "-5", 1],
    ["page normal", "2", 2],
    ["page too large", "9999", MAX_SAFE_PAGE],
  ];

  test.each(cases)("%s", (_label, page, expected) => {
    const result = parseSearchParams({ page });
    expect(result.requestedPage).toBe(expected);
  });
});

/**
 * Tests for validateSearchFilters - server action validation
 */
describe("validateSearchFilters - server action validation", () => {
  describe("input validation", () => {
    it("returns empty object for null input", () => {
      expect(validateSearchFilters(null)).toEqual({});
    });

    it("returns empty object for undefined input", () => {
      expect(validateSearchFilters(undefined)).toEqual({});
    });

    it("returns empty object for non-object input (string)", () => {
      expect(validateSearchFilters("not an object")).toEqual({});
    });

    it("returns empty object for non-object input (number)", () => {
      expect(validateSearchFilters(42)).toEqual({});
    });

    it("returns empty object for non-object input (array)", () => {
      expect(validateSearchFilters([1, 2, 3])).toEqual({});
    });
  });

  describe("query validation", () => {
    it("accepts valid query string", () => {
      const result = validateSearchFilters({ query: "downtown apartment" });
      expect(result.query).toBe("downtown apartment");
    });

    it("trims query whitespace", () => {
      const result = validateSearchFilters({ query: "  spacious room  " });
      expect(result.query).toBe("spacious room");
    });

    it("rejects query > 200 chars", () => {
      const longQuery = "a".repeat(201);
      const result = validateSearchFilters({ query: longQuery });
      expect(result.query).toBeUndefined();
    });

    it("accepts query exactly 200 chars", () => {
      const exactQuery = "a".repeat(200);
      const result = validateSearchFilters({ query: exactQuery });
      expect(result.query).toBe(exactQuery);
    });

    it("rejects empty string query", () => {
      const result = validateSearchFilters({ query: "" });
      expect(result.query).toBeUndefined();
    });

    it("rejects whitespace-only query", () => {
      const result = validateSearchFilters({ query: "   " });
      expect(result.query).toBeUndefined();
    });

    it("rejects non-string query", () => {
      const result = validateSearchFilters({ query: 123 });
      expect(result.query).toBeUndefined();
    });
  });

  describe("price validation with MAX_SAFE_PRICE", () => {
    it("clamps minPrice to MAX_SAFE_PRICE (1B)", () => {
      const result = validateSearchFilters({ minPrice: 2000000000 });
      expect(result.minPrice).toBe(MAX_SAFE_PRICE);
    });

    it("clamps maxPrice to MAX_SAFE_PRICE (1B)", () => {
      const result = validateSearchFilters({ maxPrice: 5000000000 });
      expect(result.maxPrice).toBe(MAX_SAFE_PRICE);
    });

    it("clamps negative minPrice to 0", () => {
      const result = validateSearchFilters({ minPrice: -100 });
      expect(result.minPrice).toBe(0);
    });

    it("clamps negative maxPrice to 0", () => {
      const result = validateSearchFilters({ maxPrice: -500 });
      expect(result.maxPrice).toBe(0);
    });

    // P1-13: Inverted price ranges now throw error instead of silently swapping
    it("throws error for inverted min/max", () => {
      expect(() => validateSearchFilters({ minPrice: 2000, maxPrice: 1000 }))
        .toThrow("minPrice cannot exceed maxPrice");
    });

    it("rejects Infinity", () => {
      const result = validateSearchFilters({
        minPrice: Infinity,
        maxPrice: -Infinity,
      });
      expect(result.minPrice).toBeUndefined();
      expect(result.maxPrice).toBeUndefined();
    });

    it("rejects NaN", () => {
      const result = validateSearchFilters({ minPrice: NaN, maxPrice: NaN });
      expect(result.minPrice).toBeUndefined();
      expect(result.maxPrice).toBeUndefined();
    });

    it("accepts valid price range", () => {
      const result = validateSearchFilters({ minPrice: 500, maxPrice: 1500 });
      expect(result.minPrice).toBe(500);
      expect(result.maxPrice).toBe(1500);
    });

    it("accepts zero prices", () => {
      const result = validateSearchFilters({ minPrice: 0, maxPrice: 0 });
      expect(result.minPrice).toBe(0);
      expect(result.maxPrice).toBe(0);
    });

    it("rejects non-number prices", () => {
      const result = validateSearchFilters({
        minPrice: "500",
        maxPrice: "1500",
      });
      expect(result.minPrice).toBeUndefined();
      expect(result.maxPrice).toBeUndefined();
    });
  });

  describe("array field validation (amenities)", () => {
    it("validates amenities against allowlist", () => {
      const result = validateSearchFilters({ amenities: ["Wifi", "Parking"] });
      expect(result.amenities).toEqual(["Wifi", "Parking"]);
    });

    it("normalizes amenity case", () => {
      const result = validateSearchFilters({ amenities: ["wifi", "PARKING"] });
      expect(result.amenities).toEqual(["Wifi", "Parking"]);
    });

    it("deduplicates amenities", () => {
      const result = validateSearchFilters({
        amenities: ["Wifi", "wifi", "WIFI"],
      });
      expect(result.amenities).toEqual(["Wifi"]);
    });

    it("limits amenities to MAX_ARRAY_ITEMS (20)", () => {
      const manyAmenities = Array(25).fill("Wifi");
      const result = validateSearchFilters({ amenities: manyAmenities });
      // Since all are duplicates, result should be just ["Wifi"]
      expect(result.amenities).toEqual(["Wifi"]);
    });

    it("drops invalid amenities", () => {
      const result = validateSearchFilters({
        amenities: ["Wifi", "InvalidAmenity", "Parking"],
      });
      expect(result.amenities).toEqual(["Wifi", "Parking"]);
    });

    it("returns undefined when all amenities are invalid", () => {
      const result = validateSearchFilters({
        amenities: ["Invalid1", "Invalid2"],
      });
      expect(result.amenities).toBeUndefined();
    });

    it("returns undefined for non-array amenities", () => {
      const result = validateSearchFilters({ amenities: "Wifi" });
      expect(result.amenities).toBeUndefined();
    });
  });

  describe("bounds validation", () => {
    it("accepts valid bounds", () => {
      const result = validateSearchFilters({
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      });
      expect(result.bounds).toEqual({
        minLat: 37.7,
        maxLat: 37.8,
        minLng: -122.5,
        maxLng: -122.4,
      });
    });

    it("clamps lat to valid range [-90, 90]", () => {
      const result = validateSearchFilters({
        bounds: { minLat: -100, maxLat: 100, minLng: 0, maxLng: 1 },
      });
      expect(result.bounds?.minLat).toBe(-90);
      expect(result.bounds?.maxLat).toBe(90);
    });

    it("clamps lng to valid range [-180, 180]", () => {
      const result = validateSearchFilters({
        bounds: { minLat: 0, maxLat: 1, minLng: -200, maxLng: 200 },
      });
      expect(result.bounds?.minLng).toBe(-180);
      expect(result.bounds?.maxLng).toBe(180);
    });

    it("throws for inverted lat bounds (P1-3: consistent with price)", () => {
      // P1-3: Lat inversion now throws like price inversion
      expect(() =>
        validateSearchFilters({
          bounds: { minLat: 38, maxLat: 37, minLng: -122, maxLng: -121 },
        })
      ).toThrow("minLat cannot exceed maxLat");
    });

    it("rejects incomplete bounds (missing minLng)", () => {
      const result = validateSearchFilters({
        bounds: { minLat: 37, maxLat: 38, maxLng: -121 },
      });
      expect(result.bounds).toBeUndefined();
    });

    it("rejects bounds with non-number values", () => {
      const result = validateSearchFilters({
        bounds: { minLat: "37", maxLat: 38, minLng: -122, maxLng: -121 },
      });
      expect(result.bounds).toBeUndefined();
    });

    it("rejects bounds with Infinity", () => {
      const result = validateSearchFilters({
        bounds: { minLat: 37, maxLat: Infinity, minLng: -122, maxLng: -121 },
      });
      expect(result.bounds).toBeUndefined();
    });

    it("rejects bounds with NaN", () => {
      const result = validateSearchFilters({
        bounds: { minLat: NaN, maxLat: 38, minLng: -122, maxLng: -121 },
      });
      expect(result.bounds).toBeUndefined();
    });
  });

  describe("combined validation", () => {
    it("validates multiple fields simultaneously", () => {
      const result = validateSearchFilters({
        query: "  downtown  ",
        minPrice: 500,
        maxPrice: 1500,
        amenities: ["wifi", "PARKING"],
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      });

      expect(result.query).toBe("downtown");
      expect(result.minPrice).toBe(500);
      expect(result.maxPrice).toBe(1500);
      expect(result.amenities).toEqual(["Wifi", "Parking"]);
      expect(result.bounds).toBeDefined();
    });

    it("ignores invalid fields while keeping valid ones", () => {
      const result = validateSearchFilters({
        query: "valid query",
        minPrice: "invalid", // Invalid - not a number
        maxPrice: 1500, // Valid
        amenities: "not-an-array", // Invalid - not an array
      });

      expect(result.query).toBe("valid query");
      expect(result.minPrice).toBeUndefined();
      expect(result.maxPrice).toBe(1500);
      expect(result.amenities).toBeUndefined();
    });
  });
});

/**
 * Tests for buildRawParamsFromSearchParams - URL param parsing utility
 */
describe("buildRawParamsFromSearchParams", () => {
  it("converts single values to strings", () => {
    const searchParams = new URLSearchParams("q=downtown&minPrice=500");
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.q).toBe("downtown");
    expect(result.minPrice).toBe("500");
  });

  it("converts duplicate keys to arrays", () => {
    const searchParams = new URLSearchParams(
      "amenities=Wifi&amenities=Parking",
    );
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.amenities).toEqual(["Wifi", "Parking"]);
  });

  it("handles mixed single and duplicate keys", () => {
    const searchParams = new URLSearchParams(
      "q=downtown&amenities=Wifi&amenities=AC&minPrice=500",
    );
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.q).toBe("downtown");
    expect(result.amenities).toEqual(["Wifi", "AC"]);
    expect(result.minPrice).toBe("500");
  });

  it("handles empty URLSearchParams", () => {
    const searchParams = new URLSearchParams();
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result).toEqual({});
  });

  it("handles three or more duplicate values", () => {
    const searchParams = new URLSearchParams(
      "amenities=Wifi&amenities=AC&amenities=Parking&amenities=Kitchen",
    );
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.amenities).toEqual(["Wifi", "AC", "Parking", "Kitchen"]);
  });

  it("preserves order of values", () => {
    const searchParams = new URLSearchParams(
      "languages=en&languages=es&languages=fr",
    );
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.languages).toEqual(["en", "es", "fr"]);
  });

  it("handles empty string values", () => {
    const searchParams = new URLSearchParams("q=&minPrice=");
    const result = buildRawParamsFromSearchParams(searchParams);

    expect(result.q).toBe("");
    expect(result.minPrice).toBe("");
  });

  it("handles special characters in values", () => {
    const searchParams = new URLSearchParams("q=Austin%2C+TX&sort=price_asc");
    const result = buildRawParamsFromSearchParams(searchParams);

    // URLSearchParams automatically decodes the values
    expect(result.q).toBe("Austin, TX");
    expect(result.sort).toBe("price_asc");
  });
});
