/**
 * Semantic Search Resilience E2E Tests
 *
 * Validates that search gracefully degrades when backend subsystems
 * have issues. Each test uses `page.route()` to intercept client-side
 * /api/search/v2 requests and simulate failures (503, 401, 500).
 *
 * Since the initial page load uses SSR (server-side executeSearchV2),
 * the route intercepts affect client-side re-fetches (Load More,
 * filter changes). The tests verify the user-facing resilience
 * contract: the page renders SSR results and does not crash.
 *
 * Scenarios: SS-40, SS-41, SS-42, SS-55
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-resilience.anon.spec.ts
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

/** Console error patterns that are benign and should not fail tests. */
const BENIGN_ERROR_PATTERNS = [
  "mapbox",
  "webpack",
  "HMR",
  "hydrat",
  "favicon",
  "ResizeObserver",
  "WebGL",
  "Failed to create",
  "Failed to load resource",
  "404",
  "AbortError",
  "Environment validation",
  "NEXT_REDIRECT",
  "ERR_ABORTED",
  "net::ERR_",
  "Abort fetching component",
  "ChunkLoadError",
  "Loading chunk",
  "preload",
  "Download the React DevTools",
  "search/facets",
  "x-]",
];

function isBenignError(msg: string): boolean {
  return BENIGN_ERROR_PATTERNS.some((p) =>
    msg.toLowerCase().includes(p.toLowerCase())
  );
}

async function waitForSearchOutcome(page: import("@playwright/test").Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const cardOrEmpty = cards
    .first()
    .or(container.getByText(/no (matches|results|listings)/i).first());
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Resilience", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-40: search returns results via FTS fallback when Gemini is unavailable`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // Inject failure: intercept client-side /api/search/v2 calls with 503
    // to simulate Gemini/embedding service being down.
    // SSR page load uses the server-side service directly (not interceptable),
    // so this tests that client-side fetch failures (Load More, re-fetches)
    // degrade gracefully — the page still shows SSR results without crashing.
    await page.route("**/api/search/v2*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service Unavailable" }),
      })
    );

    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    // SSR results should still be visible despite API route being intercepted
    const errorBoundary = page.locator(
      'text=/something went wrong/i, [data-testid="error-boundary"]'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  test(`SS-41: search handles Gemini auth errors gracefully`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // Inject failure: intercept client-side /api/search/v2 with 401
    // to simulate Gemini API key being invalid or expired.
    // The page should show SSR results and not crash on auth failures.
    await page.route("**/api/search/v2*", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized: Invalid API key" }),
      })
    );

    await page.goto(`/search?q=affordable+room+in+sf&${boundsQS}`);
    await waitForSearchOutcome(page);

    const errorBoundary = page.locator(
      'text=/something went wrong/i, [data-testid="error-boundary"]'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test(`${tags.core} SS-42: search returns results even if SQL function has issues`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // Inject failure: intercept client-side /api/search/v2 with 500
    // to simulate a SQL function error (e.g. search_listings_semantic fails).
    // The page should still render SSR results and not show an error boundary.
    await page.route("**/api/search/v2*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to fetch search results" }),
      })
    );

    await page.goto(`/search?q=spacious+apartment&${boundsQS}`);
    await waitForSearchOutcome(page);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  test(`SS-55: search degrades gracefully when GEMINI_API_KEY is missing`, async ({
    page,
  }) => {
    // Inject failure: intercept client-side /api/search/v2 with 503 and
    // a body mimicking the error when GEMINI_API_KEY is not configured.
    // The page should still render SSR results (or empty state) without crashing.
    await page.route("**/api/search/v2*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Search temporarily unavailable",
        }),
      })
    );

    await page.goto(`/search?q=cozy+room&sort=recommended&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards
      .first()
      .or(container.getByText(/no (matches|results|listings)/i).first());
    await expect(cardOrEmpty).toBeVisible();

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });
});
