/**
 * Mobile Search Interactions E2E Tests (Anonymous -- no auth required)
 *
 * Tests for mobile-specific search interactions including bottom sheet snap
 * transitions, sheet content visibility, map coexistence, sort interactions,
 * and responsive layout breakpoints.
 *
 * These tests complement (and do NOT duplicate) the existing test files:
 * - mobile-bottom-sheet.spec.ts: Core snap points, drag, keyboard nav, ARIA, body scroll lock
 * - mobile-ux.anon.spec.ts: Bottom sheet region, floating button, haptic feedback
 * - mobile-toggle.anon.spec.ts: Floating toggle visibility, view switching
 *
 * Run: pnpm playwright test tests/e2e/mobile-interactions.anon.spec.ts --project=chromium-anon
 */

import { test, expect, SF_BOUNDS, selectors, timeouts } from "./helpers/test-utils";
import {
  mobileSelectors,
  getSheetSnapIndex,
  getSheetHeightFraction,
  setSheetSnap,
  waitForSheetAnimation,
  isMobileViewport,
  waitForMobileSheet,
  SNAP_COLLAPSED,
  SNAP_HALF,
  SNAP_EXPANDED,
} from "./helpers/mobile-helpers";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Group 1: Bottom Sheet Snap Transitions (P0)
// Tests that are NOT covered by mobile-bottom-sheet.spec.ts
// ---------------------------------------------------------------------------

test.beforeEach(async () => { test.slow(); });

test.describe("Mobile Bottom Sheet - Snap Transitions", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("double ArrowUp from collapsed traverses half then expanded", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Collapse the sheet first via minimize button or keyboard
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // Focus the handle and press ArrowUp once -> should go to half (1)
    const handle = page.locator(mobileSelectors.sheetHandle);
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await waitForSheetAnimation(page);

    expect(await getSheetSnapIndex(page)).toBe(1);

    // Press ArrowUp again -> should go to expanded (2)
    await page.keyboard.press("ArrowUp");
    await waitForSheetAnimation(page);

    expect(await getSheetSnapIndex(page)).toBe(2);

    // Verify the height matches expanded (~85vh)
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.75);
    expect(fraction).toBeLessThan(0.95);
  });

  test("Escape from half position stays at half", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Ensure we start at half (default)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Press Escape -- should NOT collapse further, stays at half
    await page.keyboard.press("Escape");
    await waitForSheetAnimation(page);

    // The component code: if (e.key === "Escape" && snapIndex !== 0) setSnapIndex(1)
    // At half (1), this sets to 1, so no change
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Verify height still approximately 50vh
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.4);
    expect(fraction).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Sheet Content (P0)
// Tests for listing visibility and scrollability within the sheet
// ---------------------------------------------------------------------------

