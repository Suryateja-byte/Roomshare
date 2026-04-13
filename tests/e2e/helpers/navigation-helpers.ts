import { Page, expect } from "@playwright/test";
import { selectors, timeouts, waitForHydration } from "./test-utils";

/**
 * Wait for page to be ready - more reliable than domcontentloaded
 * Uses domcontentloaded + element visibility instead of waiting for all network traffic
 */
async function waitForPageReady(
  page: Page,
  options?: {
    selector?: string;
    timeout?: number;
  }
) {
  const timeout = options?.timeout ?? timeouts.action;
  const selector = options?.selector ?? 'main, [role="main"], #__next';

  await page.waitForLoadState("domcontentloaded");

  // Wait for Next.js streaming SSR hidden divs to be swapped and removed.
  // This prevents Playwright strict mode violations from duplicate elements
  // that exist in both the visible DOM and hidden streaming containers.
  await waitForHydration(page, { timeout });

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

async function getSearchShellQueryHash(page: Page): Promise<string | null> {
  return page
    .locator(
      '[data-testid="search-shell"], [data-search-query-hash], [data-query-hash]'
    )
    .first()
    .getAttribute("data-search-query-hash")
    .catch(async () => {
      const shell = page
        .locator(
          '[data-testid="search-shell"], [data-search-query-hash], [data-query-hash]'
        )
        .first();
      return (
        (await shell.getAttribute("data-query-hash").catch(() => null)) ?? null
      );
    });
}

async function waitForSearchTransition(
  page: Page,
  previousUrl: string,
  previousQueryHash: string | null,
  timeout: number
): Promise<boolean> {
  return page
    .waitForFunction(
      ({ prevUrl, prevHash }) => {
        const currentUrl = window.location.href;
        const onSearchPage = window.location.pathname.startsWith("/search");
        const shell = document.querySelector(
          '[data-testid="search-shell"], [data-search-query-hash], [data-query-hash]'
        );
        const currentHash =
          shell?.getAttribute("data-search-query-hash") ??
          shell?.getAttribute("data-query-hash") ??
          null;

        return onSearchPage && (currentUrl !== prevUrl || currentHash !== prevHash);
      },
      { prevUrl: previousUrl, prevHash: previousQueryHash },
      { timeout }
    )
    .then(() => true)
    .catch(() => false);
}

/**
 * Check whether the page was redirected to /login (auth expired).
 * Returns true if we are on the intended page, false if redirected to login.
 * Protected-route tests should call this after navigation to skip gracefully
 * when the auth session is invalid in CI.
 */
async function isOnAuthenticatedPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login") || url.includes("/signin")) {
    return false;
  }
  return true;
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
      await cards.first().waitFor({ state: "attached", timeout: 30000 });

      const count = await cards.count();
      if (count === 0 || index >= count) {
        throw new Error(`No listing card found at index ${index}`);
      }

      // Navigate directly to the listing URL from the card's link href
      const card = cards.nth(index);
      const link = card.locator('a[href^="/listings/"]').first();
      const href = await link.getAttribute("href");
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
      const initialUrl = page.url();
      const initialQueryHash = await getSearchShellQueryHash(page);
      const searchInput = page
        .locator(
          [
            'input[placeholder*="Search destinations" i]',
            'input[placeholder*="location" i]',
            'input[placeholder*="city" i]',
            'input[placeholder*="area" i]',
            'input[placeholder*="where" i]',
            'input[name="location"]',
            '[data-testid="search-input"] input',
            '[data-testid="search-input"]',
          ].join(", ")
        )
        .filter({ visible: true })
        .first();

      await searchInput.click();
      await searchInput.fill(location);
      const suggestionButton = page
        .locator('[role="listbox"] button')
        .filter({ visible: true })
        .first();

      const selectedSuggestion = await suggestionButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

      if (selectedSuggestion) {
        await suggestionButton.click();
      }

      const form = searchInput.locator("xpath=ancestor::form[1]");
      const searchButton = form
        .getByRole("button", { name: /^search$/i })
        .or(form.locator('button[aria-label="Search"]'))
        .filter({ visible: true })
        .first();

      await searchInput.press("Enter").catch(() => {});

      const navigated = await waitForSearchTransition(
        page,
        initialUrl,
        initialQueryHash,
        5_000
      );

      if (!navigated) {
        await searchButton.click();
        await waitForSearchTransition(
          page,
          initialUrl,
          initialQueryHash,
          timeouts.navigation
        );
      }

      await waitForPageReady(page, { selector: "main" });
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
        // Wait for menu panel to be visible after click
        const menuPanel = page
          .getByRole("menu")
          .or(page.locator('[role="menubar"]'))
          .or(page.locator('[data-testid="user-menu-panel"]'));
        await expect(menuPanel.first()).toBeVisible({ timeout: 5_000 });
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
      // Wait for scroll and any triggered rendering to settle
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      );
    },

    /**
     * Scroll to top of page
     */
    async scrollToTop() {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      // Wait for scroll and any triggered rendering to settle
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      );
    },

    /**
     * Check if the page is on an authenticated route (not redirected to /login).
     * Call after navigating to a protected route. Returns false if auth session
     * is expired and the app redirected to /login.
     */
    async isOnAuthenticatedPage(): Promise<boolean> {
      return isOnAuthenticatedPage(page);
    },
  };
}
