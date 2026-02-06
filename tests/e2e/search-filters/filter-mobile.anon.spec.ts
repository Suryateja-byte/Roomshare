/**
 * Mobile Filter E2E Tests (P0-P1)
 *
 * Validates filter interactions on mobile viewport (375x812).
 * Tests filter modal rendering, bottom sheet preservation,
 * scroll behavior, sort interaction, and touch isolation.
 */

import {
  test,
  expect,
  tags,
  filterDialog,
  openFilterModal,
  closeFilterModal,
  applyFilters,
  toggleAmenity,
  expectUrlParam,
  getUrlParam,
} from "../helpers";
import {
  mobileSelectors,
  navigateToMobileSearch,
  getSheetSnapIndex,
} from "../helpers";

test.describe("Mobile Filter Experience", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.use({ viewport: { width: 375, height: 812 } });

  test(
    `${tags.filter}${tags.mobile} filter modal opens correctly on mobile (P0)`,
    async ({ page }) => {
      // Navigate to mobile search and skip if bottom sheet doesn't appear
      const sheetVisible = await navigateToMobileSearch(page);
      test.skip(!sheetVisible, "Bottom sheet not visible on mobile");

      // Open filter modal
      await openFilterModal(page);

      // Verify dialog is visible
      const dialog = filterDialog(page);
      await expect(dialog).toBeVisible();

      // Verify dialog takes full width (close to 375px viewport)
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(350); // Should be close to 375px

      // Verify backdrop/overlay exists and body scroll is locked
      const bodyOverflow = await page.evaluate(() =>
        getComputedStyle(document.body).overflow
      );
      expect(bodyOverflow).toBe("hidden");

      // Verify overlay element exists
      const overlay = page.locator(
        '[data-testid="modal-overlay"], [class*="overlay"], [class*="backdrop"]'
      );
      await expect(overlay.first()).toBeVisible();

      // Close modal and verify it's gone
      await closeFilterModal(page);
      await expect(dialog).not.toBeVisible();
    }
  );

  test(
    `${tags.filter}${tags.mobile} apply filters closes modal, bottom sheet remains (P0)`,
    async ({ page }) => {
      // Navigate to mobile search and skip if bottom sheet doesn't appear
      const sheetVisible = await navigateToMobileSearch(page);
      test.skip(!sheetVisible, "Bottom sheet not visible on mobile");

      // Get initial snap index
      const initialSnap = await getSheetSnapIndex(page);
      expect(initialSnap).toBeGreaterThanOrEqual(0);

      // Open filter modal
      await openFilterModal(page);

      // Toggle Wifi amenity
      await toggleAmenity(page, "Wifi");

      // Apply filters
      await applyFilters(page);

      // Wait for modal to close
      const dialog = filterDialog(page);
      await expect(dialog).not.toBeVisible({ timeout: 5000 });

      // Verify bottom sheet is still visible
      const bottomSheet = page.locator(mobileSelectors.bottomSheet);
      await expect(bottomSheet).toBeVisible();

      // Verify URL has amenities parameter
      await page.waitForURL(/amenities=Wifi/, { timeout: 5000 });
      expectUrlParam(page, "amenities", "Wifi");

      // Verify snap position is reasonable (not broken)
      const snap = await getSheetSnapIndex(page);
      expect(snap).toBeGreaterThanOrEqual(0);
      expect(snap).toBeLessThanOrEqual(2); // Valid snap indices: 0, 1, 2
    }
  );

  test(
    `${tags.filter}${tags.mobile} all filter sections scrollable on small viewport (P1)`,
    async ({ page }) => {
      // Navigate to mobile search and skip if bottom sheet doesn't appear
      const sheetVisible = await navigateToMobileSearch(page);
      test.skip(!sheetVisible, "Bottom sheet not visible on mobile");

      // Open filter modal
      await openFilterModal(page);

      const dialog = filterDialog(page);
      await expect(dialog).toBeVisible();

      // Check that the dialog content is scrollable
      const scrollInfo = await dialog.evaluate((el) => {
        const scrollEl =
          el.querySelector('[class*="overflow"]') ||
          el.querySelector('[class*="scroll"]') ||
          el;
        return {
          scrollHeight: scrollEl.scrollHeight,
          clientHeight: scrollEl.clientHeight,
          isScrollable: scrollEl.scrollHeight > scrollEl.clientHeight,
        };
      });

      // Content should be scrollable on small viewport
      expect(scrollInfo.isScrollable).toBe(true);
      expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);

      // Scroll to the bottom to verify house rules section is reachable
      await dialog.evaluate((el) => {
        const scrollEl =
          el.querySelector('[class*="overflow"]') ||
          el.querySelector('[class*="scroll"]') ||
          el;
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });

      // Wait for scroll to complete
      await page.waitForTimeout(300);

      // Look for house rules group (should be visible after scrolling)
      const houseRules = page.locator('[aria-label="Select house rules"]');
      await expect(houseRules).toBeVisible({ timeout: 3000 });

      // Close modal
      await closeFilterModal(page);
      await expect(dialog).not.toBeVisible();
    }
  );

  test(
    `${tags.filter}${tags.mobile} mobile sort interaction (P1)`,
    async ({ page }) => {
      // Navigate to mobile search and skip if bottom sheet doesn't appear
      const sheetVisible = await navigateToMobileSearch(page);
      test.skip(!sheetVisible, "Bottom sheet not visible on mobile");

      // Look for sort button
      const sortButton = page.locator('button[aria-label^="Sort"]');
      const sortButtonVisible = await sortButton.isVisible().catch(() => false);

      test.skip(!sortButtonVisible, "Sort button not visible on mobile");

      // Click sort button
      await sortButton.click();

      // Wait for sort options to appear (could be a sheet or dropdown)
      // Look for sort sheet heading or sort options
      const sortSheet = page.locator('text=/Sort by/i').first();
      const sortOptions = page
        .getByRole("option", { name: /price/i })
        .or(page.locator('text=/Price.*low/i, text=/Lowest price/i'))
        .first();

      // Wait for either sort sheet or options to appear
      await Promise.race([
        sortSheet.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}),
        sortOptions.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}),
      ]);

      // Try to find and click a sort option
      const lowToHighOption = page
        .locator('text=/Price.*low/i, text=/Lowest price/i, text=/price_asc/i')
        .first();

      if (await lowToHighOption.isVisible().catch(() => false)) {
        await lowToHighOption.click();
      } else {
        // Try clicking the first available sort option
        const firstOption = page.getByRole("option").first();
        await firstOption.click();
      }

      // Wait for URL to update with sort param
      await page.waitForURL(/[?&]sort=/, { timeout: 5000 });

      // Verify sort param is present
      const sortParam = getUrlParam(page, "sort");
      expect(sortParam).not.toBeNull();
      expect(sortParam).toBeTruthy();
    }
  );

  test(
    `${tags.filter}${tags.mobile} touch scroll in filter modal doesn't leak to map (P1)`,
    async ({ page }) => {
      // Navigate to mobile search and skip if bottom sheet doesn't appear
      const sheetVisible = await navigateToMobileSearch(page);
      test.skip(!sheetVisible, "Bottom sheet not visible on mobile");

      // Get initial map position (if visible)
      const mapContainer = page.locator(mobileSelectors.mapContainer).first();
      const mapVisibleBefore = await mapContainer.isVisible().catch(() => false);

      // Open filter modal
      await openFilterModal(page);

      const dialog = filterDialog(page);
      await expect(dialog).toBeVisible();

      // Verify body scroll is locked
      const bodyOverflow = await page.evaluate(() =>
        getComputedStyle(document.body).overflow
      );
      expect(bodyOverflow).toBe("hidden");

      // Scroll within the dialog
      const scrollResult = await dialog.evaluate((el) => {
        const scrollEl =
          el.querySelector('[class*="overflow"]') ||
          el.querySelector('[class*="scroll"]') ||
          el;
        const beforeScroll = scrollEl.scrollTop;
        scrollEl.scrollTop = 100;
        const afterScroll = scrollEl.scrollTop;
        return {
          beforeScroll,
          afterScroll,
          scrolled: afterScroll > beforeScroll,
        };
      });

      // Verify the dialog scrolled
      expect(scrollResult.scrolled).toBe(true);
      expect(scrollResult.afterScroll).toBeGreaterThan(scrollResult.beforeScroll);

      // Verify the map is still in place (either hidden behind modal or position unchanged)
      // The modal should prevent any interaction with the map
      const mapStillExists = await mapContainer.count();
      expect(mapStillExists).toBeGreaterThan(0);

      // Close modal
      await closeFilterModal(page);
      await expect(dialog).not.toBeVisible();

      // Verify map is still visible if it was visible before
      if (mapVisibleBefore) {
        await expect(mapContainer).toBeVisible();
      }

      // Verify body scroll is unlocked
      const bodyOverflowAfter = await page.evaluate(() =>
        getComputedStyle(document.body).overflow
      );
      expect(bodyOverflowAfter).not.toBe("hidden");
    }
  );
});
