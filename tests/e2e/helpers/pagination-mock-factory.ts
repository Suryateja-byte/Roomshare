/**
 * Pagination Mock Factory
 *
 * Generates mock listing data and sets up Playwright route interception
 * for testing the SearchResultsClient "load more" pagination flow.
 *
 * Strategy:
 * - The initial page load uses REAL data from the database (SSR).
 *   The DB has ~19 seed listings, so the first page shows 12 with a cursor.
 * - "Load more" uses a Next.js server action (fetchMoreListings), which the
 *   client invokes via a POST request with a `Next-Action` header.
 *   We intercept ONLY these POST requests and return mock data.
 * - This avoids the fragile RSC payload manipulation of SSR HTML and lets
 *   the initial page render normally with real React hydration.
 *
 * The component (SearchResultsClient) deduplicates by listing ID via seenIdsRef.
 * Mock listing IDs ("mock-listing-NNN") never collide with real DB IDs.
 */

import { Page, Route, Request } from "@playwright/test";

// ============================================================================
// Types
// ============================================================================

export interface MockListing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  roomType: string;
  location: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
}

export interface PaginationMockOptions {
  /**
   * Total number of EXTRA mock listings available for "load more".
   * The initial page uses real DB data (~12 items).
   * Set this to control how many additional items can be loaded.
   *
   * Example: totalLoadMoreItems: 48 means 4 load-more clicks of 12 each.
   * Combined with ~12 real initial items, total DOM count reaches ~60 (the cap).
   */
  totalLoadMoreItems: number;
  /** Items returned per load-more page (default: 12, matches ITEMS_PER_PAGE) */
  itemsPerPage?: number;
  /** Artificial delay in ms for load-more responses (default: 0) */
  delayMs?: number;
  /** Which load-more call index should fail, 1-based (0 = never fail) */
  failOnLoadMore?: number;
}

export interface PaginationMockHandle {
  /** Returns the number of server-action POST calls intercepted so far */
  loadMoreCallCount: () => number;
  /** Returns the number of successful load-more responses */
  successfulLoadCount: () => number;
  /** All mock listings generated for load-more responses */
  allMockListings: MockListing[];
}

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Create a single mock listing with deterministic fields.
 * All required ListingData fields are included so ListingCard renders correctly.
 */
export function createMockListing(
  index: number,
  overrides?: Partial<MockListing>,
): MockListing {
  const id = `mock-listing-${String(index).padStart(3, "0")}`;
  return {
    id,
    title: `Mock Room ${index + 1}`,
    description: `A comfortable room in San Francisco. Mock listing number ${index + 1} for pagination testing.`,
    price: 800 + index * 50,
    images: [],
    availableSlots: 1,
    totalSlots: 1,
    amenities: ["wifi", "kitchen"],
    houseRules: [],
    householdLanguages: ["en"],
    roomType: "private",
    location: {
      city: "San Francisco",
      state: "CA",
      lat: 37.74 + (index % 20) * 0.005,
      lng: -122.48 + (index % 20) * 0.006,
    },
    ...overrides,
  };
}

/**
 * Create a batch of mock listings starting at a given index.
 */
export function createListingBatch(
  startIndex: number,
  count: number,
): MockListing[] {
  return Array.from({ length: count }, (_, i) =>
    createMockListing(startIndex + i),
  );
}

// ============================================================================
// V2 API Response Builder (for direct API testing)
// ============================================================================

/**
 * Build a complete SearchV2Response object matching the /api/search/v2 shape.
 */
export function createSearchV2Response(options: {
  items: MockListing[];
  nextCursor?: string | null;
  totalCount?: number | null;
}): object {
  const { items, nextCursor = null, totalCount } = options;

  return {
    meta: {
      queryHash: "mock-query-hash-0000",
      generatedAt: new Date().toISOString(),
      mode: items.length >= 50 ? "geojson" : "pins",
    },
    list: {
      items: items.map((l) => ({
        id: l.id,
        title: l.title,
        price: l.price,
        image: l.images[0] ?? null,
        lat: l.location.lat,
        lng: l.location.lng,
      })),
      nextCursor,
      total: totalCount !== undefined ? totalCount : items.length,
    },
    map: {
      geojson: {
        type: "FeatureCollection" as const,
        features: items.map((l) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [l.location.lng, l.location.lat],
          },
          properties: {
            id: l.id,
            title: l.title,
            price: l.price,
            image: l.images[0] ?? null,
            availableSlots: l.availableSlots,
            ownerId: "mock-owner",
          },
        })),
      },
      ...(items.length < 50
        ? {
            pins: items.map((l) => ({
              id: l.id,
              lat: l.location.lat,
              lng: l.location.lng,
              price: l.price,
              tier: "primary" as const,
            })),
          }
        : {}),
    },
  };
}