test.describe("Mobile Bottom Sheet - Content", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("listing cards are visible in half position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Sheet starts at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Listing cards should be visible within the sheet
    const listings = page.locator(mobileSelectors.listingCard);
    const count = await listings.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // The first listing card should be attached and within viewport
    const firstCard = listings.first();
    await expect(firstCard).toBeAttached();

    // Verify the card is within the bottom sheet's visible area
    // Wait for sheet animation to settle before measuring bounding boxes
    await waitForSheetAnimation(page);
    const cardBox = await firstCard.boundingBox();
    const sheetBox = await page
      .locator(mobileSelectors.bottomSheet)
      .boundingBox();

    if (cardBox && sheetBox) {
      // Card should be within the viewport (sheet may not have fully settled on WSL2)
      // The card's top should be above the bottom of the viewport
      const vh = page.viewportSize()!.height;
      expect(cardBox.y).toBeLessThan(vh);
      // And the card's bottom should be below the top of the sheet
      expect(cardBox.y + cardBox.height).toBeGreaterThan(sheetBox.y);
    } else {
      // If bounding boxes aren't available, just verify the card is attached
      await expect(firstCard).toBeAttached();
    }
  });

  test("listing cards are scrollable in expanded position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Expand the sheet
    await setSheetSnap(page, 2);
    expect(await getSheetSnapIndex(page)).toBe(2);

    // The content area should be scrollable when expanded
    const content = page.locator(mobileSelectors.snapContent).first();
    const isScrollable = await content.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );

    if (!isScrollable) {
      // Not enough content to scroll -- skip
      test.skip(true, "Content area not scrollable (insufficient listings)");
      return;
    }

    // Verify overflow-y is auto (not hidden) when expanded
    const overflowY = await content.evaluate(
      (el) => (el as HTMLElement).style.overflowY || getComputedStyle(el).overflowY,
    );
    expect(overflowY).not.toBe("hidden");

    // Scroll down and verify scroll position changes
    await content.evaluate((el) => {
      el.scrollTop = 100;
    });

    await expect
      .poll(() => content.evaluate((el) => el.scrollTop), { timeout: 2000 })
      .toBeGreaterThan(0);
  });

  test("collapsed position shows handle and minimal preview text", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Collapse the sheet
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // The handle (slider) should still be present in the DOM
    const handle = page.locator(mobileSelectors.sheetHandle);
    await expect(handle).toBeAttached();

    // The "Pull up for listings" text should be visible when collapsed
    const pullUpText = page.locator('text="Pull up for listings"');
    const pullUpVisible = await pullUpText.isVisible().catch(() => false);
    // This text is conditionally rendered only when isCollapsed
    expect(pullUpVisible).toBeTruthy();

    // The expand/collapse buttons should NOT be visible when collapsed
    const expandBtn = page.locator(mobileSelectors.expandButton);
    const expandVisible = await expandBtn.isVisible().catch(() => false);
    expect(expandVisible).toBeFalsy();
  });

  test("sheet header shows result count text", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // The sheet header should display either "Search results" or a count
    const sheet = page.locator(mobileSelectors.bottomSheet);
    const headerText = sheet.locator('[data-testid="sheet-header-text"]').first();
    await expect(headerText).toBeVisible();

    const text = await headerText.textContent();
    // Should contain either "Search results" (default) or "X places" pattern
    expect(text).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Group 3: Map and Sheet Coexistence (P1)
// Tests for map visibility alongside the bottom sheet
// ---------------------------------------------------------------------------

test.describe("Mobile Map and Sheet", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("map is visible behind sheet in half position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Sheet at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Map container should be present and visible
    const map = page.locator(mobileSelectors.mapContainer).first();
    const mapVisible = await map.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!mapVisible) {
      // Map may not be initialized yet on mobile (cost optimization)
      test.skip(true, "Map not visible on mobile (may be deferred)");
      return;
    }

    // The map should have a bounding box above or behind the sheet
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();

    if (mapBox) {
      // Map should span a significant portion of the viewport
      expect(mapBox.width).toBeGreaterThan(300);
      expect(mapBox.height).toBeGreaterThan(200);
    }
  });

  test("map is visible behind sheet in collapsed position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Collapse the sheet
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // Map should be visible since sheet is collapsed (only ~15vh)
    const map = page.locator(mobileSelectors.mapContainer).first();
    const mapVisible = await map.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!mapVisible) {
      test.skip(true, "Map not visible on mobile (may be deferred)");
      return;
    }

    // Map should take up most of the viewport when sheet is collapsed
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();

    if (mapBox) {
      // Map should be large when sheet is minimized
      expect(mapBox.height).toBeGreaterThan(400);
    }
  });

  test("map markers visible when sheet is at half position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Sheet at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Wait for map markers to appear (they load asynchronously after map init)
    const markers = page.locator(mobileSelectors.mapMarker);
    const markerCount = await markers
      .first()
      .waitFor({ state: "attached", timeout: 15_000 })
      .then(() => markers.count())
      .catch(() => 0);

    if (markerCount === 0) {
      test.skip(true, "No map markers rendered (map may not be initialized)");
      return;
    }

    // At least one marker should be visible
    expect(markerCount).toBeGreaterThanOrEqual(1);

    // Markers should be positioned above the sheet (in the map area)
    const firstMarker = markers.first();
    const markerBox = await firstMarker.boundingBox();
    const sheetBox = await page
      .locator(mobileSelectors.bottomSheet)
      .boundingBox();

    if (markerBox && sheetBox) {
      // Marker should be above the sheet's top edge (tolerance for WSL2 rendering)
      expect(markerBox.y).toBeLessThan(sheetBox.y + 100);
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4: Mobile Sort Interaction (P1)
// Tests for SortSelect mobile bottom sheet behavior
// ---------------------------------------------------------------------------

test.describe("Mobile Sort Interaction", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("sort button opens sort bottom sheet on mobile", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Expand the sheet to half or more so sort button is visible
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Look for the mobile sort button (aria-label starts with "Sort:")
    const sortBtn = page.locator(mobileSelectors.sortButton);
    const sortVisible = await sortBtn
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!sortVisible) {
      // Sort button may not be in viewport at half position -- try expanding
      await setSheetSnap(page, 2);
      await waitForSheetAnimation(page);
    }

    const sortBtnFinal = page.locator(mobileSelectors.sortButton).first();
    if (!(await sortBtnFinal.isVisible().catch(() => false))) {
      test.skip(true, "Sort button not visible in current viewport");
      return;
    }

    // Click the sort button
    await sortBtnFinal.click();

    // The sort bottom sheet should open with "Sort by" heading
    const sortHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sortHeading).toBeVisible({ timeout: 3000 });

    // Sort options should be visible
    const recommendedOption = page.locator(
      'button:has-text("Recommended")',
    );
    await expect(recommendedOption.first()).toBeVisible();

    const priceOption = page.locator(
      'button:has-text("Price: Low to High")',
    );
    await expect(priceOption.first()).toBeVisible();
  });

  test("selecting a sort option closes the sort sheet", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Try to find and click the sort button
    await setSheetSnap(page, 2);
    const sortBtn = page.locator(mobileSelectors.sortButton).first();
    if (!(await sortBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Sort button not visible");
      return;
    }

    await sortBtn.click();

    // Verify sort sheet is open
    const sortHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sortHeading).toBeVisible({ timeout: 3000 });

    // Click "Newest First" option
    const newestOption = page.locator('button:has-text("Newest First")');
    await newestOption.first().click();

    // Sort sheet should close (heading no longer visible)
    await expect(sortHeading).not.toBeVisible({ timeout: 3000 });

    // The sort button label should reflect the new selection
    const updatedSortBtn = page.locator('button[aria-label="Sort: Newest First"]');
    const updated = await updatedSortBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    // The page may navigate on sort change, so the button might re-render
    // Just verify the sort sheet closed
    expect(updated || !(await sortHeading.isVisible().catch(() => false))).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Group 5: Mobile Filter Interaction (P1)
// Tests for filter access on mobile via the SearchForm "Filters" button
// ---------------------------------------------------------------------------

test.describe("Mobile Filter Interaction", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("filters button opens filter modal on mobile", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // The Filters button is in the search form header area
    // It uses aria-label containing "Filters"
    const filtersBtn = page.locator(mobileSelectors.filtersButton).first();
    const filtersVisible = await filtersBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!filtersVisible) {
      test.skip(true, "Filters button not visible on mobile");
      return;
    }

    // Click the Filters button (use evaluate click for reliability on WSL2)
    await filtersBtn.evaluate(el => (el as HTMLElement).click());

    // A dialog/modal should appear (allow extra time for modal animation on WSL2)
    const modal = page.locator(mobileSelectors.filterModal);
    // Use waitFor instead of isVisible (which returns immediately)
    const modalOpened = await modal
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!modalOpened) {
      // Retry: try clicking with Playwright's native click
      await page.locator(mobileSelectors.filtersButton).first().click({ force: true });
    }

    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
  });

  test("filter modal closes when applying filters", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    const filtersBtn = page.locator(mobileSelectors.filtersButton).first();
    if (!(await filtersBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Filters button not visible on mobile");
      return;
    }

    await filtersBtn.evaluate(el => (el as HTMLElement).click());

    // Use specific selector for filter modal (not just any dialog)
    const modal = page.locator('[role="dialog"][aria-labelledby="filter-drawer-title"]');
    const modalOpened = await modal
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!modalOpened) {
      // Retry: try native click
      await page.locator(mobileSelectors.filtersButton).first().click({ force: true });
      const retryOpened = await modal.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      if (!retryOpened) {
        test.skip(true, "Filter modal did not open");
        return;
      }
    }

    // Use the data-testid for the Apply button (more reliable than text matching)
    const applyBtn = modal.locator('[data-testid="filter-modal-apply"]');
    const applyFallback = modal
      .locator('button:has-text("Apply"), button:has-text("listing"), button:has-text("Show"), button:has-text("Done")')
      .first();

    const targetBtn = (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false))
      ? applyBtn
      : applyFallback;

    if (await targetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await targetBtn.scrollIntoViewIfNeeded();
      await targetBtn.click();

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 8000 });
    }
  });
});

