jest.mock("@/lib/prisma", () => ({
  prisma: {
    savedSearch: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/search/search-telemetry", () => ({
  recordLegacyUrlUsage: jest.fn(),
}));

const mockEvaluateSavedSearchAlertPaywall = jest.fn();
jest.mock("@/lib/payments/search-alert-paywall", () => ({
  evaluateSavedSearchAlertPaywall: (...args: unknown[]) =>
    mockEvaluateSavedSearchAlertPaywall(...args),
  resolveSavedSearchEffectiveAlertState: jest.requireActual(
    "@/lib/payments/search-alert-paywall"
  ).resolveSavedSearchEffectiveAlertState,
}));

import { auth } from "@/auth";
import { getMySavedSearches } from "@/app/actions/saved-search";
import { prisma } from "@/lib/prisma";
import { buildSearchUrl, type SearchFilters } from "@/lib/search-utils";
import { recordLegacyUrlUsage } from "@/lib/search/search-telemetry";

const FUTURE_MOVE_IN_DATE = "2027-02-01";

/**
 * Saved-search reopen intentionally excludes pagination aliases. The read-path
 * schema tolerates unknown keys for backward compatibility, but `SearchFilters`
 * has no `page`/`cursor`, `buildSearchUrl` omits pagination, and the write
 * schema strips those keys for newly saved searches.
 */
const SAVED_SEARCH_LEGACY_CASES = [
  {
    name: "startDate -> moveInDate",
    alias: "startDate",
    legacyFilters: { startDate: FUTURE_MOVE_IN_DATE },
    expectedCanonicalFilters: { moveInDate: FUTURE_MOVE_IN_DATE },
    expectedCanonicalUrl: `/search?moveInDate=${FUTURE_MOVE_IN_DATE}`,
  },
  {
    name: "minBudget -> minPrice",
    alias: "minBudget",
    legacyFilters: { minBudget: 500 },
    expectedCanonicalFilters: { minPrice: 500 },
    expectedCanonicalUrl: "/search?minPrice=500",
  },
  {
    name: "maxBudget -> maxPrice",
    alias: "maxBudget",
    legacyFilters: { maxBudget: 2200 },
    expectedCanonicalFilters: { maxPrice: 2200 },
    expectedCanonicalUrl: "/search?maxPrice=2200",
  },
  {
    name: "minAvailableSlots -> minSlots",
    alias: "minAvailableSlots",
    legacyFilters: { minAvailableSlots: 2 },
    expectedCanonicalFilters: { minSlots: 2 },
    expectedCanonicalUrl: "/search?minSlots=2",
  },
  {
    name: "where -> locationLabel",
    alias: "where",
    legacyFilters: { where: "Austin" },
    expectedCanonicalFilters: { locationLabel: "Austin" },
    expectedCanonicalUrl: "/search?locationLabel=Austin",
  },
] as const;

describe("saved search reopen canonicalization", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-123" },
    });
    mockEvaluateSavedSearchAlertPaywall.mockResolvedValue({
      enabled: true,
      mode: "PASS_ACTIVE",
      activePassExpiresAt: "2026-12-31T00:00:00.000Z",
      requiresPurchase: false,
      offers: [],
    });
  });

  it.each(SAVED_SEARCH_LEGACY_CASES)(
    "normalizes $name before reopening",
    async ({
      alias,
      legacyFilters,
      expectedCanonicalFilters,
      expectedCanonicalUrl,
    }) => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        {
          id: "legacy-search",
          name: "Legacy Search",
          createdAt: new Date("2026-04-17T00:00:00.000Z"),
          alertEnabled: true,
          filters: legacyFilters,
        },
      ]);

      const searches = await getMySavedSearches();
      const reopenedFilters = searches[0].filters as SearchFilters;

      expect(reopenedFilters).toEqual(
        expect.objectContaining(expectedCanonicalFilters)
      );
      expect(reopenedFilters).not.toHaveProperty(alias);
      expect(buildSearchUrl(reopenedFilters)).toBe(expectedCanonicalUrl);
      expect(recordLegacyUrlUsage).toHaveBeenCalledTimes(1);
      expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
        alias,
        surface: "saved-search",
      });
    }
  );
});
