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

    // On mobile, filter button is in collapsed search bar (triggered by scroll)
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);

    // 1) Assert Filters button exists and is visible on mobile
    const filtersBtnLocator = getFiltersButton(page);
    await expect(filtersBtnLocator).toBeVisible({ timeout: 20_000 });

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

    // Wait for content, then scroll to trigger collapsed header on mobile
    await page.locator('[data-testid="listing-card"], h1, h2, h3').first()
      .waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);

    // Open filters using shared hydration-aware helper
    const filtersBtnLocator = getFiltersButton(page);
    await expect(filtersBtnLocator).toBeVisible({ timeout: 20_000 });
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
