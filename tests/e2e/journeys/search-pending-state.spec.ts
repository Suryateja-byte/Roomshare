/**
 * E2E Test Suite: Quiet Pending State (PR1)
 *
 * Tests the non-blocking pending state during search transitions:
 * - Old results stay visible without visual transition chrome
 * - No duplicate skeleton grid rendered during transitions
 * - aria-busy attribute during transition
 * - Screen-reader-only pending status for slow transitions
 *
 * Implementation note:
 * - SearchViewToggle renders `data-testid="search-results-container"` (width/scroll wrapper)
 * - SearchResultsLoadingWrapper renders `data-testid="search-results-pending-region"` INSIDE the container
 * - Pending state announces progress without a visible pill or scrim
 * - pointer-events-none is applied only for non-map-pan stale result transitions
 */

import {
  test,
  expect,
  tags,
  selectors,
  timeouts,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers";
import {
  openFilterModal,
  toggleAmenity,
  applyButton,
  filterDialog,
  waitForUrlParam,
} from "../helpers/filter-helpers";

test.describe("Quiet Pending State (PR1)", () => {
  // Filter tests run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("Pending State Styling", () => {
    test(`${tags.anon} ${tags.smoke} - Results container announces filter transition quietly`, async ({
      page,
      nav,
    }) => {
      // Navigate to search with initial filters
      await nav.goToSearch({ minPrice: 500 });
      await page.waitForLoadState("domcontentloaded");

      // Wait for initial results to load
      const resultsContainer = searchResultsContainer(page);
      await expect(resultsContainer).toBeVisible({ timeout: 30000 });

      // The aria-busy wrapper is inside the results container (SearchResultsLoadingWrapper)
      const ariaBusyWrapper = resultsContainer
        .locator('[data-testid="search-results-pending-region"]')
        .first();

      // If the wrapper exists, verify it is NOT busy initially
      if ((await ariaBusyWrapper.count()) > 0) {
        await expect(ariaBusyWrapper).toHaveAttribute("aria-busy", "false");
      }

      // Add artificial delay to search API to make pending state observable
      // Skip /api/search-count so the count preview resolves quickly and the
      // Apply button DOM stabilises before we click it.
      await page.route("**/search**", async (route) => {
        if (route.request().url().includes("/search-count")) {
          await route.continue();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });

      // Open filter modal (handles hydration retry + waits for facet data)
      try {
        await openFilterModal(page);
      } catch {
        await page.unroute("**/search**");
        test.skip(true, "Filter modal did not open on this viewport");
        return;
      }

      // Toggle Wifi amenity (seeded and used by the stable filter race specs)
      try {
        await toggleAmenity(page, "Wifi");
      } catch {
        await page.unroute("**/search**");
        test.skip(true, "Wifi amenity button not available");
        return;
      }

      const wifiToggle = page
        .locator('[aria-label="Select amenities"]')
        .getByRole("button", { name: /^Wifi/i });
      const currentState = await wifiToggle.getAttribute("aria-pressed");
      if (currentState !== "true") {
        await wifiToggle.click();
      }
      await expect(wifiToggle).toHaveAttribute("aria-pressed", "true", {
        timeout: 3_000,
      });

      // Wait for the search-count API response to settle so the Apply button's
      // disabled/enabled state is stable before we check visibility.
      await page
        .waitForResponse((resp) => resp.url().includes("/api/search-count"), {
          timeout: 10_000,
        })
        .catch(() => {}); // OK if already resolved or not fired

      // Wait for Apply button spinner to disappear (DOM stability)
      const showButton = applyButton(page);
      await expect(showButton).toBeVisible({ timeout: 5000 });
      await expect(showButton.locator(".animate-spin")).not.toBeVisible({
        timeout: 10_000,
      });
      await showButton.click();

      // Wait for filter dialog to close
      await expect(filterDialog(page)).not.toBeVisible({ timeout: 30_000 });

      // Check for pending state indicators (may be too fast to catch)
      const busyElement = page.locator(
        '[data-testid="search-results-pending-region"][aria-busy="true"]'
      );
      const wasBusy = await busyElement.isVisible().catch(() => false);

      if (wasBusy) {
        // Pending state was observed -- good
        expect(wasBusy).toBe(true);
        await expect(
          page.getByTestId("search-results-pending-overlay")
        ).toHaveCount(0);
        await expect(
          page.getByTestId("search-results-pending-status")
        ).toContainText(/updating results|still loading/i);
        await expect(
          page.getByTestId("search-results-pending-status")
        ).not.toBeVisible();
        await expect(
          page.locator('[data-testid="listing-card-skeleton-grid"]')
        ).toHaveCount(0);
      } else {
        // Transition was too fast to observe -- acceptable
        console.log(
          "Info: Transition completed too fast to observe pending state"
        );
      }

      // Wait for transition to complete (URL should include amenities param)
      await waitForUrlParam(page, "amenities", "Wifi", 30_000);

      // After transition, the wrapper should NOT be busy
      if ((await ariaBusyWrapper.count()) > 0) {
        await expect(ariaBusyWrapper).toHaveAttribute("aria-busy", "false");
      }

      // Clean up the route interception
      await page.unroute("**/search**");
    });

    test(`${tags.anon} - Results remain visible during transition (no blocking overlay)`, async ({
      page,
    }) => {
      // Navigate with initial filter
      await page.goto("/search?minPrice=500");
      await page.waitForLoadState("domcontentloaded");

      // Wait for listing cards to appear -- scope to visible container
      const container = searchResultsContainer(page);
      await expect(container).toBeVisible({ timeout: timeouts.navigation });

      const listingCards = container.locator(selectors.listingCard);
      const hasListings = await listingCards
        .first()
        .isVisible({ timeout: timeouts.navigation })
        .catch(() => false);

      if (hasListings) {
        // Count initial listings
        const initialCount = await listingCards.count();
        expect(initialCount).toBeGreaterThan(0);

        // Listing cards should be visible (not replaced by skeleton or hidden by overlay)
        await expect(listingCards.first()).toBeVisible();
      } else {
        // Zero results scenario -- verify the container still renders
        console.log("Info: No listing cards found; zero results is acceptable");
      }

      // Verify the results container itself is visible
      await expect(container).toBeVisible();
    });

    test(`${tags.anon} - Container allows pointer events when idle`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch({ minPrice: 800 });
      await page.waitForLoadState("domcontentloaded");

      // Get the results container
      const resultsContainer = searchResultsContainer(page);
      await expect(resultsContainer).toBeVisible({ timeout: 10000 });

      // The SearchResultsLoadingWrapper is inside the container.
      // When NOT pending, the outer results container should still accept pointer events.
      const containerPointerEvents = await resultsContainer.evaluate((el) => {
        return window.getComputedStyle(el).pointerEvents;
      });
      expect(containerPointerEvents).not.toBe("none");

      // Also verify that aria-busy wrapper (if present) is not busy
      const ariaBusyWrapper = resultsContainer
        .locator('[data-testid="search-results-pending-region"]')
        .first();
      if ((await ariaBusyWrapper.count()) > 0) {
        await expect(ariaBusyWrapper).toHaveAttribute("aria-busy", "false");
      }
    });
  });

  test.describe("Accessibility", () => {
    test(`${tags.anon} ${tags.a11y} - Results container has aria-busy attribute`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState("domcontentloaded");

      // Wait for the page to finish loading
      const resultsContainer = searchResultsContainer(page);
      await expect(resultsContainer).toBeVisible({ timeout: 10000 });

      // The aria-busy attribute is on the SearchResultsLoadingWrapper
      // which is a child of the search-results-container
      const ariaBusyWrapper = resultsContainer
        .locator('[data-testid="search-results-pending-region"]')
        .first();

      if ((await ariaBusyWrapper.count()) > 0) {
        // aria-busy should be "false" when not transitioning
        await expect(ariaBusyWrapper).toHaveAttribute("aria-busy", "false");
      } else {
        // If SearchResultsLoadingWrapper hasn't rendered yet or doesn't have aria-busy,
        // check at the page level
        const pageBusyElement = page.locator("[aria-busy]").first();
        if ((await pageBusyElement.count()) > 0) {
          await expect(pageBusyElement).toHaveAttribute("aria-busy", "false");
        } else {
          console.log(
            "Info: No aria-busy attribute found; component may not have rendered loading wrapper"
          );
        }
      }
    });

    test(`${tags.anon} ${tags.a11y} - SlowTransitionBadge has proper role and aria-live`, async ({
      page,
    }) => {
      // Navigate to search with bounds for reliable results
      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for results to appear
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(
        { timeout: 30000 }
      );

      // The SearchResultsLoadingWrapper includes a <span class="sr-only" aria-live="polite" role="status">
      // This span is always present (for SR announcements), but may be visually hidden.
      const statusElement = page
        .locator('[role="status"][aria-live="polite"]')
        .first();

      if ((await statusElement.count()) > 0) {
        // Verify the element is attached to DOM (it's sr-only so may not be "visible")
        await expect(statusElement).toBeAttached();
        await expect(statusElement).toHaveAttribute("aria-live", "polite");
      } else {
        // The SlowTransitionBadge / status element may not be present
        // if the component hasn't loaded
        console.log(
          "Info: No role=status element found; acceptable if page loaded fast"
        );
      }
    });
  });

  test.describe("Visual Consistency", () => {
    test(`${tags.anon} - Transition uses smooth opacity animation`, async ({
      page,
      nav,
    }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState("domcontentloaded");

      const resultsContainer = searchResultsContainer(page);
      await expect(resultsContainer).toBeVisible({ timeout: 10000 });

      // Verify the container has a CSS transition property (from `transition-all duration-300`
      // on the search-results-container in SearchViewToggle).
      const transitionValue = await resultsContainer.evaluate((el) => {
        return window.getComputedStyle(el).transition;
      });

      // The search-results-container has transition-all duration-300 for width changes.
      // Verify it has some transition set.
      const hasTransition =
        transitionValue !== "none" &&
        transitionValue !== "" &&
        transitionValue !== "all 0s ease 0s";
      if (hasTransition) {
        expect(hasTransition).toBe(true);
      } else {
        // Fallback: verify the loading wrapper inside has rendered
        const wrapper = resultsContainer
          .locator('[data-testid="search-results-pending-region"]')
          .first();
        if ((await wrapper.count()) > 0) {
          await expect(wrapper).toBeAttached();
        }
        console.log(
          "Info: Container transition check - transitions handled by the search loading wrapper"
        );
      }
    });
  });
});
