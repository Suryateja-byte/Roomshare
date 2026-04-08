/**
 * E2E Test Suite: Budget URL Param Aliases
 *
 * Tests that minBudget/maxBudget URL params work as aliases for minPrice/maxPrice.
 * Verifies:
 * - Alias params filter server-side correctly (no out-of-range listings)
 * - Canonical params take precedence when both present
 * - Mixed param variants work (minBudget + maxPrice, etc.)
 * - Visible applied price state reflects URL params on initial load
 *
 * DB stores price as Float (dollars, not cents) - no conversion needed.
 */

import type { Page } from "@playwright/test";
import {
  test,
  expect,
  tags,
  searchResultsContainer,
  boundsQS,
} from "../helpers";

test.describe("Budget URL Param Aliases", () => {
  // Filter tests run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  function priceChipButton(page: Page, label: RegExp) {
    return page.getByRole("button", { name: label }).first();
  }

  async function expectPriceChip(page: Page, label: RegExp) {
    await expect(priceChipButton(page, label)).toBeVisible({ timeout: 30000 });
  }

  test.describe("Server-Side Price Filtering", () => {
    test(`${tags.anon} ${tags.smoke} - Budget aliases filter listings server-side`, async ({
      page,
    }) => {
      const minBudget = 500;
      const maxBudget = 1500;

      // Navigate with budget aliases
      await page.goto(
        `/search?${boundsQS}&minBudget=${minBudget}&maxBudget=${maxBudget}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for listing cards to load (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Get all visible listing prices
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      // CRITICAL ASSERTION: All visible listing prices must be within range
      // This validates server-side filtering is working, not just UI display
      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        // Skip if price is 0 (invalid/free listings)
        if (price === 0 || isNaN(price)) continue;

        expect(price).toBeGreaterThanOrEqual(minBudget);
        expect(price).toBeLessThanOrEqual(maxBudget);
      }
    });

    test(`${tags.anon} - Canonical params (minPrice/maxPrice) work for filtering`, async ({
      page,
    }) => {
      const minPrice = 600;
      const maxPrice = 1200;

      // Navigate with canonical params
      await page.goto(
        `/search?${boundsQS}&minPrice=${minPrice}&maxPrice=${maxPrice}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are within range
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        if (price === 0 || isNaN(price)) continue;

        expect(price).toBeGreaterThanOrEqual(minPrice);
        expect(price).toBeLessThanOrEqual(maxPrice);
      }
    });
  });

  test.describe("Visible Price State from URL", () => {
    test(`${tags.anon} - Budget alias params render the applied price chip`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minBudget=500&maxBudget=1500`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);
    });

    test(`${tags.anon} - Canonical price params render the applied price chip`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minPrice=800&maxPrice=2000`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$800 - \$2,000$/);
    });
  });

  test.describe("Canonical Precedence Over Aliases", () => {
    test(`${tags.anon} ${tags.smoke} - CRITICAL: Canonical minPrice takes precedence over minBudget`, async ({
      page,
    }) => {
      // Both params present - canonical should win
      await page.goto(
        `/search?${boundsQS}&minPrice=700&minBudget=500&maxPrice=1500`
      );
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$700 - \$1,500$/);

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Verify prices respect canonical minPrice=700, not alias minBudget=500
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        if (price === 0 || isNaN(price)) continue;

        // Should use canonical minPrice=700, not alias minBudget=500
        expect(price).toBeGreaterThanOrEqual(700);
        expect(price).toBeLessThanOrEqual(1500);
      }
    });

    test(`${tags.anon} - Canonical maxPrice takes precedence over maxBudget`, async ({
      page,
    }) => {
      // Both params present - canonical should win
      await page.goto(
        `/search?${boundsQS}&minPrice=500&maxPrice=1200&maxBudget=2000`
      );
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,200$/);

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Verify prices respect canonical maxPrice=1200
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        if (price === 0 || isNaN(price)) continue;

        expect(price).toBeGreaterThanOrEqual(500);
        // Should use canonical maxPrice=1200, not alias maxBudget=2000
        expect(price).toBeLessThanOrEqual(1200);
      }
    });
  });

  test.describe("Mixed Param Variants", () => {
    test(`${tags.anon} - minBudget alias + maxPrice canonical`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minBudget=500&maxPrice=1500`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are in range
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        if (price === 0 || isNaN(price)) continue;

        expect(price).toBeGreaterThanOrEqual(500);
        expect(price).toBeLessThanOrEqual(1500);
      }
    });

    test(`${tags.anon} - minPrice canonical + maxBudget alias`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minPrice=600&maxBudget=1800`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$600 - \$1,800$/);

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator(
        '[data-testid="listing-card"]'
      );
      const zeroResults =
        searchResultsContainer(page).getByText(/no\s+matches/i);
      await listingCards
        .or(zeroResults)
        .first()
        .waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are in range
      const priceElements = searchResultsContainer(page).locator(
        '[data-testid="listing-price"]'
      );
      const priceCount = await priceElements.count();

      for (let i = 0; i < priceCount; i++) {
        const priceText = await priceElements.nth(i).textContent();
        const price = parseInt((priceText || "0").replace(/[^0-9]/g, ""), 10);

        if (price === 0 || isNaN(price)) continue;

        expect(price).toBeGreaterThanOrEqual(600);
        expect(price).toBeLessThanOrEqual(1800);
      }
    });
  });

  test.describe("Filter Chips", () => {
    // Skip webkit - chips region rendering differs; core budget logic tested elsewhere
    test.skip(
      ({ browserName }) => browserName === "webkit",
      "Chips tests skip webkit"
    );

    test(`${tags.anon} - Price chip shows for budget alias params`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minBudget=500&maxBudget=1500`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);
    });

    test(`${tags.anon} - Removing price chip clears both canonical and alias params`, async ({
      page,
    }) => {
      // Start with budget aliases
      await page.goto(`/search?${boundsQS}&minBudget=500&maxBudget=1500`);
      await page.waitForLoadState("domcontentloaded");

      // Click the remove button for price chip
      await priceChipButton(page, /^\$500 - \$1,500$/).evaluate((el) =>
        el.click()
      );

      // Wait for URL to update - should have no price params
      await expect
        .poll(
          () => {
            const search = page.url();
            return (
              !search.includes("minPrice") &&
              !search.includes("maxPrice") &&
              !search.includes("minBudget") &&
              !search.includes("maxBudget")
            );
          },
          {
            timeout: 30000,
            message: "URL to have no price/budget params after chip removal",
          }
        )
        .toBe(true);

      await expect(page.getByRole("button", { name: /^\$500 - \$1,500$/ })).toHaveCount(0);
    });
  });

  test.describe("URL Persistence", () => {
    test(`${tags.anon} - Budget alias params persist after page refresh`, async ({
      page,
    }) => {
      await page.goto(`/search?${boundsQS}&minBudget=500&maxBudget=1500`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);

      // Refresh page
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);
    });

    test(`${tags.anon} - Back/forward navigation maintains filter state`, async ({
      page,
    }) => {
      // Start on search with no filters
      await page.goto(`/search?${boundsQS}`);
      await page.waitForLoadState("domcontentloaded");

      // Navigate to filtered view
      await page.goto(`/search?${boundsQS}&minBudget=500&maxBudget=1500`);
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);

      // Go back
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");

      await expect(page.getByRole("button", { name: /^\$500 - \$1,500$/ })).toHaveCount(0);

      // Go forward
      await page.goForward();
      await page.waitForLoadState("domcontentloaded");

      await expectPriceChip(page, /^\$500 - \$1,500$/);
    });
  });
});
