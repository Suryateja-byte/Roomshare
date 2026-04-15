/**
 * Tests for SearchResultsClient component
 *
 * Coverage:
 * - Deduplication via seenIdsRef (prevents duplicate listings)
 * - 60-item accumulation cap (MAX_ACCUMULATED)
 * - Cursor reset on filter change (component remounts with key)
 * - Error handling for failed loads
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { fetchMoreListings } from "@/app/search/actions";
import type { ListingData } from "@/lib/data";
import { getFilterSuggestions } from "@/app/actions/filter-suggestions";
import { findSplitStays } from "@/lib/search/split-stay";
import { buildPublicAvailability } from "@/lib/search/public-availability";

const mockListingCard = jest.fn(
  ({
    listing,
    href,
  }: {
    listing: ListingData;
    href?: string;
  }) => (
    <div
      data-testid={`listing-${listing.id}`}
      data-href={href ?? `/listings/${listing.id}`}
    >
      {listing.title}
    </div>
  )
);

const mockSplitStayCard = jest.fn(
  (_props: Record<string, unknown>) => (
    <div data-testid="split-stay-card">Split Stay</div>
  )
);

// Mock fetchMoreListings server action
jest.mock("@/app/search/actions", () => ({
  fetchMoreListings: jest.fn(),
}));

jest.mock("@/app/actions/filter-suggestions", () => ({
  getFilterSuggestions: jest.fn(async () => []),
}));

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  };
});

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock ListingCard to simplify testing
jest.mock("@/components/listings/ListingCard", () => {
  return function MockListingCard(props: {
    listing: ListingData;
    href?: string;
  }) {
    return mockListingCard(props);
  };
});

// Mock ZeroResultsSuggestions
jest.mock("@/components/ZeroResultsSuggestions", () => {
  return function MockZeroResultsSuggestions() {
    return <div data-testid="zero-results-suggestions">Suggestions</div>;
  };
});

// Mock SuggestedSearches
jest.mock("@/components/search/SuggestedSearches", () => {
  return function MockSuggestedSearches() {
    return <div data-testid="suggested-searches">Suggested Searches</div>;
  };
});

// Mock TotalPriceToggle
jest.mock("@/components/search/TotalPriceToggle", () => ({
  TotalPriceToggle: function MockTotalPriceToggle({
    showTotal,
    onToggle,
  }: {
    showTotal: boolean;
    onToggle: (v: boolean) => void;
  }) {
    return (
      <button
        data-testid="total-price-toggle"
        onClick={() => onToggle(!showTotal)}
      >
        {showTotal ? "Show Monthly" : "Show Total"}
      </button>
    );
  },
}));

// Mock SplitStayCard
jest.mock("@/components/search/SplitStayCard", () => ({
  SplitStayCard: function MockSplitStayCard(props: Record<string, unknown>) {
    return mockSplitStayCard(props);
  },
}));

// Mock findSplitStays
jest.mock("@/lib/search/split-stay", () => ({
  findSplitStays: jest.fn(() => []),
}));

// Mock SaveSearchButton (imports next-auth which uses ESM exports)
jest.mock("@/components/SaveSearchButton", () => {
  return function MockSaveSearchButton() {
    return <button data-testid="save-search-button">Save Search</button>;
  };
});

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
beforeAll(() => {
  Object.defineProperty(window, "sessionStorage", {
    value: {
      getItem: jest.fn((key: string) => mockSessionStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockSessionStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockSessionStorage[key];
      }),
      clear: jest.fn(() => {
        Object.keys(mockSessionStorage).forEach(
          (key) => delete mockSessionStorage[key]
        );
      }),
    },
    writable: true,
    configurable: true,
  });
});

// Mock performance.mark and performance.measure
beforeAll(() => {
  window.performance.mark = jest.fn();
  window.performance.measure = jest.fn();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ savedIds: [] }),
  })) as jest.Mock;
});

const createMockListing = (id: string, title?: string): ListingData => ({
  id,
  title: title || `Listing ${id}`,
  price: 1000,
  description: "Test description",
  location: { city: "Test City", state: "CA", lat: 37.7749, lng: -122.4194 },
  amenities: ["WiFi"],
  availableSlots: 1,
  totalSlots: 2,
  images: ["/test.jpg"],
  houseRules: [],
  householdLanguages: [],
  publicAvailability: buildPublicAvailability({
    availableSlots: 1,
    totalSlots: 2,
  }),
});

const defaultProps = {
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
  sortOption: "relevance",
};

describe("SearchResultsClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key]
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ savedIds: [] }),
    });
    (getFilterSuggestions as jest.Mock).mockResolvedValue([]);
  });

  describe("rendering", () => {
    it("renders initial listings", () => {
      render(<SearchResultsClient {...defaultProps} />);

      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
      expect(screen.getByTestId("listing-2")).toBeInTheDocument();
    });

    it("renders result count", () => {
      render(<SearchResultsClient {...defaultProps} />);

      const matches = screen.getAllByText("10 places in test");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("marks browse mode on the search shell without rendering suggested searches", () => {
      const { container } = render(
        <SearchResultsClient {...defaultProps} browseMode={true} query="" />
      );

      expect(container.querySelector('[data-testid="search-shell"]')).toHaveAttribute(
        "data-browse-mode",
        "true"
      );
      expect(screen.queryByTestId("suggested-searches")).not.toBeInTheDocument();
    });

    it("passes canonical listing detail range hrefs when search includes moveInDate and endDate", () => {
      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&moveInDate=2026-05-01&endDate=2026-06-01"
        />
      );

      expect(screen.getByTestId("listing-1")).toHaveAttribute(
        "data-href",
        "/listings/1?startDate=2026-05-01&endDate=2026-06-01"
      );
      expect(screen.getByTestId("listing-2")).toHaveAttribute(
        "data-href",
        "/listings/2?startDate=2026-05-01&endDate=2026-06-01"
      );
    });

    it("keeps generic listing detail hrefs when search only includes moveInDate", () => {
      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&moveInDate=2026-05-01"
        />
      );

      expect(screen.getByTestId("listing-1")).toHaveAttribute(
        "data-href",
        "/listings/1"
      );
      expect(screen.getByTestId("listing-2")).toHaveAttribute(
        "data-href",
        "/listings/2"
      );
    });

    it("passes canonical listing detail date params through to split-stay cards", () => {
      (findSplitStays as jest.Mock).mockReturnValueOnce([
        {
          first: createMockListing("split-1", "Split One"),
          second: createMockListing("split-2", "Split Two"),
          combinedPrice: 4300,
          splitLabel: "2 mo + 2 mo",
        },
      ]);

      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&moveInDate=2026-05-01&endDate=2026-06-01"
        />
      );

      expect(screen.getByTestId("split-stay-card")).toBeInTheDocument();
      expect(mockSplitStayCard).toHaveBeenCalledWith(
        expect.objectContaining({
          listingDetailDateParams: {
            moveInDate: "2026-05-01",
            endDate: "2026-06-01",
            startDate: null,
          },
        })
      );
    });

    it("keeps the save-search callout desktop-only", async () => {
      render(<SearchResultsClient {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Don't miss out")).toBeInTheDocument();
      });

      const callout = screen.getByText("Don't miss out").closest("section");
      expect(callout).toHaveClass("hidden");
      expect(callout).toHaveClass("md:flex");
    });

    it("renders zero results state when hasConfirmedZeroResults is true", () => {
      render(
        <SearchResultsClient
          {...defaultProps}
          initialListings={[]}
          initialNextCursor={null}
          initialTotal={0}
          hasConfirmedZeroResults={true}
        />
      );

      expect(screen.getByText("No matches found")).toBeInTheDocument();
    });

    it("renders Show more button when there is a next cursor", () => {
      render(<SearchResultsClient {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /show more/i })
      ).toBeInTheDocument();
    });

    it("does not render Show more button when no next cursor", () => {
      render(
        <SearchResultsClient {...defaultProps} initialNextCursor={null} />
      );

      expect(
        screen.queryByRole("button", { name: /show more/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("deduplication via seenIdsRef", () => {
    it("prevents duplicate listings from being added on load more", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        items: [
          createMockListing("1"), // Duplicate
          createMockListing("3"), // New
          createMockListing("2"), // Duplicate
          createMockListing("4"), // New
        ],
        nextCursor: "cursor-2",
        hasNextPage: true,
      });

      render(<SearchResultsClient {...defaultProps} />);

      // Initial state has listings 1 and 2
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
      expect(screen.getByTestId("listing-2")).toBeInTheDocument();

      // Click load more
      const loadMoreButton = screen.getByRole("button", { name: /show more/i });
      fireEvent.click(loadMoreButton);

      await waitFor(() => {
        // Should have listings 1, 2, 3, 4 (deduped, no duplicate 1 or 2)
        expect(screen.getByTestId("listing-3")).toBeInTheDocument();
        expect(screen.getByTestId("listing-4")).toBeInTheDocument();
      });

      // Verify only 4 listings are rendered (not 6 with duplicates)
      const listingElements = screen.getAllByTestId(/^listing-/);
      expect(listingElements).toHaveLength(4);
    });

    it("maintains deduplication across multiple load more calls", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;

      // First load more returns listing 3
      mockFetch.mockResolvedValueOnce({
        items: [createMockListing("3")],
        nextCursor: "cursor-2",
        hasNextPage: true,
      });

      // Second load more tries to return duplicates 1, 2, 3 and new 4
      mockFetch.mockResolvedValueOnce({
        items: [
          createMockListing("1"),
          createMockListing("2"),
          createMockListing("3"),
          createMockListing("4"),
        ],
        nextCursor: "cursor-3",
        hasNextPage: true,
      });

      render(<SearchResultsClient {...defaultProps} />);

      // First load more
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));
      await waitFor(() => {
        expect(screen.getByTestId("listing-3")).toBeInTheDocument();
      });

      // Second load more
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));
      await waitFor(() => {
        expect(screen.getByTestId("listing-4")).toBeInTheDocument();
      });

      // Should have exactly 4 unique listings
      const listingElements = screen.getAllByTestId(/^listing-/);
      expect(listingElements).toHaveLength(4);
    });
  });

  describe("60-item accumulation cap (MAX_ACCUMULATED)", () => {
    it("stops showing load more button when reaching 60 items", async () => {
      // Start with 55 listings
      const initialListings = Array.from({ length: 55 }, (_, i) =>
        createMockListing(`initial-${i}`)
      );

      const mockFetch = fetchMoreListings as jest.Mock;
      // Return 10 more (would be 65 total, but capped at 60 display)
      mockFetch.mockResolvedValueOnce({
        items: Array.from({ length: 10 }, (_, i) =>
          createMockListing(`new-${i}`)
        ),
        nextCursor: "cursor-2",
        hasNextPage: true,
      });

      render(
        <SearchResultsClient
          {...defaultProps}
          initialListings={initialListings}
          initialTotal={100}
        />
      );

      // Click load more
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        // After loading, we should have 65 listings in state but cap message should appear
        // The load more button should be hidden since we've reached the cap
        expect(screen.getByText(/Showing 65 results/i)).toBeInTheDocument();
      });

      // Load more button should not be present (capped)
      expect(
        screen.queryByRole("button", { name: /show more/i })
      ).not.toBeInTheDocument();
    });

    it("shows refinement message when cap is reached", async () => {
      // Start with exactly 60 listings
      const initialListings = Array.from({ length: 60 }, (_, i) =>
        createMockListing(`listing-${i}`)
      );

      render(
        <SearchResultsClient
          {...defaultProps}
          initialListings={initialListings}
          initialNextCursor="cursor-next"
          initialTotal={100}
        />
      );

      // Should show refinement message instead of load more
      expect(screen.getByText(/adjusting your filters/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /show more/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("cursor reset on filter change", () => {
    it("resets state when searchParamsString changes", () => {
      const { rerender } = render(<SearchResultsClient {...defaultProps} />);

      // Initial listings
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
      expect(screen.getByTestId("listing-2")).toBeInTheDocument();

      // Simulate filter change by changing searchParamsString (component would remount with new key)
      const newListings = [
        createMockListing("new-1"),
        createMockListing("new-2"),
      ];
      rerender(
        <SearchResultsClient
          {...defaultProps}
          initialListings={newListings}
          searchParamsString="q=different"
          initialNextCursor="new-cursor"
        />
      );

      // Should now show new listings
      expect(screen.getByTestId("listing-new-1")).toBeInTheDocument();
      expect(screen.getByTestId("listing-new-2")).toBeInTheDocument();

      // Old listings should not be present
      expect(screen.queryByTestId("listing-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("listing-2")).not.toBeInTheDocument();
    });

    it("initializes seenIdsRef with new initial listings on remount", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;

      // Set up initial component
      const { rerender } = render(<SearchResultsClient {...defaultProps} />);

      // Simulate remount with new initial listings that have the same IDs
      const newInitialListings = [
        createMockListing("1", "New Title 1"),
        createMockListing("2", "New Title 2"),
      ];

      rerender(
        <SearchResultsClient
          {...defaultProps}
          initialListings={newInitialListings}
          searchParamsString="q=new-search"
        />
      );

      // Now load more should be able to add items with IDs that existed in the OLD seenIds
      // but since component remounted, seenIds should be fresh
      mockFetch.mockResolvedValueOnce({
        items: [createMockListing("3")],
        nextCursor: null,
        hasNextPage: false,
      });

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(screen.getByTestId("listing-3")).toBeInTheDocument();
      });
    });

    it("uses updated search params for fetchMore after filter/map change", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch
        .mockResolvedValueOnce({
          items: [createMockListing("old-extra")],
          nextCursor: "cursor-2",
          hasNextPage: true,
        })
        .mockResolvedValueOnce({
          items: [createMockListing("new-extra")],
          nextCursor: null,
          hasNextPage: false,
        });

      // Use a key wrapper so changing searchParamsString unmounts/remounts (matching production behavior)
      const Wrapper = ({ params }: { params: string }) => (
        <SearchResultsClient
          {...defaultProps}
          initialListings={
            params === "q=test"
              ? defaultProps.initialListings
              : [createMockListing("new-1")]
          }
          initialNextCursor={
            params === "q=test" ? defaultProps.initialNextCursor : "new-cursor"
          }
          searchParamsString={params}
          query={params === "q=test" ? "test" : ""}
          key={params}
        />
      );

      const { rerender } = render(<Wrapper params="q=test" />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));
      await waitFor(() => {
        expect(screen.getByTestId("listing-old-extra")).toBeInTheDocument();
      });

      const newParams =
        "languages=te&minLat=37.7&maxLat=37.85&minLng=-122.5&maxLng=-122.3";
      rerender(<Wrapper params={newParams} />);

      expect(screen.queryByTestId("listing-old-extra")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(screen.getByTestId("listing-new-extra")).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "new-cursor",
        expect.objectContaining({
          languages: "te",
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.5",
          maxLng: "-122.3",
        }),
        expect.any(String),
        null
      );
      expect(
        (
          mockFetch.mock.calls[1][1] as Record<
            string,
            string | string[] | undefined
          >
        ).q
      ).toBeUndefined();
    });
  });

  describe("error handling for failed loads", () => {
    it("displays error message when fetchMoreListings fails", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load more results/i)
        ).toBeInTheDocument();
      });
    });

    it("displays rate limit friendly message", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockRejectedValueOnce(new Error("Rate limit exceeded"));

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
      });
    });

    it("displays generic error message for non-Error throws", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockRejectedValueOnce("Unknown failure");

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load more results/i)
        ).toBeInTheDocument();
      });
    });

    it("shows Try again button after error", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /try again/i })
        ).toBeInTheDocument();
      });
    });

    it("retries loading when Try again is clicked", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      mockFetch.mockResolvedValueOnce({
        items: [createMockListing("3")],
        nextCursor: null,
        hasNextPage: false,
      });

      render(<SearchResultsClient {...defaultProps} />);

      // First click fails
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load more results/i)
        ).toBeInTheDocument();
      });

      // Click try again
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));

      await waitFor(() => {
        expect(screen.getByTestId("listing-3")).toBeInTheDocument();
      });

      // Error message should be cleared
      expect(
        screen.queryByText(/Failed to load more results/i)
      ).not.toBeInTheDocument();
    });

    it("clears previous error when new load succeeds", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;

      // First call fails
      mockFetch.mockRejectedValueOnce(new Error("First error"));

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load more results/i)
        ).toBeInTheDocument();
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        items: [createMockListing("3")],
        nextCursor: "cursor-2",
        hasNextPage: true,
      });

      fireEvent.click(screen.getByRole("button", { name: /try again/i }));

      await waitFor(() => {
        expect(
          screen.queryByText(/Failed to load more results/i)
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("listing-3")).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("shows loading indicator while fetching", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      let resolvePromise: (value: unknown) => void;
      // Create the deferred promise eagerly so resolvePromise is assigned
      // before any mock invocation (avoids React 18 batching timing issues)
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pending);

      render(<SearchResultsClient {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/Loading/i)).toBeInTheDocument();
      });

      // Resolve the promise
      resolvePromise!({
        items: [createMockListing("3")],
        nextCursor: null,
        hasNextPage: false,
      });

      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });
    });

    it("disables load more button while loading", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      let resolvePromise: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pending);

      render(<SearchResultsClient {...defaultProps} />);

      const loadMoreButton = screen.getByRole("button", { name: /show more/i });
      fireEvent.click(loadMoreButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
      });

      resolvePromise!({
        items: [],
        nextCursor: null,
        hasNextPage: false,
      });
    });

    it("prevents multiple simultaneous load more requests", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      let resolvePromise: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValue(pending);

      render(<SearchResultsClient {...defaultProps} />);

      const loadMoreButton = screen.getByRole("button", { name: /show more/i });

      // Click multiple times rapidly
      fireEvent.click(loadMoreButton);
      fireEvent.click(loadMoreButton);
      fireEvent.click(loadMoreButton);

      // Should only call fetchMoreListings once
      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolvePromise!({
        items: [],
        nextCursor: null,
        hasNextPage: false,
      });
    });
  });

  describe("accessibility: load-more announcements", () => {
    it("announces loaded count after successful load-more", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        items: [createMockListing("3"), createMockListing("4")],
        nextCursor: "cursor-2",
        hasNextPage: true,
      });

      render(<SearchResultsClient {...defaultProps} />);

      // Click load more
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      await waitFor(() => {
        // The load-more announcement region (role="log") should contain the announcement
        const logRegion = screen.getByRole("log");
        expect(logRegion).toHaveTextContent(/loaded 2 more listings/i);
      });
    });

    it("does not announce on initial render", () => {
      render(<SearchResultsClient {...defaultProps} />);

      // The load-more announcement region should be empty on mount
      const logRegion = screen.getByRole("log");
      expect(logRegion).toHaveTextContent("");
    });

    it("sets aria-busy on feed during load-more", async () => {
      const mockFetch = fetchMoreListings as jest.Mock;
      let resolvePromise: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(pending);

      render(<SearchResultsClient {...defaultProps} />);

      const feed = screen.getByRole("feed");
      // Before loading, aria-busy should be false
      expect(feed).toHaveAttribute("aria-busy", "false");

      // Click load more
      fireEvent.click(screen.getByRole("button", { name: /show more/i }));

      // During loading, aria-busy should be true
      await waitFor(() => {
        expect(feed).toHaveAttribute("aria-busy", "true");
      });

      // Resolve fetch
      resolvePromise!({
        items: [createMockListing("3")],
        nextCursor: null,
        hasNextPage: false,
      });

      // After loading, aria-busy should be false
      await waitFor(() => {
        expect(feed).toHaveAttribute("aria-busy", "false");
      });
    });
  });

  describe("sessionStorage hydration", () => {
    it("hydrates showTotalPrice from sessionStorage after mount", async () => {
      mockSessionStorage["showTotalPrice"] = "true";

      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&leaseDuration=3 months"
        />
      );

      // After useEffect runs, it should show "Show Monthly" (meaning showTotalPrice is true)
      await waitFor(() => {
        const toggle = screen.getByTestId("total-price-toggle");
        expect(toggle).toHaveTextContent("Show Monthly");
      });
    });

    it("defaults to false when sessionStorage is empty", async () => {
      // Clear sessionStorage
      delete mockSessionStorage["showTotalPrice"];

      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&leaseDuration=3 months"
        />
      );

      // Should show "Show Total" (meaning showTotalPrice is false)
      const toggle = screen.getByTestId("total-price-toggle");
      expect(toggle).toHaveTextContent("Show Total");
    });

    it("handles invalid JSON in sessionStorage gracefully", async () => {
      mockSessionStorage["showTotalPrice"] = "not-valid-json";

      render(
        <SearchResultsClient
          {...defaultProps}
          searchParamsString="q=test&leaseDuration=3 months"
        />
      );

      // Should default to false when JSON parsing fails
      const toggle = screen.getByTestId("total-price-toggle");
      expect(toggle).toHaveTextContent("Show Total");
    });
  });
});
