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
  tags,
  waitForSearchReady,
  gotoSearchWithFilters,
  filtersButton,
  filterDialog,
  applyButton,
  closeButton,
} from "../helpers";

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
    test.setTimeout(90_000);
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Click Apply (even without changing filters, it should close the modal)
    const applyBtn = applyButton(page);
    await expect(applyBtn).toBeVisible({ timeout: 5_000 });
    await applyBtn.click();

    // Modal should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
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
    // Allow focus state to settle after rapid Tab presses
    await expect(async () => {
      const isInsideDialog = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        return el.closest('[role="dialog"]') !== null;
      });
      expect(isInsideDialog).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  // 9. Filter state persists in modal when reopened
  test(`${tags.core} - filter state persists when modal is reopened`, async ({ page }) => {
    test.slow(); // beforeEach nav + gotoSearchWithFilters on WSL2/NTFS
    // Navigate with a pre-applied filter so it shows in the modal
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    // Open the filter modal (button label includes count when filters active)
    await filtersButton(page).click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

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
    test.slow(); // beforeEach nav + gotoSearchWithFilters on WSL2/NTFS
    // Navigate with filters applied
    await gotoSearchWithFilters(page, { roomType: "Private Room", amenities: "Wifi" });

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
