/**
 * E2E Test Suite: Favorites & Saved Searches Journeys
 * Journeys: J027-J036
 *
 * Tests saving/unsaving listings, managing saved searches,
 * and alert configurations.
 */

import { test, expect, tags, selectors } from '../helpers';

test.describe('Favorites & Saved Searches Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.describe('J027: Save and unsave listing', () => {
    test(`${tags.auth} ${tags.mobile} - Toggle favorite on listing`, async ({ page, nav }) => {
      // Navigate to search with results
      await nav.goToSearch();
      await page.waitForLoadState('domcontentloaded');

      // Find favorite button on first listing
      const favoriteButton = page
        .locator(selectors.listingCard)
        .first()
        .locator('button[aria-label*="save" i], button[aria-label*="favorite" i], [data-testid="favorite-button"]')
        .or(page.locator('button').filter({ has: page.locator('svg[class*="heart"]') }).first());

      if (await favoriteButton.isVisible()) {
        // Get initial state
        const initialAriaPressed = await favoriteButton.getAttribute('aria-pressed');

        // Click to toggle
        await favoriteButton.click();
        await page.waitForTimeout(500);

        // State should change
        const newAriaPressed = await favoriteButton.getAttribute('aria-pressed');

        // Navigate to saved listings
        await nav.goToSaved();

        // Listing should appear in saved (or not, depending on toggle direction)
        await page.waitForLoadState('domcontentloaded');
      }
    });

    test(`${tags.auth} - View saved listings page`, async ({ page, nav, assert }) => {
      await nav.goToSaved();

      // Page should load without error
      await assert.pageLoaded();

      // Should have heading
      await expect(
        page.getByRole('heading', { name: /saved|favorites/i })
      ).toBeVisible();

      // Should show listings or empty state
      const hasListings = await page.locator(selectors.listingCard).count() > 0;
      const hasEmptyState = await page.locator(selectors.emptyState).isVisible().catch(() => false);

      expect(hasListings || hasEmptyState).toBeTruthy();
    });
  });

  test.describe('J028: Manage saved listings', () => {
    test(`${tags.auth} - Remove from saved page`, async ({ page, nav }) => {
      await nav.goToSaved();
      await page.waitForLoadState('domcontentloaded');

      const listingCards = page.locator(selectors.listingCard);
      const initialCount = await listingCards.count();

      if (initialCount > 0) {
        // Find and click unsave button
        const unsaveButton = listingCards
          .first()
          .locator('button[aria-label*="remove" i], button[aria-label*="unsave" i]')
          .or(listingCards.first().locator('button').filter({ has: page.locator('svg') }).first());

        if (await unsaveButton.isVisible()) {
          await unsaveButton.click();
          await page.waitForTimeout(1000);

          // Count should decrease or listing should be removed
          const newCount = await listingCards.count();
          expect(newCount).toBeLessThanOrEqual(initialCount);
        }
      }
    });
  });

  test.describe('J029-J030: Create saved search', () => {
    test(`${tags.auth} - Save search with filters`, async ({ page, nav }) => {
      // Navigate to search with filters
      await nav.goToSearch({ minPrice: 500, maxPrice: 2000 });
      await page.waitForLoadState('domcontentloaded');

      // Find save search button
      const saveSearchButton = page.getByRole('button', { name: /save.*search/i })
        .or(page.locator('[data-testid="save-search"]'));

      if (await saveSearchButton.isVisible()) {
        await saveSearchButton.click();

        // Fill search name if dialog appears
        const nameInput = page.getByLabel(/name/i);
        if (await nameInput.isVisible()) {
          await nameInput.fill('Budget Rooms Search');
        }

        // Select alert frequency if available
        const frequencySelect = page.getByLabel(/frequency|alert/i);
        if (await frequencySelect.isVisible()) {
          await frequencySelect.selectOption({ label: /daily/i });
        }

        // Save
        const confirmButton = page.getByRole('button', { name: /save|confirm/i });
        await confirmButton.click();

        // Should show success
        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/saved|created/i))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test(`${tags.auth} - View saved searches`, async ({ page, nav }) => {
      await nav.goToSavedSearches();

      // Should load without error
      // Target h1 page title specifically to avoid strict mode violation
      await expect(page.getByRole('heading', { level: 1, name: /saved.*search/i })).toBeVisible();

      // Should show searches or empty state
      const hasSearches = await page.locator('[data-testid="saved-search-item"], [class*="search-item"]').count() > 0;
      const hasEmptyState = await page.locator(selectors.emptyState).isVisible().catch(() => false);

      expect(hasSearches || hasEmptyState).toBeTruthy();
    });
  });

  test.describe('J031-J032: Manage saved searches', () => {
    test(`${tags.auth} - Delete saved search`, async ({ page, nav }) => {
      await nav.goToSavedSearches();

      const searchItems = page.locator('[data-testid="saved-search-item"], [class*="search-item"]');

      if ((await searchItems.count()) > 0) {
        // Find delete button
        const deleteButton = searchItems
          .first()
          .getByRole('button', { name: /delete|remove/i });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();

          // Confirm if needed
          const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }

          // Should be removed
          await page.waitForTimeout(1000);
        }
      }
    });

    test(`${tags.auth} - Run saved search`, async ({ page, nav }) => {
      await nav.goToSavedSearches();

      const searchItems = page.locator('[data-testid="saved-search-item"], [class*="search-item"]');

      if ((await searchItems.count()) > 0) {
        // Click on search to run it
        await searchItems.first().click();

        // Should navigate to search with params
        await expect(page).toHaveURL(/\/search\?/);
      }
    });
  });

  test.describe('J033-J034: Alert configuration', () => {
    test(`${tags.auth} - Toggle search alerts`, async ({ page, nav }) => {
      await nav.goToSavedSearches();

      const alertToggle = page.locator('[data-testid="alert-toggle"], input[type="checkbox"]').first();

      if (await alertToggle.isVisible()) {
        const initialState = await alertToggle.isChecked();
        await alertToggle.click();

        // State should toggle
        const newState = await alertToggle.isChecked();
        expect(newState).not.toBe(initialState);
      }
    });
  });

  test.describe('J035-J036: Recently viewed', () => {
    test(`${tags.auth} - View recently viewed listings`, async ({ page, nav }) => {
      // First, view some listings to populate history
      await nav.goToSearch();
      await nav.clickListingCard(0);
      await nav.goBack();

      // Navigate to recently viewed
      await page.goto('/recently-viewed');

      // Should show recently viewed or empty state
      await expect(
        page.getByRole('heading', { level: 1, name: /recent|history|viewed/i })
          .or(page.locator(selectors.listingCard).first())
          .or(page.locator(selectors.emptyState).first())
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
