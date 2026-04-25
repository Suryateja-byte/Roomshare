import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { PUBLIC_CACHE_INVALIDATED_EVENT } from "@/lib/public-cache/client";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { ListingData } from "@/lib/data";

const mockRouterRefresh = jest.fn();
const mockSetIsV2Enabled = jest.fn();
const mockSetPendingQueryHash = jest.fn();
const mockSetV2MapData = jest.fn();
const mockSetSearchResultsLabel = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=test"),
  useRouter: () => ({
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

jest.mock("@/components/listings/ListingCard", () => ({
  __esModule: true,
  default: ({ listing }: { listing: ListingData }) => (
    <div data-testid={`listing-${listing.id}`}>{listing.title}</div>
  ),
}));

jest.mock("@/components/search/ListingCardErrorBoundary", () => ({
  ListingCardErrorBoundary: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
}));

jest.mock("@/components/listings/NearMatchSeparator", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/ZeroResultsSuggestions", () => ({
  __esModule: true,
  default: () => <div data-testid="zero-results-suggestions" />,
}));

jest.mock("@/components/SaveSearchButton", () => ({
  __esModule: true,
  default: () => <button type="button">Save Search</button>,
}));

jest.mock("@/components/search/TotalPriceToggle", () => ({
  TotalPriceToggle: () => <button type="button">Toggle Price</button>,
}));

jest.mock("@/components/search/SplitStayCard", () => ({
  SplitStayCard: () => <div data-testid="split-stay-card" />,
}));

jest.mock("@/components/search/ExpandSearchSuggestions", () => ({
  ExpandSearchSuggestions: () => null,
}));

jest.mock("@/app/search/actions", () => ({
  fetchMoreListings: jest.fn(),
}));

jest.mock("@/app/actions/filter-suggestions", () => ({
  getFilterSuggestions: jest.fn(async () => []),
}));

jest.mock("@/lib/search/split-stay", () => ({
  findSplitStays: jest.fn(() => []),
}));

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
    setSearchResultsLabel: mockSetSearchResultsLabel,
  }),
}));

jest.mock("@/contexts/SearchTestScenarioContext", () => ({
  useSearchTestScenario: () => null,
}));

jest.mock("@/contexts/SearchV2DataContext", () => ({
  useSearchV2Setters: () => ({
    setIsV2Enabled: mockSetIsV2Enabled,
    setPendingQueryHash: mockSetPendingQueryHash,
  }),
  useV2MapDataSetter: () => ({
    setV2MapData: mockSetV2MapData,
    dataVersion: 0,
  }),
}));

function createMockListing(id: string): ListingData {
  return {
    id,
    title: `Listing ${id}`,
    price: 1100,
    description: "Test listing",
    location: { city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431 },
    amenities: ["Wifi"],
    availableSlots: 1,
    totalSlots: 2,
    images: ["/test.jpg"],
    houseRules: [],
    householdLanguages: [],
    publicAvailability: buildPublicAvailability({
      availableSlots: 1,
      totalSlots: 2,
    }),
  };
}

describe("SearchResultsClient public cache invalidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ savedIds: [] }),
    }) as typeof fetch;
  });

  it("refreshes the current search route when public cache is invalidated", async () => {
    render(
      <SearchResultsClient
        initialListings={[createMockListing("1"), createMockListing("2")]}
        initialNextCursor="cursor-1"
        initialTotal={2}
        savedListingIds={[]}
        searchParamsString="q=test"
        filterParams={{}}
        query="test"
        browseMode={false}
        hasConfirmedZeroResults={false}
        filterSuggestions={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PUBLIC_CACHE_INVALIDATED_EVENT, {
          detail: { cacheFloorToken: "token-2" },
        })
      );
    });

    expect(mockSetPendingQueryHash).toHaveBeenCalledWith(null);
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Results refreshed to keep public availability accurate.")
    ).toBeInTheDocument();
  });
});
