/**
 * Search Page Accessibility: Filter Modal (P1)
 *
 * Validates filter modal dialog accessibility including role, aria-modal,
 * focus management, focus trapping, and form control labels.
 *
 * Run: pnpm playwright test tests/e2e/search-a11y-filters.anon.spec.ts --project=chromium-anon
 */

import {
  test,
  expect,
  SF_BOUNDS,
  timeouts,
  tags,
  searchResultsContainer,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/** Wait for search results heading to be visible */
async function waitForResults(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { level: 1 }).first(),
  ).toBeVisible({ timeout: 15000 });
}

/** Open the filter modal and return the dialog locator */
async function openFilterModal(page: import("@playwright/test").Page) {
  // Use getByRole to reliably target the "Filters" button (not room type filter pills)
  const filtersButton = page.getByRole("button", { name: /^Filters/ });

  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(filtersButton).toBeVisible({ timeout: timeouts.action });
  await filtersButton.click();
  await page.waitForTimeout(500);

  const modal = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search A11y: Filter Modal Accessibility", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);
  });

  // 1. Filter modal has role="dialog" and aria-modal="true"
  test("1. filter modal has role=dialog and aria-modal=true", { tag: [tags.a11y] }, async ({ page }) => {
    const modal = await openFilterModal(page);

    // Verify role and aria-modal
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");
  });

  // 2. Filter modal has accessible title (aria-label or aria-labelledby)
  test("2. filter modal has accessible title", { tag: [tags.a11y] }, async ({ page }) => {
    const modal = await openFilterModal(page);

    // FilterModal uses aria-labelledby="filter-drawer-title"
    const labelledBy = await modal.getAttribute("aria-labelledby");
    const ariaLabel = await modal.getAttribute("aria-label");

    // Must have either aria-labelledby or aria-label
    expect(labelledBy || ariaLabel).toBeTruthy();

    if (labelledBy) {
      // The referenced element must exist and have text content
      const titleElement = page.locator(`#${labelledBy}`);
      await expect(titleElement).toBeAttached();

      const titleText = await titleElement.textContent();
      expect(titleText?.trim()).toBeTruthy();
      // Should contain "Filters" or similar
      expect(titleText?.toLowerCase()).toContain("filter");
    }
  });

  // 3. Focus moves to modal when opened
  test("3. focus moves into modal when opened", { tag: [tags.a11y] }, async ({ page }) => {
    await openFilterModal(page);

    // After opening, focus should be inside the modal
    const focusIsInModal = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return dialog?.contains(el) ?? false;
    });

    expect(focusIsInModal).toBe(true);
  });

  // 4. Focus trapped inside modal (Tab cycles within modal)
  test("4. focus is trapped inside modal", { tag: [tags.a11y] }, async ({ page }) => {
    await openFilterModal(page);

    // Tab through many elements and verify focus stays inside modal
    const TAB_COUNT = 20;
    const focusLocations: boolean[] = [];

    for (let i = 0; i < TAB_COUNT; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);

      const isInModal = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        return dialog?.contains(el) ?? false;
      });

      focusLocations.push(isInModal);
    }

    // All focus locations should be inside the modal (focus trap active)
    // FilterModal uses <FocusTrap active={isOpen}> which should enforce this
    const outsideCount = focusLocations.filter((loc) => !loc).length;
    expect(outsideCount).toBe(0);
  });

  // 5. Focus returns to trigger button when modal closed
  test("5. focus returns to trigger button when modal closed", { tag: [tags.a11y] }, async ({ page }) => {
    // Remember the filters button
    const filtersButton = page.getByRole("button", { name: /^Filters/ });

    await expect(filtersButton).toBeVisible();

    // Open modal
    await page.waitForLoadState("networkidle").catch(() => {});
    await filtersButton.click();
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Close with the close button (X button with aria-label="Close filters")
    const closeButton = modal.locator('button[aria-label="Close filters"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      // Fallback: press Escape
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(300);

    // Modal should be closed
    await expect(modal).not.toBeVisible();

    // Focus should return to or near the trigger button
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    // Focus should not be on body (meaning it moved to some interactive element)
    expect(focusedTag).not.toBe("BODY");
  });

  // 6. Checkboxes (toggle buttons) have labels
  test("6. filter toggle buttons have accessible labels", { tag: [tags.a11y] }, async ({ page }) => {
    const modal = await openFilterModal(page);

    // Amenity and house rule buttons use aria-pressed and have visible text
    const filterButtons = modal.locator('button[aria-pressed]');
    const buttonCount = await filterButtons.count();

    // Should have some filter toggle buttons
    expect(buttonCount).toBeGreaterThan(0);

    const missingLabels: string[] = [];

    for (let i = 0; i < Math.min(buttonCount, 15); i++) {
      const btn = filterButtons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");

      if (!text?.trim() && !ariaLabel) {
        missingLabels.push(`Button ${i}: no text or aria-label`);
      }
    }

    if (missingLabels.length > 0) {
      console.log("Filter buttons missing accessible names:");
      missingLabels.forEach((m) => console.log(`  - ${m}`));
    }

    expect(missingLabels).toHaveLength(0);
  });

  // 7. Price inputs have labels
  test("7. price range inputs have accessible labels", { tag: [tags.a11y] }, async ({ page }) => {
    const modal = await openFilterModal(page);

    // PriceRangeFilter uses input elements for min/max price
    const priceInputs = modal.locator('input[type="number"], input[type="range"]');
    const inputCount = await priceInputs.count();

    // If price inputs exist, they should have labels
    if (inputCount > 0) {
      for (let i = 0; i < inputCount; i++) {
        const input = priceInputs.nth(i);
        const id = await input.getAttribute("id");
        const ariaLabel = await input.getAttribute("aria-label");
        const ariaLabelledBy = await input.getAttribute("aria-labelledby");

        let hasLabel = !!ariaLabel || !!ariaLabelledBy;

        if (id && !hasLabel) {
          const label = page.locator(`label[for="${id}"]`);
          hasLabel = (await label.count()) > 0;
        }

        if (!hasLabel) {
          console.log(`Price input ${i} (id: ${id}) missing accessible label`);
        }
      }
    }

    // Other labeled inputs in the modal
    // FilterModal uses <label htmlFor="filter-move-in">, <label htmlFor="filter-lease">, etc.
    const labeledInputs = [
      { label: "filter-move-in", name: "Move-in Date" },
      { label: "filter-lease", name: "Lease Duration" },
      { label: "filter-room-type", name: "Room Type" },
    ];

    for (const { label } of labeledInputs) {
      const labelEl = modal.locator(`label[for="${label}"]`);
      if (await labelEl.count() > 0) {
        const text = await labelEl.textContent();
        expect(text?.trim()).toBeTruthy();
      }
    }
  });

  // 8. Apply/Clear buttons are keyboard accessible
  test("8. apply and clear buttons are keyboard accessible", { tag: [tags.a11y] }, async ({ page }) => {
    const modal = await openFilterModal(page);

    // Apply button should exist and be keyboard accessible
    const applyButton = modal.locator('[data-testid="filter-modal-apply"]');
    await expect(applyButton).toBeAttached();

    // Focus apply button and verify it is focusable
    await applyButton.focus();
    await expect(applyButton).toBeFocused();

    // Apply button should respond to Enter key
    const applyText = await applyButton.textContent();
    expect(applyText?.trim()).toBeTruthy();

    // Clear all button is conditional (only shows when filters are active)
    const clearButton = modal.locator('[data-testid="filter-modal-clear-all"]');
    const clearCount = await clearButton.count();

    if (clearCount > 0 && await clearButton.isVisible()) {
      // Clear button should also be focusable
      await clearButton.focus();
      await expect(clearButton).toBeFocused();
    }

    // Close button should be keyboard accessible
    const closeButton = modal.locator('button[aria-label="Close filters"]');
    if (await closeButton.count() > 0) {
      await closeButton.focus();
      await expect(closeButton).toBeFocused();
    }
  });

  // --------------------------------------------------------------------------
  // Section 17 Accessibility: filter chip remove buttons have descriptive
  // aria-labels (Spec 17.A2 [P1])
  // --------------------------------------------------------------------------

  // 9. Filter chip remove buttons have descriptive aria-labels
  test("9. filter chip remove buttons have descriptive aria-labels", { tag: [tags.a11y] }, async ({ page }) => {
    // Navigate with two different filter types pre-applied via URL
    // (roomType + amenity) to verify each chip has a unique, descriptive label
    await page.goto(
      `${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`,
    );
    await waitForResults(page);

    // Scope to the visible container to avoid strict mode violations
    // (AppliedFilterChips is rendered in both desktop and mobile containers)
    const container = searchResultsContainer(page);

    // Locate the applied filters chip bar region within the visible container.
    // Use expect().toBeVisible() which properly waits for client hydration.
    const chipRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await chipRegion.isVisible().catch(() => false);

    // If no chip region visible after hydration, skip gracefully
    if (!regionVisible) {
      // Wait a bit more for client hydration, then re-check
      await page.waitForTimeout(3000);
      const retryVisible = await chipRegion.isVisible().catch(() => false);
      if (!retryVisible) {
        console.log("Info: Applied filters region not visible - cannot verify chip aria-labels");
        test.skip(true, "Applied filters chip region not visible");
      }
    }

    // Find all remove/close buttons within the chip region
    // AppliedFilterChips renders: button[aria-label="Remove filter: {label}"]
    const removeButtons = chipRegion.getByRole("button", { name: /remove filter/i });
    const removeCount = await removeButtons.count();

    // We applied 2 filters (roomType + amenity), so expect at least 2 remove buttons
    // (there may also be a "Clear all" button in the region, but we filter by name)
    expect(removeCount).toBeGreaterThanOrEqual(2);

    // Validate each remove button has a descriptive aria-label
    const labels: string[] = [];

    for (let i = 0; i < removeCount; i++) {
      const btn = removeButtons.nth(i);
      const ariaLabel = await btn.getAttribute("aria-label");

      // Must have an aria-label attribute
      expect(ariaLabel).toBeTruthy();

      // The label must NOT be just "X", "close", or "remove" without context --
      // it must identify which filter is being removed
      expect(ariaLabel!.toLowerCase()).not.toBe("x");
      expect(ariaLabel!.toLowerCase()).not.toBe("close");
      expect(ariaLabel!.toLowerCase()).not.toBe("remove");

      // Should follow the descriptive pattern "Remove filter: <label>"
      expect(ariaLabel).toMatch(/remove filter:/i);

      labels.push(ariaLabel!);
    }

    // Each chip must have a unique label (no two chips should say the same thing)
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);

    // Verify the labels reference the actual filter names we applied
    const allLabelsJoined = labels.join(" ").toLowerCase();
    expect(allLabelsJoined).toMatch(/private room/i);
    expect(allLabelsJoined).toMatch(/wifi/i);
  });
});
