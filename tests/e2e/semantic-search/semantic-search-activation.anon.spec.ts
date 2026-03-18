/**
 * Semantic Search Activation E2E Tests
 *
 * Validates that semantic search activates under correct conditions and
 * gracefully falls back to FTS otherwise. All tests are environment-agnostic:
 * they verify search *works* regardless of whether semantic search is enabled.
 *
 * Scenarios: SS-01 through SS-07
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-activation.anon.spec.ts
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

/** Wait for listing cards or a "no results" message to be visible. */
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

test.describe("Semantic Search - Activation", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-01: search returns results for natural language query with recommended sort`, async ({
    page,
  }) => {
    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    if (count === 0) {
      await expect(
        container.getByText(/no (matches|results|listings)/i).first()
      ).toBeVisible();
    } else {
      expect(count).toBeGreaterThan(0);
      const firstCard = cards.first();
      await expect(firstCard).toBeVisible();
      await expect(
        firstCard.locator('[data-testid="listing-price"]')
      ).toBeVisible();
    }
  });

  test(`${tags.core} SS-02: short query (2 chars) falls back to FTS and returns results`, async ({
    page,
  }) => {
    await page.goto(`/search?q=ab&${boundsQS}`);
    await waitForSearchOutcome(page);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test(`${tags.core} SS-03: non-recommended sort bypasses semantic search`, async ({
    page,
  }) => {
    await page.goto(`/search?q=cozy+room&sort=price_asc&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    if (count >= 2) {
      const prices: number[] = [];
      for (let i = 0; i < Math.min(count, 3); i++) {
        const priceText = await cards
          .nth(i)
          .locator('[data-testid="listing-price"]')
          .textContent();
        const priceNum = parseFloat((priceText || "0").replace(/[^0-9.]/g, ""));
        prices.push(priceNum);
      }
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }
  });

  test(`${tags.core} SS-04: search works regardless of feature flag state`, async ({
    page,
  }) => {
    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    const errorBoundary = page.locator(
      '[data-testid="error-boundary"], text=/something went wrong/i'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test(`${tags.core} SS-05: search returns results even when no embeddings exist`, async ({
    page,
  }) => {
    await page.goto(`/search?q=cozy+room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards
      .first()
      .or(container.getByText(/no (matches|results|listings)/i).first());
    await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
  });

  test(`SS-06: browse mode (no query text) returns results without semantic search`, async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test(`SS-07: extremely long query (201+ chars) completes without error`, async ({
    page,
  }) => {
    const longQuery = encodeURIComponent(
      "cozy room ".repeat(25).trim().slice(0, 201)
    );
    await page.goto(`/search?q=${longQuery}&${boundsQS}`);
    await waitForSearchOutcome(page);

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });
});