/**
 * Build a FetchMoreResult object (the return value of the fetchMoreListings server action).
 */
export function createFetchMoreResult(options: {
  items: MockListing[];
  nextCursor: string | null;
  hasNextPage: boolean;
}) {
  return {
    items: options.items,
    nextCursor: options.nextCursor,
    hasNextPage: options.hasNextPage,
  };
}

// ============================================================================
// Cursor Encoding
// ============================================================================

function encodeMockCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset, _mock: true })).toString(
    "base64url",
  );
}

// ============================================================================
// RSC Flight Response Encoding
// ============================================================================

/**
 * Encode a plain JavaScript value as an RSC Flight response body.
 *
 * Used for server action return values. Next.js 14/15 server actions use
 * a multi-row format:
 *   Row 0: action metadata with reference to the result row
 *   Row 1: the actual return value
 *
 * Real format example:
 *   0:{"a":"$@1","f":"","b":"development"}
 *   1:{"items":[...],"nextCursor":"...","hasNextPage":true}
 *
 * The `$@1` reference in row 0 tells the RSC runtime that the action
 * result lives in row 1.
 *
 * NOTE: If the Next.js server action response format changes in future versions,
 * this function may need adjustment. The current format targets Next.js 14/15.
 */
function encodeAsRSCResponse(value: unknown): string {
  const row0 = JSON.stringify({ a: "$@1", f: "", b: "development" });
  const row1 = JSON.stringify(value);
  return `0:${row0}\n1:${row1}\n`;
}

// ============================================================================
// Main Setup Function
// ============================================================================

/**
 * Set up route interception for "load more" server action calls only.
 *
 * The initial page load is NOT intercepted -- it uses real data from the database.
 * Only POST requests with a `Next-Action` header to the /search page are intercepted.
 *
 * IMPORTANT: Call this BEFORE navigating to the search page.
 *
 * Usage:
 * ```ts
 * const mock = await setupPaginationMock(page, { totalLoadMoreItems: 48 });
 * await page.goto(`/search?${boundsQS}`);
 * // Initial page shows real DB data (~12 items with cursor)
 * await page.locator('button:has-text("Show more places")').click();
 * // Load more returns mock data
 * ```
 */
export async function setupPaginationMock(
  page: Page,
  options: PaginationMockOptions,
): Promise<PaginationMockHandle> {
  const {
    totalLoadMoreItems,
    itemsPerPage = 12,
    delayMs = 0,
    failOnLoadMore = 0,
  } = options;

  // Generate all mock listings for load-more responses
  const allMockListings = createListingBatch(0, totalLoadMoreItems);

  // State tracking
  let _loadMoreCallCount = 0;
  let _successfulLoadCount = 0;
  let _failedOnce = false;

  // Only intercept POST requests to the search page (server actions).
  // Use a regex that matches /search with optional query string.
  await page.route(/\/search(\?|$)/, async (route: Route, request: Request) => {
    const method = request.method();
    const isServerAction =
      method === "POST" && !!request.headers()["next-action"];

    // Only handle server action POST requests; pass everything else through
    if (!isServerAction) {
      await route.continue();
      return;
    }

    _loadMoreCallCount++;

    // -----------------------------------------------------------------------
    // Error simulation: abort on the specified call index (1-based)
    // -----------------------------------------------------------------------
    const shouldFail =
      failOnLoadMore > 0 &&
      _loadMoreCallCount === failOnLoadMore &&
      !_failedOnce;

    if (shouldFail) {
      _failedOnce = true;

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Abort the request to simulate a network/server error.
      // The component's catch block will set loadError state.
      await route.abort("failed");
      return;
    }

    // -----------------------------------------------------------------------
    // Success: return the next batch of mock listings
    // -----------------------------------------------------------------------
    _successfulLoadCount++;
    const offset = (_successfulLoadCount - 1) * itemsPerPage;
    const safeOffset = Math.min(offset, totalLoadMoreItems);
    const items = allMockListings.slice(safeOffset, safeOffset + itemsPerPage);
    const newHasMore = safeOffset + itemsPerPage < totalLoadMoreItems;
    const newNextCursor = newHasMore
      ? encodeMockCursor(safeOffset + itemsPerPage)
      : null;

    const result = createFetchMoreResult({
      items,
      nextCursor: newNextCursor,
      hasNextPage: newHasMore,
    });

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({
      status: 200,
      contentType: "text/x-component; charset=utf-8",
      body: encodeAsRSCResponse(result),
    });
  });

  return {
    loadMoreCallCount: () => _loadMoreCallCount,
    successfulLoadCount: () => _successfulLoadCount,
    allMockListings,
  };
}