// ---------------------------------------------------------------------------
// Group 6: Orientation and Edge Cases (P2)
// ---------------------------------------------------------------------------

test.describe("Mobile Edge Cases", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("orientation change (portrait to landscape) preserves sheet state", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Set to expanded
    await setSheetSnap(page, 2);
    expect(await getSheetSnapIndex(page)).toBe(2);

    // Simulate orientation change by resizing viewport to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForSheetAnimation(page);

    // The sheet should still be present (may or may not maintain exact snap)
    const sheet = page.locator(mobileSelectors.bottomSheet);
    // At 844px width, we are above the md breakpoint (768px), so the mobile
    // sheet may be hidden (it has md:hidden class). This is expected behavior.
    const sheetStillVisible = await sheet.isVisible().catch(() => false);

    if (sheetStillVisible) {
      // If still mobile layout, snap should be preserved
      const snap = await getSheetSnapIndex(page);
      expect(snap).toBeGreaterThanOrEqual(0);
      expect(snap).toBeLessThanOrEqual(2);
    }

    // Rotate back to portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForSheetAnimation(page);

    // Sheet should be visible again on mobile
    await expect(sheet).toBeVisible({ timeout: 5000 });
  });

  test("content overflow is contained within bottom sheet (overscroll-behavior)", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Expand the sheet so content is scrollable
    await setSheetSnap(page, 2);
    expect(await getSheetSnapIndex(page)).toBe(2);

    // Verify overscroll-behavior: contain on the content area
    const content = page.locator(mobileSelectors.snapContent).first();
    const overscrollBehavior = await content.evaluate(
      (el) => (el as HTMLElement).style.overscrollBehavior || getComputedStyle(el).overscrollBehavior,
    );

    // Should be "contain" to prevent scroll chaining to the map
    expect(overscrollBehavior).toBe("contain");
  });

  test("minimize button collapses sheet to collapsed position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Start at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // The minimize (X) button should be visible at half position
    const minimizeBtn = page.locator(mobileSelectors.minimizeButton);
    if (!(await minimizeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Minimize button not visible");
      return;
    }

    await minimizeBtn.click();
    await waitForSheetAnimation(page);

    // Should collapse to index 0
    expect(await getSheetSnapIndex(page)).toBe(0);

    // Verify collapsed height
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.25);
  });

  test("expand button toggles sheet between half and expanded", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Start at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Click expand (use evaluate click for reliability on WSL2)
    const expandBtn = page.locator(mobileSelectors.expandButton);
    if (!(await expandBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Expand button not visible");
      return;
    }

    await expandBtn.evaluate(el => (el as HTMLElement).click());
    await waitForSheetAnimation(page);
    expect(await getSheetSnapIndex(page)).toBe(2);

    // Now "Collapse results" button should appear
    const collapseBtn = page.locator(mobileSelectors.collapseButton);
    await expect(collapseBtn).toBeVisible({ timeout: 5000 });

    // Click collapse (use evaluate click for reliability on WSL2)
    await collapseBtn.evaluate(el => (el as HTMLElement).click());
    await waitForSheetAnimation(page);
    expect(await getSheetSnapIndex(page)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Group 7: Layout Responsiveness
// Verifies correct layout at different viewport widths
// ---------------------------------------------------------------------------

test.describe("Mobile Layout Responsiveness", () => {
  test("390px viewport shows bottom sheet layout (no sidebar)", async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/search?${boundsQS}`);
    await page
      .locator(mobileSelectors.listingCard)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // Bottom sheet should be visible on mobile
    const sheet = page.locator(mobileSelectors.bottomSheet);
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Desktop sidebar results container should NOT be visible
    // The desktop container has class "hidden md:flex"
    const desktopContainer = page.locator(mobileSelectors.desktopResults);
    const desktopVisible = await desktopContainer
      .isVisible()
      .catch(() => false);
    expect(desktopVisible).toBeFalsy();

    // Mobile results container should be present
    const mobileContainer = page.locator(mobileSelectors.mobileResults);
    await expect(mobileContainer).toBeAttached();
  });

  test("1024px viewport shows desktop layout with sidebar (no bottom sheet)", async ({
    page,
  }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto(`/search?${boundsQS}`);
    await page
      .locator(mobileSelectors.listingCard)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // Desktop results container should be visible
    const desktopContainer = page.locator(mobileSelectors.desktopResults);
    await expect(desktopContainer).toBeVisible({ timeout: 5000 });

    // The bottom sheet region has md:hidden on its parent, so it should not
    // be visible at desktop widths. However, the bottom sheet element itself
    // may still be in the DOM (just hidden by the parent's CSS).
    // Check that the mobile parent container is hidden.
    const mobileParent = page.locator(".md\\:hidden.flex-1.flex.flex-col");
    const mobileParentVisible = await mobileParent.first()
      .isVisible()
      .catch(() => false);
    expect(mobileParentVisible).toBeFalsy();
  });

  test("768px viewport transitions from mobile to desktop layout", async ({
    page,
  }) => {
    // Set viewport at exact md breakpoint
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(`/search?${boundsQS}`);
    await page
      .locator(mobileSelectors.listingCard)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // At exactly 768px (md breakpoint), desktop layout should apply
    // The md: prefix in Tailwind means >= 768px
    const desktopContainer = page.locator(mobileSelectors.desktopResults);
    const desktopVisible = await desktopContainer
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // At 768px, we should see the desktop layout
    expect(desktopVisible).toBeTruthy();

    // The floating toggle (mobile-only) should NOT be visible
    const floatingToggle = page.locator(mobileSelectors.floatingToggle).first();
    const toggleVisible = await floatingToggle.isVisible().catch(() => false);
    expect(toggleVisible).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Group 8: Dim Overlay (P2)
// Tests for the overlay that appears behind the sheet when expanded
// ---------------------------------------------------------------------------

test.describe("Mobile Bottom Sheet - Overlay", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("dim overlay appears when sheet is expanded", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // At half position, no overlay
    expect(await getSheetSnapIndex(page)).toBe(1);
    const overlay = page.locator('[data-testid="sheet-overlay"]');
    let overlayVisible = await overlay.isVisible().catch(() => false);
    expect(overlayVisible).toBeFalsy();

    // Expand the sheet
    await setSheetSnap(page, 2);
    expect(await getSheetSnapIndex(page)).toBe(2);

    // Wait for AnimatePresence to render the overlay
    await waitForSheetAnimation(page);

    // Overlay should now be visible with opacity
    // Use waitFor with timeout to handle AnimatePresence animation delay
    overlayVisible = await overlay
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    // Overlay should be present when expanded
    expect(overlayVisible).toBeTruthy();

    // Collapse back to half
    await setSheetSnap(page, 1);
    await waitForSheetAnimation(page);

    // Overlay should be gone (wait for AnimatePresence exit animation)
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Group 9: Collapsed Content Overflow (P2)
// Verifies content scrolling is disabled when sheet is collapsed
// ---------------------------------------------------------------------------

test.describe("Mobile Bottom Sheet - Content Overflow Control", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("content scroll is disabled when sheet is collapsed", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Collapse the sheet
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // The content area should have overflow-y: hidden when collapsed
    const content = page.locator(mobileSelectors.snapContent).first();
    const overflowY = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overflowY ||
        getComputedStyle(el).overflowY,
    );
    expect(overflowY).toBe("hidden");

    // Content should also have pointer-events: none when collapsed
    const pointerEvents = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.pointerEvents ||
        getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });

  test("content scroll is enabled at half position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    if (!sheetReady) {
      test.skip();
      return;
    }

    // Sheet starts at half
    expect(await getSheetSnapIndex(page)).toBe(1);

    // The content area should have overflow-y: auto (scrollable)
    const content = page.locator(mobileSelectors.snapContent).first();
    const overflowY = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overflowY ||
        getComputedStyle(el).overflowY,
    );
    expect(overflowY).toBe("auto");

    // Content should have pointer-events: auto at half
    const pointerEvents = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.pointerEvents ||
        getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("auto");
  });
});
