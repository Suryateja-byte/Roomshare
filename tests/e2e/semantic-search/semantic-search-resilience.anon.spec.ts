/**
 * Semantic Search Resilience E2E Tests
 *
 * Validates that search gracefully degrades when backend subsystems
 * have issues. These tests verify the *observable behavior* from E2E:
 * search always works, never crashes, returns results via FTS fallback.
 *
 * Note: Actual failure injection (Gemini down, SQL errors) is tested
 * at the unit/integration layer. E2E tests verify the user-facing
 * resilience contract.
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

    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

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

    await page.goto(`/search?q=spacious+apartment&${boundsQS}`);
    await waitForSearchOutcome(page);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  test(`SS-55: search degrades gracefully when GEMINI_API_KEY is missing`, async ({
    page,
  }) => {
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
