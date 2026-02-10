/**
 * Search Page Visual Regression Tests
 *
 * Captures baseline screenshots for the search UI migration.
 * Uses fixed viewports and masks non-deterministic elements (map tiles).
 */
import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers";

test.describe("Search Visual Regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.slow();
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'No Mobile Chrome snapshot baselines — skip visual regression');
    }

    // Disable animations for stable screenshots
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("desktop layout snapshot (1440x900)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate with bounds to get consistent seed data
    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for listing cards to load (stable selector)
    const listingCards = searchResultsContainer(page).locator('a[href^="/listings/"]');
    await expect(listingCards.first()).toBeVisible({ timeout: 30000 });

    // Wait for content to stabilize
    await page.waitForTimeout(1000);

    // Take screenshot of the listings panel only (mask the map)
    // The map uses Mapbox tiles which are non-deterministic
    await expect(page).toHaveScreenshot("search-desktop-layout.png", {
      mask: [
        page.locator(".mapboxgl-canvas"),
        page.locator(".mapboxgl-map"),
        page.locator('[class*="map"]').filter({ hasNot: page.locator('a[href^="/listings/"]') }),
      ],
      maxDiffPixelRatio: 0.02,
    });
  });

  test("mobile layout snapshot (375x812)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for listing cards to load
    const listingCards = searchResultsContainer(page).locator('a[href^="/listings/"]');
    await expect(listingCards.first()).toBeVisible({ timeout: 30000 });

    // Wait for content to stabilize
    await page.waitForTimeout(1000);

    // Mobile view shows list by default, no map visible
    await expect(page).toHaveScreenshot("search-mobile-layout.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("mobile map toggle snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for the toggle button to be visible
    const toggleButton = page.getByRole("button", { name: /show map/i });
    await expect(toggleButton).toBeVisible({ timeout: 30000 });

    // Screenshot of the toggle button styling
    await expect(toggleButton).toHaveScreenshot("search-mobile-toggle.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("listing card snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for listing cards to load
    const listingCards = searchResultsContainer(page).locator('a[href^="/listings/"]');
    await expect(listingCards.first()).toBeVisible({ timeout: 30000 });

    // Wait for images to load
    await page.waitForTimeout(2000);

    // Screenshot first listing card
    await expect(listingCards.first()).toHaveScreenshot("listing-card.png", {
      maxDiffPixelRatio: 0.05, // Allow more variance for images
    });
  });

  test("empty state snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Use impossible filter combination to force zero results
    await page.goto("/search?minPrice=99999&maxPrice=100000");
    await page.waitForLoadState("domcontentloaded");

    // Wait for empty state to appear
    const emptyState = page.getByText(/no matches found/i);
    await expect(emptyState).toBeVisible({ timeout: 30000 });

    // Wait for content to stabilize
    await page.waitForTimeout(1000);

    // Screenshot the empty state (mask the map)
    await expect(page).toHaveScreenshot("search-empty-state.png", {
      mask: [
        page.locator(".mapboxgl-canvas"),
        page.locator(".mapboxgl-map"),
      ],
      maxDiffPixelRatio: 0.02,
    });
  });
});
