import {
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import { getSearchQueryHash } from "@/lib/search/search-response";

const FUTURE_MOVE_IN_DATE = "2027-02-01";

const LEGACY_PARITY_CASES = [
  {
    name: "startDate -> moveInDate",
    legacy: `startDate=${FUTURE_MOVE_IN_DATE}`,
    canonical: `/search?moveInDate=${FUTURE_MOVE_IN_DATE}`,
  },
  {
    name: "minBudget -> minPrice",
    legacy: "minBudget=500",
    canonical: "/search?minPrice=500",
  },
  {
    name: "maxBudget -> maxPrice",
    legacy: "maxBudget=2200",
    canonical: "/search?maxPrice=2200",
  },
  {
    name: "minAvailableSlots -> minSlots",
    legacy: "minAvailableSlots=2",
    canonical: "/search?minSlots=2",
  },
  {
    name: "pageNumber -> page",
    legacy: "pageNumber=3",
    canonical: "/search?page=3",
  },
  {
    name: "cursorStack -> cursor",
    legacy: "cursorStack=cursor-token",
    canonical: "/search?cursor=cursor-token",
  },
  {
    name: "where stays byte-identical",
    legacy: "where=Austin",
    canonical: "/search?where=Austin",
  },
  {
    name: "combined legacy aliases collapse to one canonical string",
    legacy: `startDate=${FUTURE_MOVE_IN_DATE}&minBudget=500&maxBudget=2200`,
    canonical: `/search?maxPrice=2200&minPrice=500&moveInDate=${FUTURE_MOVE_IN_DATE}`,
  },
];

function canonicalize(queryString: string): string {
  return buildCanonicalSearchUrl(
    normalizeSearchQuery(new URLSearchParams(queryString))
  );
}

function hashOf(queryString: string): string {
  return getSearchQueryHash(
    normalizeSearchQuery(new URLSearchParams(queryString))
  );
}

describe("CFM-604 legacy URL parity", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it.each(LEGACY_PARITY_CASES)(
    "$name",
    ({ legacy, canonical }) => {
      const legacyCanonicalUrl = canonicalize(legacy);
      const canonicalCanonicalUrl = canonicalize(canonical.split("?")[1] ?? "");

      expect(hashOf(legacy)).toBe(hashOf(canonical.split("?")[1] ?? ""));
      expect(legacyCanonicalUrl).toBe(canonicalCanonicalUrl);
      expect(legacyCanonicalUrl).toBe(canonical);
      expect(
        canonicalize(legacyCanonicalUrl.split("?")[1] ?? "")
      ).toBe(canonical);
    }
  );
});
