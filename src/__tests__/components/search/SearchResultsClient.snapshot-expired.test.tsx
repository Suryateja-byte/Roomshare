/**
 * Regression (M-01): when a load-more returns snapshotExpired while client-side
 * search has populated clientFetchedListings (via a map-pan / filter client
 * fetch), the snapshotExpired branch must reset clientFetchedListings to null so
 * the refreshed SSR data wins. Otherwise the stale client-fetched listings keep
 * shadowing the refresh. See docs/search-feature-audit-2026-06-16.md.
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { fetchMoreListings } from "@/app/search/actions";
import {
  SEARCH_RESPONSE_VERSION,
  getSearchQueryHash,
} from "@/lib/search/search-response";
import { normalizeSearchQuery } from "@/lib/search/search-query";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { ListingData } from "@/lib/data";

const mockRouterRefresh = jest.fn();
let mockSearchParams = new URLSearchParams("q=test");

// The query hash the component will compute for the post-pan params; the client
// fetch response must echo it or the staleness guard rejects the response.
const CLIENT_QUERY_HASH = getSearchQueryHash(
  normalizeSearchQuery(new URLSearchParams("q=test&minPrice=500"))
);

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/components/listings/ListingCard", () => ({
  __esModule: true,
  default: ({ listing }: { listing: ListingData }) => (
    <div data-testid={`listing-${listing.id}`}>{listing.title}</div>
  ),
}));

jest.mock("@/components/search/ListingCardErrorBoundary", () => ({
  ListingCardErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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

jest.mock("@/app/search/actions", () => ({ fetchMoreListings: jest.fn() }));

jest.mock("@/app/actions/filter-suggestions", () => ({
  getFilterSuggestions: jest.fn(async () => []),
}));

jest.mock("@/lib/search/split-stay", () => ({ findSplitStays: jest.fn(() => []) }));

// Stable setter identities — the client-fetch effect depends on these, so fresh
// jest.fn() identities per render would make the effect re-run and abort its own
// in-flight fetch before it resolves.
const mockSetSearchResultsLabel = jest.fn();
const mockSetMobileResultsState = jest.fn();
const mockSetIsV2Enabled = jest.fn();
const mockSetPendingQueryHash = jest.fn();
const mockSetV2MapData = jest.fn();

jest.mock("@/contexts/MobileSearchContext", () => ({
  useMobileSearch: () => ({
    setSearchResultsLabel: mockSetSearchResultsLabel,
    setMobileResultsState: mockSetMobileResultsState,
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
  useV2MapDataSetter: () => ({ setV2MapData: mockSetV2MapData, dataVersion: 0 }),
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

describe("SearchResultsClient snapshot expiry with client-side search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams("q=test");
    // Client fetch returns a fresh listing (id 9); favorites returns no saved ids.
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/api/search/listings")) {
        return {
          ok: true,
          json: async () => ({
            kind: "ok",
            source: "v1-fallback",
            data: {
              items: [createMockListing("9")],
              total: 1,
              nextCursor: "client-cursor-1",
            },
            meta: {
              queryHash: CLIENT_QUERY_HASH,
              backendSource: "v1-fallback",
              responseVersion: SEARCH_RESPONSE_VERSION,
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ savedIds: [] }) };
    }) as unknown as typeof fetch;
  });

  it("clears client-fetched listings on snapshotExpired so the refresh wins", async () => {
    const props = {
      initialListings: [createMockListing("1"), createMockListing("2")],
      initialNextCursor: "cursor-1",
      initialTotal: 10,
      savedListingIds: [],
      searchParamsString: "q=test",
      filterParams: {},
      query: "test",
      browseMode: false,
      hasConfirmedZeroResults: false,
      filterSuggestions: [],
      clientSideSearchEnabled: true,
    };

    const { rerender } = render(<SearchResultsClient {...props} />);
    expect(await screen.findByTestId("listing-1")).toBeInTheDocument();

    // Simulate a map-pan / filter change → client fetch replaces the list with id 9.
    mockSearchParams = new URLSearchParams("q=test&minPrice=500");
    rerender(<SearchResultsClient {...props} />);

    expect(await screen.findByTestId("listing-9")).toBeInTheDocument();
    expect(screen.queryByTestId("listing-1")).not.toBeInTheDocument();

    // Load more returns snapshotExpired → client-fetched data must be dropped so
    // effectiveListings falls back to the (refreshed) initial SSR listings.
    (fetchMoreListings as jest.Mock).mockResolvedValue({
      items: [],
      nextCursor: null,
      hasNextPage: false,
      snapshotExpired: {
        queryHash: CLIENT_QUERY_HASH,
        reason: "search_contract_changed",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /show more/i }));

    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
      expect(screen.queryByTestId("listing-9")).not.toBeInTheDocument();
    });
  });
});
