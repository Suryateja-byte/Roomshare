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

import { auth } from "@/auth";
import { getMySavedSearches } from "@/app/actions/saved-search";
import { prisma } from "@/lib/prisma";
import { buildSearchUrl, type SearchFilters } from "@/lib/search-utils";
import { recordLegacyUrlUsage } from "@/lib/search/search-telemetry";

describe("saved search reopen canonicalization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-123" },
    });
  });

  it("normalizes legacy saved-search filters before reopening", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        id: "legacy-search",
        name: "Legacy Search",
        createdAt: new Date("2026-04-17T00:00:00.000Z"),
        filters: {
          startDate: "2027-02-01",
          minBudget: 500,
          minAvailableSlots: 2,
        },
      },
    ]);

    const searches = await getMySavedSearches();
    const reopenedFilters = searches[0].filters as SearchFilters;

    expect(reopenedFilters).toEqual(
      expect.objectContaining({
        moveInDate: "2027-02-01",
        minPrice: 500,
        minSlots: 2,
      })
    );
    expect(reopenedFilters).not.toHaveProperty("startDate");
    expect(reopenedFilters).not.toHaveProperty("minBudget");
    expect(reopenedFilters).not.toHaveProperty("minAvailableSlots");
    expect(buildSearchUrl(reopenedFilters)).toBe(
      "/search?minPrice=500&minSlots=2&moveInDate=2027-02-01"
    );
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "startDate",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "minBudget",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "minAvailableSlots",
      surface: "saved-search",
    });
  });
});
