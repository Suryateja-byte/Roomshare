/**
 * E2E Test Suite: Budget URL Param Aliases
 *
 * Tests that minBudget/maxBudget URL params work as aliases for minPrice/maxPrice.
 * Verifies:
 * - Alias params filter server-side correctly (no out-of-range listings)
 * - Canonical params take precedence when both present
 * - Mixed param variants work (minBudget + maxPrice, etc.)
 * - Budget inputs prefill from URL on initial load
 *
 * DB stores price as Float (dollars, not cents) - no conversion needed.
 */

import { test, expect, tags, searchResultsContainer } from "../helpers";

test.describe("Budget URL Param Aliases", () => {
  // Filter tests run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("Server-Side Price Filtering", () => {
    test(`${tags.anon} ${tags.smoke} - Budget aliases filter listings server-side`, async ({
      page,
    }) => {
      const minBudget = 500;
      const maxBudget = 1500;

      // Navigate with budget aliases
      await page.goto(`/search?minBudget=${minBudget}&maxBudget=${maxBudget}`);
      await page.waitForLoadState("domcontentloaded");

      // Wait for listing cards to load (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Get all visible listing prices
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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
      await page.goto(`/search?minPrice=${minPrice}&maxPrice=${maxPrice}`);
      await page.waitForLoadState("domcontentloaded");

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are within range
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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

  test.describe("Input Prefilling from URL", () => {
    test(`${tags.anon} - Budget inputs prefill from budget alias params`, async ({
      page,
    }) => {
      await page.goto("/search?minBudget=500&maxBudget=1500");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("1500", { timeout: 30000 });
    });

    test(`${tags.anon} - Budget inputs prefill from canonical params`, async ({
      page,
    }) => {
      await page.goto("/search?minPrice=800&maxPrice=2000");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue("800", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("2000", { timeout: 30000 });
    });
  });

  test.describe("Canonical Precedence Over Aliases", () => {
    test(`${tags.anon} ${tags.smoke} - CRITICAL: Canonical minPrice takes precedence over minBudget`, async ({
      page,
    }) => {
      // Both params present - canonical should win
      await page.goto("/search?minPrice=700&minBudget=500&maxPrice=1500");
      await page.waitForLoadState("domcontentloaded");

      // Input should show canonical value (700), not alias (500)
      const minPriceInput = page.getByLabel(/minimum budget/i);
      await expect(minPriceInput).toHaveValue("700", { timeout: 30000 });

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Verify prices respect canonical minPrice=700, not alias minBudget=500
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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
      await page.goto("/search?minPrice=500&maxPrice=1200&maxBudget=2000");
      await page.waitForLoadState("domcontentloaded");

      // Input should show canonical value (1200), not alias (2000)
      const maxPriceInput = page.getByLabel(/maximum budget/i);
      await expect(maxPriceInput).toHaveValue("1200", { timeout: 30000 });

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Verify prices respect canonical maxPrice=1200
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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
      await page.goto("/search?minBudget=500&maxPrice=1500");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("1500", { timeout: 30000 });

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are in range
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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
      await page.goto("/search?minPrice=600&maxBudget=1800");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue("600", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("1800", { timeout: 30000 });

      // Wait for listing cards (or zero results)
      const listingCards = searchResultsContainer(page).locator('[data-testid="listing-card"]');
      const zeroResults = page.getByText(/no matches|0 places/i);
      await listingCards.or(zeroResults).first().waitFor({ state: "visible", timeout: 30000 });

      // Verify prices are in range
      const priceElements = searchResultsContainer(page).locator('[data-testid="listing-price"]');
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
      "Chips tests skip webkit",
    );

    test(`${tags.anon} - Price chip shows for budget alias params`, async ({
      page,
    }) => {
      await page.goto("/search?minBudget=500&maxBudget=1500");
      await page.waitForLoadState("domcontentloaded");

      // Verify chips container is visible (use .first() for mobile which may have duplicate regions)
      const chipsRegion = page
        .locator('[role="region"][aria-label="Applied filters"]')
        .first();
      await expect(chipsRegion).toBeVisible({ timeout: 30000 });

      // Verify price chip is present (format: "$500 - $1,500")
      const priceChip = chipsRegion.getByText(/\$500.*\$1,?500/);
      await expect(priceChip).toBeVisible();
    });

    test(`${tags.anon} - Removing price chip clears both canonical and alias params`, async ({
      page,
    }) => {
      // Start with budget aliases
      await page.goto("/search?minBudget=500&maxBudget=1500");
      await page.waitForLoadState("domcontentloaded");

      const chipsRegion = page
        .locator('[role="region"][aria-label="Applied filters"]')
        .first();
      await expect(chipsRegion).toBeVisible({ timeout: 30000 });

      // Click the remove button for price chip
      const removeButton = chipsRegion
        .getByRole("button", { name: /remove filter/i })
        .first();
      await removeButton.click();

      // Wait for URL to update - should have no price params
      await expect.poll(
        () => {
          const search = page.url();
          return (
            !search.includes("minPrice") &&
            !search.includes("maxPrice") &&
            !search.includes("minBudget") &&
            !search.includes("maxBudget")
          );
        },
        { timeout: 30000, message: "URL to have no price/budget params after chip removal" },
      ).toBe(true);

      // Chips region should be hidden (no more filters)
      await expect(chipsRegion).not.toBeVisible();
    });
  });

  test.describe("URL Persistence", () => {
    test(`${tags.anon} - Budget alias params persist after page refresh`, async ({
      page,
    }) => {
      await page.goto("/search?minBudget=500&maxBudget=1500");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("1500", { timeout: 30000 });

      // Refresh page
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Values should persist
      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });
      await expect(maxPriceInput).toHaveValue("1500", { timeout: 30000 });
    });

    test(`${tags.anon} - Back/forward navigation maintains filter state`, async ({
      page,
    }) => {
      // Start on search with no filters
      await page.goto("/search");
      await page.waitForLoadState("domcontentloaded");

      // Navigate to filtered view
      await page.goto("/search?minBudget=500&maxBudget=1500");
      await page.waitForLoadState("domcontentloaded");

      const minPriceInput = page.getByLabel(/minimum budget/i);
      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });

      // Go back
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");

      // Should be unfiltered
      await expect(minPriceInput).toHaveValue("", { timeout: 30000 });

      // Go forward
      await page.goForward();
      await page.waitForLoadState("domcontentloaded");

      // Should restore filter
      await expect(minPriceInput).toHaveValue("500", { timeout: 30000 });
    });
  });
});
