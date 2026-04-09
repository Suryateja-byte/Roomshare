/**
 * P0-1: Mobile Filters Button Accessibility
 *
 * Validates that the Filters button is visible and functional on mobile viewports.
 * The Filters button must be accessible to mobile users to access filter options.
 */
import {
  test,
  expect,
  tags,
  filtersButton as getFiltersButton,
  openFilterModal,
  waitForSearchReady,
} from "../helpers";

test.describe("P0-1: Mobile Filters Accessibility", () => {
  // Test at iPhone-sized viewport
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({}, testInfo) => {
    // This test requires true mobile device emulation (isMobile: true).
    // Desktop Chrome with viewport override alone doesn't fully trigger
    // mobile layout (useMediaQuery hydration timing + touch events).
    if (!testInfo.project.name.includes("Mobile")) {
      test.skip(true, "Mobile filter tests require Mobile Chrome/Safari project");
    }
  });

  test(`${tags.a11y} - Filters button is visible and accessible on mobile`, async ({
    page,
  }) => {
    // 3x timeout: filter modal open/close on mobile with hydration can be slow in CI
    test.slow();

    // waitForSearchReady navigates to SF bounds URL, waits for page load,
    // content attachment, and the InlineFilterStrip filter button to be visible
    // (data-hydrated attribute set). This ensures openFilters() has a registered
    // handler before we click and avoids the no-op race on bare /search.
    await waitForSearchReady(page);

    const filtersBtnLocator = getFiltersButton(page);

    // 1) Assert Filters button exists and is visible on mobile
    await expect(filtersBtnLocator).toBeVisible({ timeout: 10_000 });

    // 2) Open filter modal using shared helper
    const filterDialog = await openFilterModal(page);

    // 3) Heading "Filters" inside the dialog confirms it opened correctly
    const filtersHeading = filterDialog.getByRole("heading", {
      name: /filters/i,
    });
    await expect(filtersHeading).toBeVisible();

    // Note: mobile-filter-button (CollapsedMobileSearch) does not set
    // aria-expanded — it delegates state to the parent via onOpenFilters callback.
    // Dialog visibility above is the authoritative open-state signal.
  });

  test(`${tags.a11y} - Filter drawer can be closed`, async ({ page }) => {
    // 3x timeout: filter modal open/close on mobile with hydration can be slow in CI
    test.slow();

    // waitForSearchReady navigates to SF bounds URL and waits for the hydrated
    // InlineFilterStrip button — ensures openFilters() context handler is registered.
    await waitForSearchReady(page);

    const filtersBtnLocator = getFiltersButton(page);
    await expect(filtersBtnLocator).toBeVisible({ timeout: 10_000 });
    const filterDialog = await openFilterModal(page);

    // Close via close button
    const closeButton = filterDialog.getByRole("button", {
      name: /close filters/i,
    });
    await closeButton.click();

    // Verify closed — dialog invisibility is the authoritative signal.
    // mobile-filter-button (CollapsedMobileSearch) does not set aria-expanded;
    // it delegates state to the parent via onOpenFilters callback.
    await expect(filterDialog).not.toBeVisible();
  });
});
