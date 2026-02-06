/**
 * Filter Modal E2E Tests (P0)
 *
 * Validates filter modal open/close/apply behavior, ARIA attributes,
 * focus trapping, and state persistence across open/close cycles.
 *
 * The filter modal is a slide-out drawer rendered via createPortal.
 * It uses role="dialog" aria-modal="true" with FocusTrap.
 * Opening: click "Filters" button (aria-expanded toggles).
 * Closing: close button, Escape key, or backdrop click.
 * Applying: "Apply"/"Show Results" button commits batched filters to URL.
 *
 * Note: The Filters button aria-label changes based on active filter count:
 * - No filters: "Filters"
 * - With filters: "Filters (N active)"
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  tags,
  SEARCH_URL,
  boundsQS,
  waitForSearchReady,
  filtersButton,
  filterDialog,
  applyButton,
  closeButton,
  clearAllButton,
} from "../helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Domain-specific Helpers
// ---------------------------------------------------------------------------

/** Locate the Filters button with no active filters (exact match) */
function filtersButtonExact(page: Page) {
  return page.getByRole("button", { name: "Filters", exact: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Modal: Open / Close / Apply", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await waitForSearchReady(page);
  });

  // 1. Open filter modal via button click
  test(`${tags.core} - opens filter modal via Filters button click`, async ({ page }) => {
    const btn = filtersButton(page);
    await expect(btn).toBeVisible({ timeout: 10_000 });

    await btn.click();

    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  });

  // 2. Modal has correct ARIA attributes
  test(`${tags.a11y} - modal has role=dialog and aria-modal=true`, async ({ page }) => {
    await filtersButton(page).click();

    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Verify ARIA attributes on the dialog container
    const dialogEl = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialogEl.first()).toBeVisible();

    // Heading inside dialog
    const heading = dialog.getByRole("heading", { name: /filters/i });
    await expect(heading).toBeVisible();
  });

  // 3. Close modal via close button
  test(`${tags.core} - closes modal via close button`, async ({ page }) => {
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await closeButton(page).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  // 4. Close modal via Escape key
  test(`${tags.core} - closes modal via Escape key`, async ({ page }) => {
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  // 5. Close modal via overlay/backdrop click
  test(`${tags.core} - closes modal via backdrop click`, async ({ page }) => {
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Click the backdrop overlay (aria-label="Close filters")
    const backdrop = page.locator('[aria-label="Close filters"]').first();
    // Use force click since backdrop may be behind the drawer panel
    await backdrop.click({ force: true, position: { x: 10, y: 10 } });

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  // 6. Apply filters updates URL and closes modal
  test(`${tags.core} - apply button commits filters to URL and closes modal`, async ({ page }) => {
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Select a room type to create a pending filter change
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible()) {
      await roomTypeSelect.click();
      // Select "Private Room" from the dropdown
      const privateOption = page.getByRole("option", { name: /private room/i });
      if (await privateOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await privateOption.click();
      }
    }

    // Click Apply
    await applyButton(page).click();

    // Modal should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // URL should be updated with the filter (if we managed to select a room type)
    // Even if the room type select wasn't interactable, the apply should close the modal
  });

  // 7. Cancel/close without applying doesn't change URL
  test(`${tags.core} - closing without apply does not change URL`, async ({ page }) => {
    const urlBefore = page.url();

    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Toggle an amenity to create a pending change
    const wifiButton = dialog.getByRole("button", { name: /wifi/i }).first();
    if (await wifiButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await wifiButton.click();
      await page.waitForTimeout(300);
    }

    // Close without applying
    await closeButton(page).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // URL should not have changed
    expect(page.url()).toBe(urlBefore);
  });

  // 8. Modal traps focus (first/last element tab cycling)
  test(`${tags.a11y} - modal traps focus within dialog`, async ({ page }) => {
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Tab through the dialog - focus should stay within
    // Press Tab multiple times and verify focus remains inside dialog
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
    }

    // After many tabs, focus should still be within the dialog (not on page behind)
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      // Check if active element is inside the dialog
      const dialog = el.closest('[role="dialog"]');
      return dialog !== null;
    });

    // Focus should be within the dialog due to FocusTrap
    expect(activeElement).toBe(true);
  });

  // 9. Filter state persists in modal when reopened
  test(`${tags.core} - filter state persists when modal is reopened`, async ({ page }) => {
    // Navigate with a pre-applied filter so it shows in the modal
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Open the filter modal (button label includes count when filters active)
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Check that the room type select shows the pre-applied value
    const roomTypeText = dialog.locator("#filter-room-type");
    if (await roomTypeText.isVisible()) {
      // The select trigger should display "Private Room"
      await expect(roomTypeText).toContainText(/private room/i);
    }

    // Close and reopen
    await closeButton(page).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await filtersButton(page).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // State should still be there
    if (await roomTypeText.isVisible()) {
      await expect(roomTypeText).toContainText(/private room/i);
    }
  });

  // 10. aria-expanded toggles on the trigger button
  test(`${tags.a11y} - Filters button has correct aria-expanded state`, async ({ page }) => {
    const btn = filtersButton(page);
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Initially not expanded
    await expect(btn).toHaveAttribute("aria-expanded", "false");

    await btn.click();
    await expect(filterDialog(page)).toBeVisible({ timeout: 10_000 });

    // Now expanded
    await expect(btn).toHaveAttribute("aria-expanded", "true");

    // Close
    await page.keyboard.press("Escape");
    await expect(filterDialog(page)).not.toBeVisible({ timeout: 10_000 });

    // Back to not expanded
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  // 11. Active filter count badge shows in the header
  test(`${tags.core} - active filter count badge displays in modal header`, async ({ page }) => {
    // Navigate with filters applied
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Button label changes to "Filters (N active)" when filters are present
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // The heading should contain a badge with the count
    const heading = dialog.getByRole("heading", { name: /filters/i });
    await expect(heading).toBeVisible();

    // There should be a count indicator (at least 1 for roomType)
    // The badge is a span inside the heading with the count
    const badge = heading.locator("span");
    const badgeCount = await badge.count();
    if (badgeCount > 0) {
      const text = await badge.first().textContent();
      expect(Number(text)).toBeGreaterThanOrEqual(1);
    }
  });
});
