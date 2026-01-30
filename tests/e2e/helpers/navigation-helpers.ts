import { Page, expect } from "@playwright/test";
import { selectors, timeouts } from "./test-utils";

/**
 * Wait for page to be ready - more reliable than networkidle
 * Uses domcontentloaded + element visibility instead of waiting for all network traffic
 */
async function waitForPageReady(
  page: Page,
  options?: {
    selector?: string;
    timeout?: number;
  },
) {
  const timeout = options?.timeout ?? timeouts.action;
  const selector = options?.selector ?? 'main, [role="main"], #__next';

  await page.waitForLoadState("domcontentloaded");

  try {
    await page.locator(selector).first().waitFor({
      state: "visible",
      timeout,
    });
  } catch {
    // Fallback: just ensure body is visible
    await page.locator("body").waitFor({ state: "visible", timeout: 5000 });
  }
}

/**
 * Navigation helper factory
 */
export function navigationHelpers(page: Page) {
  return {
    /**
     * Navigate to home page
     */
    async goHome() {
      await page.goto("/");
      await waitForPageReady(page, { selector: "nav, main" });
    },

    /**
     * Navigate to search page with optional query
     */
    async goToSearch(query?: {
      location?: string;
      q?: string;
      minPrice?: number;
      maxPrice?: number;
      moveIn?: string;
      roomType?: string;
      bounds?: {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
      };
    }) {
      let url = "/search";
      if (query) {
        const params = new URLSearchParams();
        if (query.location) params.set("location", query.location);
        if (query.q) params.set("q", query.q);
        if (query.minPrice) params.set("minPrice", query.minPrice.toString());
        if (query.maxPrice) params.set("maxPrice", query.maxPrice.toString());
        if (query.moveIn) params.set("moveIn", query.moveIn);
        if (query.roomType) params.set("roomType", query.roomType);
        if (query.bounds) {
          params.set("minLat", query.bounds.minLat.toString());
          params.set("maxLat", query.bounds.maxLat.toString());
          params.set("minLng", query.bounds.minLng.toString());
          params.set("maxLng", query.bounds.maxLng.toString());
        }
        if (params.toString()) url += `?${params.toString()}`;
      }
      await page.goto(url);
      await waitForPageReady(page, {
        selector: 'form, [data-testid="search-form"], main',
      });
    },

    /**
     * Navigate to a specific listing
     */
    async goToListing(listingId: string) {
      await page.goto(`/listings/${listingId}`);
      await waitForPageReady(page, {
        selector: 'h1, [data-testid="listing-detail"]',
      });
    },

    /**
     * Navigate to create listing page
     */
    async goToCreateListing() {
      await page.goto("/listings/create");
      await waitForPageReady(page, { selector: "form, h1" });
    },

    /**
     * Navigate to messages
     */
    async goToMessages(conversationId?: string) {
      const url = conversationId ? `/messages/${conversationId}` : "/messages";
      await page.goto(url);
      await waitForPageReady(page, {
        selector: '[data-testid="messages"], h1, main',
      });
    },

    /**
     * Navigate to bookings
     */
    async goToBookings() {
      await page.goto("/bookings");
      await waitForPageReady(page, {
        selector: 'h1, [data-testid="bookings"]',
      });
    },

    /**
     * Navigate to profile
     */
    async goToProfile() {
      await page.goto("/profile");
      await waitForPageReady(page, { selector: 'h1, [data-testid="profile"]' });
    },

    /**
     * Navigate to settings
     */
    async goToSettings() {
      await page.goto("/settings");
      await waitForPageReady(page, { selector: "h1, form" });
    },

    /**
     * Navigate to saved listings
     */
    async goToSaved() {
      await page.goto("/saved");
      await waitForPageReady(page, { selector: 'h1, [data-testid="saved"]' });
    },

    /**
     * Navigate to saved searches
     */
    async goToSavedSearches() {
      await page.goto("/saved-searches");
      await waitForPageReady(page, {
        selector: 'h1, [data-testid="saved-searches"]',
      });
    },

    /**
     * Navigate to notifications
     */
    async goToNotifications() {
      await page.goto("/notifications");
      await waitForPageReady(page, {
        selector: 'h1, [data-testid="notifications"]',
      });
    },

    /**
     * Navigate to admin panel
     */
    async goToAdmin() {
      await page.goto("/admin");
      await waitForPageReady(page, { selector: 'h1, [data-testid="admin"]' });
    },

    /**
     * Navigate to verification page
     */
    async goToVerification() {
      await page.goto("/verify");
      await waitForPageReady(page, { selector: "h1, form" });
    },

    /**
     * Click a listing card and wait for detail page
     */
    async clickListingCard(index = 0) {
      // Wait for listing cards to appear
      const cards = page.locator('[data-testid="listing-card"]');
      await cards.first().waitFor({ state: 'attached', timeout: 15000 });

      const count = await cards.count();
      if (count === 0 || index >= count) {
        throw new Error(`No listing card found at index ${index}`);
      }

      // Navigate directly to the listing URL from the card's link href
      const card = cards.nth(index);
      const link = card.locator('a[href^="/listings/"]').first();
      const href = await link.getAttribute('href');
      if (!href) {
        throw new Error(`No listing link found in card at index ${index}`);
      }
      await page.goto(href);
      await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    },

    /**
     * Use the search form from any page
     */
    async search(location: string) {
      const searchInput = page
        .getByPlaceholder(/location|city|area|where/i)
        .or(page.locator('input[name="location"]'))
        .or(page.locator('[data-testid="search-input"]'));

      await searchInput.fill(location);
      await searchInput.press("Enter");
      await page.waitForURL(/\/search/, { timeout: timeouts.navigation });
    },

    /**
     * Navigate via navbar menu
     */
    async navigateViaMenu(menuItem: string) {
      // Open user menu if it exists
      const userMenuButton = page
        .getByRole("button", { name: /menu|profile|account/i })
        .or(page.locator('[data-testid="user-menu"]'));

      if (await userMenuButton.isVisible()) {
        await userMenuButton.click();
        await page.waitForTimeout(200);
      }

      // Click the menu item
      await page
        .getByRole("menuitem", { name: new RegExp(menuItem, "i") })
        .or(page.getByRole("link", { name: new RegExp(menuItem, "i") }))
        .click();

      await waitForPageReady(page);
    },

    /**
     * Wait for page navigation to complete
     */
    async waitForNavigation(urlPattern: string | RegExp) {
      await page.waitForURL(urlPattern, { timeout: timeouts.navigation });
      await waitForPageReady(page);
    },

    /**
     * Go back in history
     */
    async goBack() {
      await page.goBack();
      await waitForPageReady(page, { selector: "main" });
    },

    /**
     * Refresh the current page
     */
    async refresh() {
      await page.reload();
      await waitForPageReady(page, { selector: "main" });
    },

    /**
     * Get current URL path
     */
    getCurrentPath(): string {
      return new URL(page.url()).pathname;
    },

    /**
     * Assert current URL matches pattern
     */
    async assertUrl(pattern: string | RegExp) {
      await expect(page).toHaveURL(pattern);
    },

    /**
     * Handle pagination
     */
    async goToNextPage() {
      const nextButton = page.locator(selectors.nextPage);
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await waitForPageReady(page, { selector: selectors.listingCard });
        return true;
      }
      return false;
    },

    async goToPrevPage() {
      const prevButton = page.locator(selectors.prevPage);
      if (await prevButton.isEnabled()) {
        await prevButton.click();
        await waitForPageReady(page, { selector: selectors.listingCard });
        return true;
      }
      return false;
    },

    /**
     * Scroll to bottom of page (for infinite scroll)
     */
    async scrollToBottom() {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(500);
    },

    /**
     * Scroll to top of page
     */
    async scrollToTop() {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(200);
    },
  };
}
