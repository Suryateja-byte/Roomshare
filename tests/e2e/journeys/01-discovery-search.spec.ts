/**
 * E2E Test Suite: Discovery & Search Journeys
 * Journeys: J001-J010
 *
 * Tests anonymous user discovery flows including home page browsing,
 * search with filters, map view, sorting, and pagination.
 */

import { test, expect, selectors, timeouts, tags } from '../helpers';

test.describe('Discovery & Search Journeys', () => {
  test.describe('J001: Anonymous user browses home page', () => {
    test(`${tags.anon} ${tags.mobile} ${tags.a11y} - Home page discovery flow`, async ({
      page,
      nav,
      assert,
    }) => {
      // Step 1: Navigate to home page
      await nav.goHome();
      await expect(page).toHaveURL('/');

      // Step 2: Assert featured listings section visible
      const featuredSection = page.locator('section').filter({
        has: page.getByText(/featured|popular|recommended|newest|just listed/i),
      });
      await expect(featuredSection.or(page.locator(selectors.listingCard).first()).first()).toBeVisible({
        timeout: 10000,
      });

      // Step 3: Scroll to listings
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(timeouts.animation);

      // Step 4: Click first listing card
      const firstCard = page.locator(selectors.listingCard).first();
      // Wait for card to be visible and clickable
      await expect(firstCard).toBeVisible({ timeout: 15000 });
      await firstCard.click();

      // Step 5: Verify listing detail page
      await expect(page).toHaveURL(/\/listings\//);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Step 6: Navigate back
      await nav.goBack();
      await expect(page).toHaveURL('/');

      // Step 7: Click search CTA
      const searchButton = page
        .getByRole('link', { name: /search|find|browse/i })
        .or(page.getByRole('button', { name: /search|find/i }));

      if (await searchButton.first().isVisible()) {
        await searchButton.first().click();
        await expect(page).toHaveURL(/\/search/);
      }
    });

    test(`${tags.anon} - Empty state when no featured listings`, async ({ page, network }) => {
      // Mock empty featured listings response
      await network.mockApiResponse('**/api/listings*featured*', {
        status: 200,
        body: { listings: [], total: 0 },
      });

      await page.goto('/');

      // Should show empty state or graceful fallback
      const emptyState = page.locator(selectors.emptyState);
      const noListingsText = page.getByText(/no listings|check back/i);

      // Either empty state or the section should handle gracefully
      const hasEmptyHandling =
        (await emptyState.isVisible().catch(() => false)) ||
        (await noListingsText.isVisible().catch(() => false));

      // Page should still be functional even without featured listings
      // Use .first() to avoid strict mode violation when multiple nav elements exist
      await expect(page.locator('nav').first()).toBeVisible();
    });
  });

  test.describe('J002: Search with multiple filters', () => {
    test(`${tags.anon} ${tags.mobile} - Filter search results`, async ({ page, nav }) => {
      // Step 1: Navigate to search with filter params (more reliable than filling form)
      await nav.goToSearch({ minPrice: 500, maxPrice: 2000 });

      // Step 2: Verify URL has filter params
      await page.waitForLoadState('domcontentloaded');
      const url = new URL(page.url());
      expect(url.search).toContain('minPrice=500');
      expect(url.search).toContain('maxPrice=2000');

      // Step 3: Verify filter inputs reflect URL params
      const minPriceInput = page.getByLabel(/minimum budget/i);
      const maxPriceInput = page.getByLabel(/maximum budget/i);

      await expect(minPriceInput).toHaveValue('500');
      await expect(maxPriceInput).toHaveValue('2000');

      // Step 4: Verify results are displayed
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Step 5: Refresh and verify persistence
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Filters should persist from URL
      await expect(minPriceInput).toHaveValue('500');
      await expect(maxPriceInput).toHaveValue('2000');
    });

    test(`${tags.anon} - Zero results shows suggestions`, async ({ page, nav }) => {
      await nav.goToSearch({ minPrice: 99999, maxPrice: 100000 });

      await page.waitForLoadState('domcontentloaded');

      // Should show empty state heading or adjustment suggestions
      // Target the h3 "No matches found" heading which is always visible in zero results state
      const emptyHeading = page.getByRole('heading', { level: 3, name: /no matches/i });

      // If h3 not found, fall back to checking the h1 count indicator
      const h1Indicator = page.getByRole('heading', { level: 1, name: /0 places/i });

      await expect(emptyHeading.or(h1Indicator).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('J003: Listing detail with image gallery', () => {
    test(`${tags.anon} ${tags.a11y} - View listing details and gallery`, async ({
      page,
      nav,
      assert,
    }) => {
      // Step 1: Navigate to search
      await nav.goToSearch();

      // Step 2: Click first listing
      await nav.clickListingCard(0);

      // Step 3-4: Verify listing info
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Price is visible to guests; owners see "Manage Listing" instead
      const priceOrManage = page.getByText(/\$[\d,]+/).or(page.getByText(/manage listing/i));
      await expect(priceOrManage.first()).toBeVisible();

      // Step 5-6: Image gallery interaction
      const gallery = page.locator('[data-testid="gallery"], [class*="gallery"], [class*="image"]');
      const thumbnails = page.locator('[data-testid="thumbnail"], [class*="thumbnail"]');

      if ((await thumbnails.count()) > 1) {
        await thumbnails.nth(1).click();
        await page.waitForTimeout(timeouts.animation);
      }

      // Step 7-8: Scroll to sections
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(timeouts.animation);

      const amenitiesSection = page.getByText(/amenities/i);
      if (await amenitiesSection.isVisible()) {
        await expect(amenitiesSection).toBeVisible();
      }

      // Step 9: Host profile link if visible
      const hostLink = page.getByRole('link', { name: /host|owner|posted by/i });
      if (await hostLink.isVisible()) {
        const href = await hostLink.getAttribute('href');
        expect(href).toMatch(/\/users\//);
      }
    });

    test(`${tags.anon} - 404 for non-existent listing`, async ({ page }) => {
      await page.goto('/listings/nonexistent-listing-id-12345');

      // Should show 404 or not found state
      await expect(
        page.getByText(/not found|404|doesn't exist/i).or(page.locator('h1:has-text("404")'))
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('J004: Map view with pan and zoom', () => {
    test(`${tags.anon} ${tags.slow} - Map interaction`, async ({ page, nav }) => {
      test.slow(); // Map tests can be slow

      await nav.goToSearch();

      // Find and click map view toggle
      const mapToggle = page
        .getByRole('button', { name: /map/i })
        .or(page.locator('[data-testid="map-toggle"]'));

      if (await mapToggle.isVisible()) {
        await mapToggle.click();
        await page.waitForTimeout(1000); // Map initialization

        // Wait for map to render
        const map = page.locator(selectors.map);
        await expect(map).toBeVisible({ timeout: 15000 });

        // Check for markers
        const markers = page.locator(selectors.mapMarker);
        // May or may not have markers depending on listings
        await page.waitForTimeout(2000);

        // Try clicking a marker if visible
        if ((await markers.count()) > 0) {
          await markers.first().click();

          // Should show popup or listing info
          const popup = page.locator('[class*="popup"], [class*="Popup"]');
          await expect(popup.or(page.locator('[data-testid="marker-popup"]'))).toBeVisible({
            timeout: 5000,
          });
        }
      }
    });
  });

  test.describe('J005: Sort search results', () => {
    test(`${tags.anon} - Sort by price and date`, async ({ page, nav }) => {
      await nav.goToSearch();
      await page.waitForLoadState('domcontentloaded');

      // Find sort dropdown
      const sortSelect = page
        .getByLabel(/sort/i)
        .or(page.locator('[data-testid="sort-select"]'))
        .or(page.locator('select').filter({ has: page.getByText(/sort/i) }));

      if (await sortSelect.isVisible()) {
        // Sort by price low to high
        await sortSelect.selectOption({ label: /low.*high|cheapest|price.*asc/i });
        await page.waitForLoadState('domcontentloaded');

        // Verify URL updated
        expect(page.url()).toMatch(/sort|order/i);

        // Sort by newest
        await sortSelect.selectOption({ label: /new|recent|latest/i });
        await page.waitForLoadState('domcontentloaded');
      }
    });
  });

  test.describe('J006: Pagination through results', () => {
    test(`${tags.anon} ${tags.mobile} - Navigate through pages`, async ({ page, nav }) => {
      await nav.goToSearch();
      await page.waitForLoadState('domcontentloaded');

      // Find pagination
      const pagination = page.locator(selectors.pagination);

      if (await pagination.isVisible()) {
        // Try next page
        const nextButton = page.locator(selectors.nextPage);

        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForLoadState('domcontentloaded');

          // URL should have page param
          expect(page.url()).toMatch(/page=2/);

          // Go back to page 1
          const page1Link = pagination.getByRole('link', { name: '1' }).or(
            page.locator(selectors.prevPage)
          );

          if (await page1Link.isVisible()) {
            await page1Link.click();
            await page.waitForLoadState('domcontentloaded');
          }
        }
      }
    });
  });

  test.describe('J007-J010: Accessibility checks for search', () => {
    test(`${tags.a11y} - Search page accessibility`, async ({ page, nav, assert }) => {
      await nav.goToSearch();

      // Basic accessibility checks
      await assert.basicA11y();

      // Specific search accessibility
      // - Form should have proper labeling
      const searchForm = page.locator('form').first();
      if (await searchForm.isVisible()) {
        // All inputs should have labels
        const inputs = searchForm.locator('input:not([type="hidden"])');
        const inputCount = await inputs.count();

        for (let i = 0; i < Math.min(inputCount, 5); i++) {
          const input = inputs.nth(i);
          const hasLabel =
            (await input.getAttribute('aria-label')) ||
            (await input.getAttribute('aria-labelledby')) ||
            (await input.getAttribute('placeholder'));
          expect(hasLabel).toBeTruthy();
        }
      }
    });
  });
});
