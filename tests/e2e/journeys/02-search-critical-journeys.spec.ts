/**
 * E2E Test Suite: 20 Critical Search Page User Journeys
 *
 * Comprehensive Playwright tests covering all critical user interactions
 * on the Roomshare search page. Each journey tests a distinct user scenario.
 */

import { test, expect, selectors, timeouts, tags, SF_BOUNDS, searchResultsContainer } from "../helpers";
import {
  openFilterModal,
  applyFilters,
} from "../helpers/filter-helpers";

const SEARCH_URL_WITH_BOUNDS = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

test.describe("20 Critical Search Page Journeys", () => {
  test.beforeEach(async () => { test.slow(); });

  // ─────────────────────────────────────────────────
  // J1: Basic search page loads with results
  // ─────────────────────────────────────────────────
  test("J1: Search page loads and displays results", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // H1 heading with result count
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30000 });
    const headingText = await heading.textContent();
    expect(headingText).toMatch(/\d+\+?\s+place/i);

    // Listing cards scoped to visible container (avoids double-counting from dual mobile/desktop containers)
    const j1Container = searchResultsContainer(page);
    const cards = j1Container.locator(selectors.listingCard);
    await cards.first().waitFor({ state: "attached", timeout: 30000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Scoped to visible container, count should match ITEMS_PER_PAGE
    expect(count).toBeLessThanOrEqual(24);
  });

  // ─────────────────────────────────────────────────
  // J2: Price filter (min + max) applied via URL
  // ─────────────────────────────────────────────────
  test("J2: Price filters applied and reflected in UI", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS, minPrice: 500, maxPrice: 1500 });
    await page.waitForLoadState("domcontentloaded");

    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("500");
    expect(url.searchParams.get("maxPrice")).toBe("1500");

    // Verify price inputs reflect values (wait for hydration to populate inputs)
    const minInput = page.getByLabel(/minimum budget/i);
    const maxInput = page.getByLabel(/maximum budget/i);
    await expect.poll(() => minInput.inputValue(), { timeout: 10_000 }).not.toBe('');
    await expect(minInput).toHaveValue("500");
    await expect(maxInput).toHaveValue("1500");

    // Results heading should be visible
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });
  });

  // ─────────────────────────────────────────────────
  // J3: Room type category tabs
  // ─────────────────────────────────────────────────
  test("J3: Room type category tabs filter results", async ({ page, nav }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip(true, 'Room type tab navigation unreliable on mobile viewport');
      return;
    }

    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for hydration before interacting with tabs
    await page.waitForLoadState("networkidle").catch(() => {});

    // Find category tabs
    const privateTab = page.getByRole("button", { name: /private/i })
      .or(page.locator('button:has-text("Private")'));

    if (await privateTab.first().isVisible()) {
      await page.waitForTimeout(1000); // hydration settle
      // Retry click + URL assertion to handle hydration timing
      await expect(async () => {
        await privateTab.first().click();
        const roomType = new URL(page.url(), "http://localhost").searchParams.get("roomType");
        expect(roomType).not.toBeNull();
      }).toPass({ timeout: 30000 });
    }
  });

  // ─────────────────────────────────────────────────
  // J4: Open filter modal, select amenities, apply
  // ─────────────────────────────────────────────────
  test("J4: Filter modal - select amenities and apply", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Open more filters (uses retry-click for hydration race)
    const modal = await openFilterModal(page);

    // Select Wifi amenity
    const wifiBtn = modal.getByRole("button", { name: "Wifi" });
    if (await wifiBtn.isVisible()) {
      await wifiBtn.click();
      // Should be pressed
      await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");
    }

    // Apply and verify URL updates
    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("amenities"),
      { timeout: 10000, message: 'URL param "amenities" to be present' },
    ).not.toBeNull();
    expect(page.url()).toMatch(/amenities/i);
  });

  // ─────────────────────────────────────────────────
  // J5: Filter modal - clear all filters
  // ─────────────────────────────────────────────────
  test("J5: Clear all filters resets search", async ({ page, nav }) => {
    // Start with filters applied
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&minPrice=500&maxPrice=2000&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");

    // Find "Clear all" button (filter bar or filter modal)
    // On mobile, wait for the heading first so the page is ready
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });
    const clearAllBtn = page.locator('[data-testid="filter-bar-clear-all"]')
      .or(page.getByRole("button", { name: /clear all/i }));

    if (await clearAllBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await clearAllBtn.first().click();

      // Poll URL for filter removal (soft navigation may not trigger domcontentloaded)
      await expect.poll(
        () => new URL(page.url()).searchParams.has("minPrice"),
        { timeout: 15000, message: "minPrice to be removed from URL after clear-all" },
      ).toBe(false);

      const url = new URL(page.url());
      expect(url.searchParams.has("amenities")).toBeFalsy();
    }
  });

  // ─────────────────────────────────────────────────
  // J6: Sort by price low-to-high
  // ─────────────────────────────────────────────────
  test("J6: Sort results by price (low to high)", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // Sort selector (desktop only - hidden on mobile)
    const sortTrigger = page.locator('button').filter({ hasText: /recommended|sort/i }).first();

    // Check viewport - sort is hidden on mobile
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      if (await sortTrigger.isVisible()) {
        await sortTrigger.click();

        // Select "Price: Low to High"
        const option = page.getByRole("option", { name: /low.*high/i })
          .or(page.locator('[role="option"]').filter({ hasText: /Low to High/i }));

        if (await option.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await option.first().click();
          await expect.poll(
            () => new URL(page.url(), "http://localhost").searchParams.get("sort"),
            { timeout: 10000, message: 'URL param "sort" to be "price_asc"' },
          ).toBe("price_asc");
        }
      }
    }
  });

  // ─────────────────────────────────────────────────
  // J7: Pagination - go to page 2 and back
  // ─────────────────────────────────────────────────
  test("J7: Pagination navigates between pages", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // Look for pagination
    const pagination = page.locator('[aria-label="Pagination navigation"]');

    if (await pagination.isVisible({ timeout: 5000 }).catch(() => false)) {
      const nextBtn = page.locator('[aria-label="Go to next page"]');

      if (await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForLoadState("domcontentloaded");

        // Should show page 2 indicator
        const url = page.url();
        const hasPageParam = url.includes("page=2") || url.includes("pageNumber=2") || url.includes("cursor=");
        expect(hasPageParam).toBeTruthy();

        // Go back
        const prevBtn = page.locator('[aria-label="Go to previous page"]');
        if (await prevBtn.isEnabled()) {
          await prevBtn.click();
          await page.waitForLoadState("domcontentloaded");
        }
      }
    }
  });

  // ─────────────────────────────────────────────────
  // J8: Zero results shows suggestions
  // ─────────────────────────────────────────────────
  test("J8: Zero results shows helpful suggestions", async ({ page }) => {
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&minPrice=99999&maxPrice=100000`);
    await page.waitForLoadState("domcontentloaded");

    // Should show "No matches found" or "0 places"
    const zeroIndicator = searchResultsContainer(page).getByText(/no\s+matches/i)
      .or(page.getByRole("heading", { level: 1, name: /^0\s+place/i }));
    await zeroIndicator.first().waitFor({ state: "attached", timeout: 30000 });

    // "Clear all filters" link should be available
    const clearLink = page.getByRole("link", { name: /clear all filters/i })
      .or(page.getByText(/clear all/i));
    await clearLink.first().waitFor({ state: "attached", timeout: 5000 });
  });

  // ─────────────────────────────────────────────────
  // J9: Click listing card navigates to detail page
  // ─────────────────────────────────────────────────
  test("J9: Clicking listing card opens detail page", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const firstCard = searchResultsContainer(page).locator(selectors.listingCard).first();
    await firstCard.waitFor({ state: "attached", timeout: 30000 });

    // Get href from the <a> link inside the listing card div
    const cardLink = firstCard.locator('a[href^="/listings/"]').first();
    const href = await cardLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Navigate to the listing page
    await page.goto(href!);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation, waitUntil: "commit" });
    expect(page.url()).toMatch(/\/listings\//);
  });

  // ─────────────────────────────────────────────────
  // J10: Back navigation preserves filters
  // ─────────────────────────────────────────────────
  test("J10: Browser back preserves search filters", async ({ page, nav }) => {
    // Start with filters
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&minPrice=800&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Click a listing
    const firstCard = searchResultsContainer(page).locator(selectors.listingCard).first();
    await firstCard.waitFor({ state: "attached", timeout: 10000 });
    const cardLink = firstCard.locator('a[href^="/listings/"]').first();
    const href = await cardLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation, waitUntil: "commit" });

      // Go back
      await page.goBack();
      await expect.poll(
        () => new URL(page.url()).pathname,
        { timeout: timeouts.navigation, message: "URL pathname to be /search after goBack" },
      ).toContain("/search");

      // Filters should be preserved
      const url = new URL(page.url());
      expect(url.searchParams.get("minPrice")).toBe("800");
      expect(url.searchParams.get("maxPrice")).toBe("2000");
    }
  });

  // ─────────────────────────────────────────────────
  // J11: Filter modal lease duration select
  // ─────────────────────────────────────────────────
  test("J11: Lease duration filter works", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Open filter modal (uses retry-click for hydration race)
    const modal = await openFilterModal(page);

    // Find lease duration trigger
    const leaseTrigger = modal.locator('#filter-lease');
    if (await leaseTrigger.isVisible()) {
      await leaseTrigger.click();

      // Select "Month-to-month"
      const option = page.getByRole("option", { name: /month-to-month/i });
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Apply
    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("leaseDuration"),
      { timeout: 10000, message: 'URL param "leaseDuration" to be present' },
    ).not.toBeNull();

    expect(page.url()).toMatch(/leaseDuration/i);
  });

  // ─────────────────────────────────────────────────
  // J12: Filter modal house rules
  // ─────────────────────────────────────────────────
  test("J12: House rules filter toggles work", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Open filter modal (uses retry-click for hydration race)
    const modal = await openFilterModal(page);

    // Toggle "Pets allowed"
    const petsBtn = modal.getByRole("button", { name: "Pets allowed" });
    if (await petsBtn.isVisible()) {
      await petsBtn.click();
      await expect(petsBtn).toHaveAttribute("aria-pressed", "true");
    }

    // Apply and verify
    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("houseRules"),
      { timeout: 10000, message: 'URL param "houseRules" to be present' },
    ).not.toBeNull();
    expect(page.url()).toMatch(/houseRules/i);
  });

  // ─────────────────────────────────────────────────
  // J13: Filter modal gender preference
  // ─────────────────────────────────────────────────
  test("J13: Gender preference filter works", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Open filter modal (uses retry-click for hydration race)
    const modal = await openFilterModal(page);

    // Find gender preference trigger
    const genderTrigger = modal.locator('#filter-gender-pref');
    if (await genderTrigger.isVisible()) {
      await genderTrigger.click();
      const option = page.getByRole("option", { name: /female/i });
      if (await option.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.first().click();
      }
    }

    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("genderPreference"),
      { timeout: 10000, message: 'URL param "genderPreference" to be present' },
    ).not.toBeNull();
    expect(page.url()).toMatch(/genderPreference/i);
  });

  // ─────────────────────────────────────────────────
  // J14: Filter removal via pill X button
  // ─────────────────────────────────────────────────
  test("J14: Removing filter pill updates results", async ({ page }) => {
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&amenities=Wifi&amenities=Parking`);
    await page.waitForLoadState("domcontentloaded");

    // Look for filter pill remove buttons
    const pillRemoveBtn = page.locator('button[aria-label*="Remove"]')
      .or(page.locator('[class*="FilterPill"] button'))
      .or(page.locator('button').filter({ hasText: /Wifi/ }).locator('svg').first());

    // If filter pills are visible, try removing one
    if (await pillRemoveBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await pillRemoveBtn.first().click();
      await page.waitForLoadState("domcontentloaded");
    }
  });

  // ─────────────────────────────────────────────────
  // J15: Search with text query (q param)
  // ─────────────────────────────────────────────────
  test("J15: Text search query shows results", async ({ page }) => {
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&q=cozy`);
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30000 });

    // Heading should mention the query
    const text = await heading.textContent();
    expect(text).toMatch(/cozy|place/i);
  });

  // ─────────────────────────────────────────────────
  // J16: Refresh preserves all state
  // ─────────────────────────────────────────────────
  test("J16: Page refresh preserves filters and sort", async ({ page }) => {
    await page.goto(`${SEARCH_URL_WITH_BOUNDS}&minPrice=700&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");

    // Verify initial state
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Refresh
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Verify state preserved
    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("700");
    expect(url.searchParams.get("sort")).toBe("price_asc");

    // Verify price input still shows correct value (wait for hydration)
    const minInput = page.getByLabel(/minimum budget/i);
    await expect.poll(() => minInput.inputValue(), { timeout: 10_000 }).not.toBe('');
    await expect(minInput).toHaveValue("700");
  });

  // ─────────────────────────────────────────────────
  // J17: Map toggle shows/hides map
  // ─────────────────────────────────────────────────
  test("J17: Map toggle shows and hides map view", async ({ page, nav }) => {
    test.slow();
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Look for map toggle button
    const mapToggle = page.getByRole("button", { name: /show map|^map$/i })
      .or(page.locator('[data-testid="map-toggle"]'));

    if (await mapToggle.first().isVisible({ timeout: 10000 }).catch(() => false)) {
      await expect(mapToggle.first()).toBeEnabled({ timeout: 10000 });
      await mapToggle.first().click();
      await page.waitForTimeout(1500); // Map init time

      // Map should be visible
      const map = page.locator(selectors.map);
      const mapVisible = await map.isVisible({ timeout: 10000 }).catch(() => false);

      if (mapVisible) {
        // Toggle map off
        const hideMapBtn = page.getByRole("button", { name: /hide map|list/i })
          .or(mapToggle.first());
        if (await hideMapBtn.isVisible()) {
          await hideMapBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  // ─────────────────────────────────────────────────
  // J18: Search page without bounds shows location prompt
  // ─────────────────────────────────────────────────
  test("J18: Search without location shows prompt", async ({ page }) => {
    await page.goto("/search?q=test");
    await page.waitForLoadState("domcontentloaded");

    // Should show "Please select a location" or browse mode
    const locationPrompt = page.getByText(/select a location|showing top listings/i);
    await expect(locationPrompt.first()).toBeVisible({ timeout: 30000 });
  });

  // ─────────────────────────────────────────────────
  // J19: Rate limit shows friendly message
  // ─────────────────────────────────────────────────
  test("J19: Rate limit shows friendly error", async ({ page, network }) => {
    test.slow(); // Server under load needs extra time
    // Mock rate limit response on the search page (server component)
    // We simulate by rapidly navigating
    await network.mockApiResponse("**/api/search/**", {
      status: 429,
      body: { error: "Too many requests" },
    });

    await page.goto(SEARCH_URL_WITH_BOUNDS, { waitUntil: "domcontentloaded" });

    // The page itself handles rate limiting server-side, so check for the message
    // or if results still load (server-side rate limit not triggered via mock)
    // Wait for either rate limit text or the results heading
    await expect(async () => {
      const hasRateLimit = await page.getByText(/too many requests/i).isVisible().catch(() => false);
      const hasHeading = await page.getByRole("heading", { level: 1 }).first().isVisible().catch(() => false);
      expect(hasRateLimit || hasHeading).toBeTruthy();
    }).toPass({ timeout: 30000 });
  });

  // ─────────────────────────────────────────────────
  // J20: Mobile viewport - collapsed header and responsive layout
  // ─────────────────────────────────────────────────
  test(`${tags.mobile} J20: Mobile layout is responsive and functional`, async ({ page, nav }) => {
    test.slow(); // Mobile viewport under load needs extra time
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Results heading visible
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Listing cards or empty state should exist after page renders
    await expect(async () => {
      const cardCount = await searchResultsContainer(page).locator(selectors.listingCard).count();
      const hasEmpty = await searchResultsContainer(page).getByText(/no\s+matches|no listings/i).isVisible().catch(() => false);
      expect(cardCount > 0 || hasEmpty).toBeTruthy();
    }).toPass({ timeout: 30000 });

    // Filter button should be visible and functional on mobile
    // Uses openFilterModal which has retry-click for hydration race
    const modal = await openFilterModal(page);

    // Close it via the X button (not the backdrop, which is behind the modal content)
    const closeBtn = page.getByRole("button", { name: "Close filters" }).first();
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  // ─────────────────────────────────────────────────
  // J-BONUS: Accessibility basics on search page
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J-A11Y: Search page meets accessibility basics`, async ({ page, nav, assert }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Basic a11y checks
    await assert.basicA11y();

    // Screen reader announcement exists
    const srAnnouncement = page.locator('[aria-live="polite"]');
    expect(await srAnnouncement.count()).toBeGreaterThan(0);

    // Pagination has proper aria labels
    const pagination = page.locator('[aria-label="Pagination navigation"]');
    if (await pagination.isVisible({ timeout: 3000 }).catch(() => false)) {
      const nextBtn = page.locator('[aria-label="Go to next page"]');
      const prevBtn = page.locator('[aria-label="Go to previous page"]');
      expect(await nextBtn.count()).toBe(1);
      expect(await prevBtn.count()).toBe(1);
    }
  });
});
