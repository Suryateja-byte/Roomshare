import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import SearchPage from "@/app/search/page";

const mockGetListingsPaginated = jest.fn();
const mockCheckServerComponentRateLimit = jest.fn();
const mockRecordSearchRequestLatency = jest.fn();
let lastInlineFilterStripProps: {
  desktopSummary?: {
    total: number | null;
    visibleCount: number;
    locationLabel?: string;
    browseMode?: boolean;
  };
  currentSort?: string;
  hasResults?: boolean;
} | null = null;

jest.mock("@/lib/data", () => ({
  getListingsPaginated: (...args: unknown[]) =>
    mockGetListingsPaginated(...args),
}));

jest.mock("@/components/search/SearchResultsClient", () => ({
  SearchResultsClient: function MockSearchResultsClient() {
    return <div data-testid="search-results-client">Results client</div>;
  },
}));

jest.mock("@/components/search/SearchResultsErrorBoundary", () => ({
  SearchResultsErrorBoundary: function MockSearchResultsErrorBoundary({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/components/search/SearchResultsLoadingWrapper", () => ({
  SearchResultsLoadingWrapper: function MockSearchResultsLoadingWrapper({
    children,
  }: {
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
}));

jest.mock("@/components/search/InlineFilterStrip", () => ({
  InlineFilterStrip: function MockInlineFilterStrip(props: {
    desktopSummary?: {
      total: number | null;
      visibleCount: number;
      locationLabel?: string;
      browseMode?: boolean;
    };
    currentSort?: string;
    hasResults?: boolean;
  }) {
    lastInlineFilterStripProps = props;

    const heading = props.desktopSummary
      ? `${props.desktopSummary.total === null ? "100+" : props.desktopSummary.total} ${
          props.desktopSummary.total === 1 ? "place" : "places"
        }${
          props.desktopSummary.locationLabel
            ? ` in ${props.desktopSummary.locationLabel}`
            : ""
        }`
      : null;

    return (
      <div data-testid="mock-inline-filter-strip">
        {heading ? <h1 id="search-results-heading">{heading}</h1> : null}
      </div>
    );
  },
}));

jest.mock("@/lib/search-params", () => ({
  parseSearchParams: jest.fn(() => ({
    q: "Chicago",
    locationLabel: "Chicago",
    what: undefined,
    filterParams: {},
    requestedPage: 1,
    sortOption: "recommended",
    boundsRequired: false,
    browseMode: false,
  })),
  buildRawParamsFromSearchParams: jest.fn(() => ({})),
}));

jest.mock("@/lib/search/search-v2-service", () => ({
  executeSearchV2: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    searchV2: false,
    clientSideSearch: false,
  },
}));

jest.mock("@/lib/timeout-wrapper", () => ({
  withTimeout: (promise: Promise<unknown>) => promise,
  DEFAULT_TIMEOUTS: {
    DATABASE: 1000,
  },
}));

jest.mock("@/lib/constants", () => ({
  DEFAULT_PAGE_SIZE: 12,
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
}));

jest.mock("@/lib/circuit-breaker", () => ({
  circuitBreakers: {
    searchV2: {
      execute: jest.fn(),
    },
  },
  isCircuitOpenError: jest.fn(() => false),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  checkServerComponentRateLimit: (...args: unknown[]) =>
    mockCheckServerComponentRateLimit(...args),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/search/search-response", () => ({
  createSearchResponseMeta: jest.fn(() => ({
    queryHash: "hash",
    backendSource: "v1-fallback",
  })),
  getSearchQueryHash: jest.fn(() => "hash"),
}));

jest.mock("@/lib/search/search-query", () => ({
  buildSeoCanonicalSearchUrl: jest.fn(() => "/search"),
  normalizeSearchQuery: jest.fn((query: Record<string, string>) => query),
  serializeSearchQuery: jest.fn(
    (
      query: Record<string, string>,
      _options?: { includePagination?: boolean }
    ) => new URLSearchParams(query)
  ),
}));

jest.mock("@/lib/search/testing/search-scenarios", () => ({
  buildScenarioSearchListState: jest.fn(),
  resolveSearchScenario: jest.fn(() => null),
  SEARCH_SCENARIO_HEADER: "x-search-scenario",
}));

jest.mock("@/lib/search/search-telemetry", () => ({
  recordSearchRequestLatency: (...args: unknown[]) =>
    mockRecordSearchRequestLatency(...args),
  recordSearchV2Fallback: jest.fn(),
  recordSearchZeroResults: jest.fn(),
}));

describe("SearchPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastInlineFilterStripProps = null;
    mockCheckServerComponentRateLimit.mockResolvedValue({ allowed: true });
    mockGetListingsPaginated.mockResolvedValue({
      items: [
        { id: "listing-1", title: "Listing 1" },
        { id: "listing-2", title: "Listing 2" },
      ],
      total: 20,
      nextCursor: null,
    });
  });

  it("passes desktop summary into the inline filter strip and avoids a duplicate desktop heading", async () => {
    render(
      await SearchPage({ searchParams: Promise.resolve({ q: "Chicago" }) })
    );

    expect(lastInlineFilterStripProps?.desktopSummary).toEqual({
      total: 20,
      visibleCount: 2,
      locationLabel: "Chicago",
      browseMode: false,
    });
    expect(lastInlineFilterStripProps?.currentSort).toBe("recommended");
    expect(lastInlineFilterStripProps?.hasResults).toBe(true);
    expect(screen.getByTestId("mock-inline-filter-strip")).toBeInTheDocument();
    expect(document.querySelectorAll("#search-results-heading")).toHaveLength(
      1
    );
  });
});
