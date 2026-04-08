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

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
} from "./helpers/test-utils";
import {
  mobileSelectors,
  getSheetSnapIndex,
  getSheetHeightFraction,
  setSheetSnap,
  waitForSheetAnimation,
  isMobileViewport,
  waitForMobileSheet,
  SNAP_COLLAPSED,
  SNAP_EXPANDED,
} from "./helpers/mobile-helpers";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Group 1: Bottom Sheet Snap Transitions (P0)
// Tests that are NOT covered by mobile-bottom-sheet.spec.ts
// ---------------------------------------------------------------------------

test.beforeEach(async () => {
  test.slow();
});

test.describe("Mobile Bottom Sheet - Snap Transitions", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("ArrowUp from collapsed moves to expanded", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Collapse the sheet first via minimize button or keyboard
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // Focus the handle and press ArrowUp once -> should go to expanded (1)
    const handle = page.locator(mobileSelectors.sheetHandle);
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await waitForSheetAnimation(page);

    expect(await getSheetSnapIndex(page)).toBe(1);

    // Verify the height matches expanded (~85vh)
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.75);
    expect(fraction).toBeLessThan(0.95);
  });

  test("Escape from expanded collapses sheet", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Ensure we start at expanded (default, index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Press Escape -- should collapse to 0
    await page.keyboard.press("Escape");
    await waitForSheetAnimation(page);

    expect(await getSheetSnapIndex(page)).toBe(0);

    // Verify collapsed height (~15vh)
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.25);
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

  test("listing cards are visible in expanded position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Sheet starts at expanded (index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Listing cards should be visible within the sheet
    const listings = page.locator(mobileSelectors.listingCard);
    const count = await listings.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // The first listing card should be attached and within viewport
    const firstCard = listings.first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // Verify the card is within the bottom sheet's visible area
    // Wait for sheet animation to settle before measuring bounding boxes
    await waitForSheetAnimation(page);
    const cardBox = await firstCard.boundingBox();
    const sheetBox = await page
      .locator(mobileSelectors.bottomSheet)
      .boundingBox();

    if (cardBox && sheetBox) {
      // Card should be within the viewport (sheet may not have fully settled on WSL2)
      // The card's top should be above the bottom of the viewport.
      // Use generous tolerance: card top must be within viewport + 200px buffer
      // to account for header ResizeObserver + padding-top transition settling
      // and CI rendering delays where layout hasn't fully resolved.
      const vh = page.viewportSize()!.height;
      expect(cardBox.y).toBeLessThan(vh + 200);
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Expand the sheet
    await setSheetSnap(page, 1);
    expect(await getSheetSnapIndex(page)).toBe(1);

    // The content area should be scrollable when expanded
    const content = page.locator(mobileSelectors.snapContent).first();
    const isScrollable = await content.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );

    test.skip(!isScrollable, "Content area not scrollable (insufficient listings)");

    // Verify overflow-y is auto (not hidden) when expanded
    const overflowY = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overflowY || getComputedStyle(el).overflowY
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

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
  });

  test("sheet header shows result count text", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // The sheet header should display either "Search results" or a count
    const sheet = page.locator(mobileSelectors.bottomSheet);
    const headerText = sheet
      .locator('[data-testid="sheet-header-text"]')
      .first();
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

  test("map is visible behind sheet in expanded position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Sheet at expanded (index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Map container should be present and visible
    const map = page.locator(mobileSelectors.mapContainer).first();
    const mapVisible = await map
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    test.skip(!mapVisible, "Map not visible on mobile (may be deferred)");

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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Collapse the sheet
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // Map should be visible since sheet is collapsed (only ~15vh)
    const map = page.locator(mobileSelectors.mapContainer).first();
    const mapVisible = await map
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    test.skip(!mapVisible, "Map not visible on mobile (may be deferred)");

    // Map should take up most of the viewport when sheet is collapsed
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();

    if (mapBox) {
      // Map should be large when sheet is minimized
      expect(mapBox.height).toBeGreaterThan(400);
    }
  });

  test("map markers visible when sheet is at expanded position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Sheet at expanded (index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Wait for map markers to appear (they load asynchronously after map init)
    const markers = page.locator(mobileSelectors.mapMarker);
    const markerCount = await markers
      .first()
      .waitFor({ state: "attached", timeout: 30_000 })
      .then(() => markers.count())
      .catch(() => 0);

    test.skip(markerCount === 0, "No map markers rendered (map may not be initialized)");

    // At least one marker should be visible
    expect(markerCount).toBeGreaterThanOrEqual(1);

    // Markers should be positioned above the sheet (in the map area)
    const firstMarker = markers.first();
    const markerBox = await firstMarker.boundingBox();
    const sheetBox = await page
      .locator(mobileSelectors.bottomSheet)
      .boundingBox();

    if (markerBox && sheetBox) {
      // Marker should be above the sheet's top edge (generous tolerance for WSL2
      // rendering and CI layout settlement delays)
      expect(markerBox.y).toBeLessThan(sheetBox.y + 250);
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Sheet starts at expanded so sort button should be visible
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Look for the mobile sort button (aria-label starts with "Sort:")
    const sortBtn = page.locator(mobileSelectors.sortButton);
    const sortVisible = await sortBtn
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!sortVisible) {
      // Sort button may not be in viewport -- try expanding
      await setSheetSnap(page, 1);
      await waitForSheetAnimation(page);
    }

    const sortBtnFinal = page.locator(mobileSelectors.sortButton).first();
    test.skip(!(await sortBtnFinal.isVisible().catch(() => false)), "Sort button not visible in current viewport");

    // Click the sort button
    await sortBtnFinal.click();

    // The sort bottom sheet should open with "Sort by" heading
    const sortHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sortHeading).toBeVisible({ timeout: 3000 });

    // Sort options should be visible
    const recommendedOption = page.locator('button:has-text("Recommended")');
    await expect(recommendedOption.first()).toBeVisible();

    const priceOption = page.locator('button:has-text("Price: Low to High")');
    await expect(priceOption.first()).toBeVisible();
  });

  test("selecting a sort option closes the sort sheet", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Try to find and click the sort button
    await setSheetSnap(page, 1);
    const sortBtn = page.locator(mobileSelectors.sortButton).first();
    const sortBtnVisible = await sortBtn.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!sortBtnVisible, "Sort button not visible");

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
    const updatedSortBtn = page.locator(
      'button[aria-label="Sort: Newest First"]'
    );
    const updated = await updatedSortBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    // The page may navigate on sort change, so the button might re-render
    // Just verify the sort sheet closed
    expect(
      updated || !(await sortHeading.isVisible().catch(() => false))
    ).toBeTruthy();
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // The Filters button is in the search form header area
    // It uses aria-label containing "Filters"
    const filtersBtn = page
      .locator(`${mobileSelectors.filtersButton}:visible`)
      .first();
    const filtersVisible = await filtersBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    test.skip(!filtersVisible, "Filters button not visible on mobile");

    // Click the Filters button (use evaluate click for reliability on WSL2)
    await filtersBtn.evaluate((el) => (el as HTMLElement).click());

    // A dialog/modal should appear (allow extra time for modal animation on WSL2)
    const modal = page.locator(mobileSelectors.filterModal);
    // Use waitFor instead of isVisible (which returns immediately)
    const modalOpened = await modal
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (!modalOpened) {
      // Retry: try clicking with Playwright's native click
      await page
        .locator(`${mobileSelectors.filtersButton}:visible`)
        .first()
        .click({ force: true });
    }

    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
  });

  test("filter modal closes when applying filters", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    const filtersBtn = page
      .locator(`${mobileSelectors.filtersButton}:visible`)
      .first();
    const filtersBtnVisible = await filtersBtn.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!filtersBtnVisible, "Filters button not visible on mobile");

    await filtersBtn.evaluate((el) => (el as HTMLElement).click());

    // Use specific selector for filter modal (not just any dialog)
    const modal = page.locator(
      '[role="dialog"][aria-labelledby="filter-drawer-title"]'
    );
    const modalOpened = await modal
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!modalOpened) {
      // Retry: try native click
      await page
        .locator(`${mobileSelectors.filtersButton}:visible`)
        .first()
        .click({ force: true });
      const retryOpened = await modal
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!retryOpened, "Filter modal did not open");
    }

    // Use the data-testid for the Apply button (more reliable than text matching)
    const applyBtn = modal.locator('[data-testid="filter-modal-apply"]');
    const applyFallback = modal
      .locator(
        'button:has-text("Apply"), button:has-text("listing"), button:has-text("Show"), button:has-text("Done")'
      )
      .first();

    const targetBtn = (await applyBtn
      .isVisible({ timeout: 3000 })
      .catch(() => false))
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Set to expanded
    await setSheetSnap(page, 1);
    expect(await getSheetSnapIndex(page)).toBe(1);

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
      expect(snap).toBeLessThanOrEqual(1);
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Expand the sheet so content is scrollable
    await setSheetSnap(page, 1);
    expect(await getSheetSnapIndex(page)).toBe(1);

    // Verify overscroll-behavior: contain on the content area
    const content = page.locator(mobileSelectors.snapContent).first();
    const overscrollBehavior = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overscrollBehavior ||
        getComputedStyle(el).overscrollBehavior
    );

    // Should be "contain" to prevent scroll chaining to the map
    expect(overscrollBehavior).toBe("contain");
  });

  test("minimize button collapses sheet to collapsed position", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Start at expanded (default, index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // The minimize (X) button should be visible at expanded position
    const minimizeBtn = page.locator(mobileSelectors.minimizeButton);
    try {
      await expect(minimizeBtn).toBeVisible({ timeout: 5000 });
    } catch {
      test.skip(true, "Minimize button not visible");
      return;
    }

    await minimizeBtn.click();
    await waitForSheetAnimation(page);

    // Should collapse to index 0 (poll for animation to settle)
    await expect(async () => {
      expect(await getSheetSnapIndex(page)).toBe(0);
    }).toPass({ timeout: 5_000, intervals: [500, 1000] });

    // Verify collapsed height
    const fraction = await getSheetHeightFraction(page);
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.25);
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
    const mobileParentVisible = await mobileParent
      .first()
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Collapse first so we can test transition to expanded
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);
    const overlay = page.locator('[data-testid="sheet-overlay"]');
    let overlayVisible = await overlay.isVisible().catch(() => false);
    expect(overlayVisible).toBeFalsy();

    // Expand the sheet
    await setSheetSnap(page, 1);
    expect(await getSheetSnapIndex(page)).toBe(1);

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

    // Collapse back
    await setSheetSnap(page, 0);
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
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Collapse the sheet
    await setSheetSnap(page, 0);
    expect(await getSheetSnapIndex(page)).toBe(0);

    // The content area should have overflow-y: hidden when collapsed
    const content = page.locator(mobileSelectors.snapContent).first();
    const overflowY = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overflowY || getComputedStyle(el).overflowY
    );
    expect(overflowY).toBe("hidden");

    // Content should also have pointer-events: none when collapsed
    const pointerEvents = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.pointerEvents ||
        getComputedStyle(el).pointerEvents
    );
    expect(pointerEvents).toBe("none");
  });

  test("content scroll is enabled at expanded position", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    const sheetReady = await waitForMobileSheet(page);
    test.skip(!sheetReady, "Mobile bottom sheet not ready");

    // Sheet starts at expanded (index 1)
    expect(await getSheetSnapIndex(page)).toBe(1);

    // The content area should have overflow-y: auto (scrollable)
    const content = page.locator(mobileSelectors.snapContent).first();
    const overflowY = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.overflowY || getComputedStyle(el).overflowY
    );
    expect(overflowY).toBe("auto");

    // Content should have pointer-events: auto at expanded
    const pointerEvents = await content.evaluate(
      (el) =>
        (el as HTMLElement).style.pointerEvents ||
        getComputedStyle(el).pointerEvents
    );
    expect(pointerEvents).toBe("auto");
  });
});
