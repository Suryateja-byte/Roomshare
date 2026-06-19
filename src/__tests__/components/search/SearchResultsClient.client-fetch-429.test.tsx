/**
 * Regression test for audit #19:
 * When the client-side search fetch hits the rate limit (HTTP 429), the user
 * must see a friendly "Too many requests" message instead of the previous
 * silent degrade (which left stale results with no feedback). A subsequent
 * successful fetch must clear that message.
 *
 * This lives in its own file because it needs a MUTABLE useSearchParams mock to
 * drive the client-fetch effect (the param change is what triggers the fetch),
 * which the shared static mock in SearchResultsClient.test.tsx cannot provide.
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { ListingData } from "@/lib/data";

const mockRouterRefresh = jest.fn();

// Mutable search-params value so a rerender can simulate a URL change, which is
// what drives the client-side search fetch effect.
let currentSearchParams = new URLSearchParams("q=test&lat=30.2&lng=-97.7");

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
  useRouter: () => ({ refresh: mockRouterRefresh }),
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

jest.mock("@/app/search/actions", () => ({
  fetchMoreListings: jest.fn(),
}));

jest.mock("@/app/actions/filter-suggestions", () => ({
  getFilterSuggestions: jest.fn(async () => []),
}));

jest.mock("@/lib/search/split-stay", () => ({
  findSplitStays: jest.fn(() => []),
}));

jest.mock("@/lib/search/search-telemetry-client", () => ({
  emitSearchClientMetric: jest.fn(),
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

const baseProps = {
  initialListings: [createMockListing("1"), createMockListing("2")],
  initialNextCursor: "cursor-1",
  initialTotal: 10,
  savedListingIds: [],
  searchParamsString: "q=test&lat=30.2&lng=-97.7",
  filterParams: {},
  query: "test",
  browseMode: false,
  hasConfirmedZeroResults: false,
  filterSuggestions: [],
  clientSideSearchEnabled: true,
};

describe("SearchResultsClient client-fetch rate limiting (audit #19)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams("q=test&lat=30.2&lng=-97.7");
  });

  it("surfaces a friendly message when the client search fetch returns 429", async () => {
    // Favorites + search-count + search fetches all funnel through global.fetch.
    // Return 429 only for the search-list endpoint; everything else is fine.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/search/listings")) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: "Too many requests" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ savedIds: [] }),
      } as Response;
    }) as typeof fetch;

    const { rerender } = render(<SearchResultsClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
    });

    // Drive a URL change → triggers the client-side search fetch (which 429s).
    currentSearchParams = new URLSearchParams("q=test&lat=30.3&lng=-97.8");
    rerender(<SearchResultsClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
    });

    // SSR results remain visible (silent-degrade preserved, just now with feedback).
    expect(screen.getByTestId("listing-1")).toBeInTheDocument();
  });

  it("clears the rate-limit message after a subsequent successful fetch", async () => {
    let searchCallCount = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/search/listings")) {
        searchCallCount += 1;
        if (searchCallCount === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: "Too many requests" }),
          } as Response;
        }
        // Second search succeeds (HTTP 200). The OK branch clears loadError before
        // the queryHash staleness check, so the rate-limit message is removed even
        // if this payload is later discarded as stale.
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kind: "ok",
            data: {
              items: [createMockListing("9")],
              total: 1,
              nextCursor: null,
              nearMatchExpansion: undefined,
              vibeAdvisory: undefined,
            },
            meta: { queryHash: "stale-hash-does-not-match" },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ savedIds: [] }),
      } as Response;
    }) as typeof fetch;

    const { rerender } = render(<SearchResultsClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("listing-1")).toBeInTheDocument();
    });

    // First URL change → 429 → message shown.
    currentSearchParams = new URLSearchParams("q=test&lat=30.3&lng=-97.8");
    rerender(<SearchResultsClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
    });

    // Second URL change → the search fetch is attempted again and clears the error
    // on the OK branch (setLoadError(null)).
    currentSearchParams = new URLSearchParams("q=test&lat=30.4&lng=-97.9");
    rerender(<SearchResultsClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.queryByText(/Too many requests/i)).not.toBeInTheDocument();
    });
  });
});
