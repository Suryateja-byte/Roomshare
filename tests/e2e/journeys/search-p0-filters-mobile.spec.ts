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
} from "../helpers";

test.describe("P0-1: Mobile Filters Accessibility", () => {
  // Test at iPhone-sized viewport
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.a11y} - Filters button is visible and accessible on mobile`, async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Wait for content to render
    await page.locator('[data-testid="listing-card"], h1, h2, h3').first()
      .waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});

    // On mobile, filter button is in collapsed header (auto-shown after useMediaQuery hydration)
    // Wait for the button directly — collapsed bar shows automatically on mobile viewports
    const filtersBtnLocator = getFiltersButton(page);
    const btnVisible = await filtersBtnLocator.waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!btnVisible) {
      // Fallback: scroll to trigger collapsed header
      await page.evaluate(() => window.scrollBy(0, 200));
      await page.waitForTimeout(1000);
    }

    // 1) Assert Filters button exists and is visible on mobile
    await expect(filtersBtnLocator).toBeVisible({ timeout: 10_000 });

    // 2) Open filter modal using shared helper
    const filterDialog = await openFilterModal(page);

    // 3) Heading "Filters" inside the dialog confirms it opened correctly
    const filtersHeading = filterDialog.getByRole("heading", {
      name: /filters/i,
    });
    await expect(filtersHeading).toBeVisible();

    // aria-expanded should be true on the trigger button
    await expect(filtersBtnLocator).toHaveAttribute("aria-expanded", "true");
  });

  test(`${tags.a11y} - Filter drawer can be closed`, async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Wait for content to render
    await page.locator('[data-testid="listing-card"], h1, h2, h3').first()
      .waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});

    // Wait for collapsed header (auto-shows on mobile after hydration)
    const filtersBtnLocator = getFiltersButton(page);
    const btnVisible = await filtersBtnLocator.waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!btnVisible) {
      await page.evaluate(() => window.scrollBy(0, 200));
      await page.waitForTimeout(1000);
    }
    await expect(filtersBtnLocator).toBeVisible({ timeout: 10_000 });
    const filterDialog = await openFilterModal(page);

    // Close via close button
    const closeButton = filterDialog.getByRole("button", {
      name: /close filters/i,
    });
    await closeButton.click();

    // Verify closed
    await expect(filterDialog).not.toBeVisible();
    await expect(filtersBtnLocator).toHaveAttribute("aria-expanded", "false");
  });
});
