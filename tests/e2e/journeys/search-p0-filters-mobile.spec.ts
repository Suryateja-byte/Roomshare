/**
 * P0-1: Mobile Filters Button Accessibility
 *
 * Validates that the Filters button is visible and functional on mobile viewports.
 * The Filters button must be accessible to mobile users to access filter options.
 */
import { test, expect, tags } from "../helpers";

test.describe("P0-1: Mobile Filters Accessibility", () => {
  // Test at iPhone-sized viewport
  test.use({ viewport: { width: 375, height: 812 } });

  test(`${tags.a11y} - Filters button is visible and accessible on mobile`, async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // 1) Assert Filters button exists and is visible on mobile (use exact match)
    const filtersButton = page.getByRole("button", { name: "Filters", exact: true });
    await expect(filtersButton).toBeVisible({ timeout: 10000 });

    // 2) Click should open filter drawer
    await filtersButton.click();

    // 3) Assert a REAL open state - dialog must be visible with Filters heading
    // Use the named dialog to avoid strict mode violation from nested dialog elements
    const filterDialog = page.getByRole("dialog", { name: /filters/i });
    await expect(filterDialog).toBeVisible({ timeout: 5000 });

    // Heading "Filters" inside the dialog confirms it opened correctly
    const filtersHeading = filterDialog.getByRole("heading", {
      name: /filters/i,
    });
    await expect(filtersHeading).toBeVisible();

    // aria-expanded should be true on the trigger button
    await expect(filtersButton).toHaveAttribute("aria-expanded", "true");
  });

  test(`${tags.a11y} - Filter drawer can be closed`, async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Open filters (use exact match to avoid "Close filters" button)
    const filtersButton = page.getByRole("button", { name: "Filters", exact: true });
    await expect(filtersButton).toBeVisible({ timeout: 10000 });
    await filtersButton.click();

    // Verify open - use named dialog to avoid strict mode violation from nested elements
    const filterDialog = page.getByRole("dialog", { name: /filters/i });
    await expect(filterDialog).toBeVisible({ timeout: 5000 });

    // Close via close button
    const closeButton = filterDialog.getByRole("button", {
      name: /close filters/i,
    });
    await closeButton.click();

    // Verify closed
    await expect(filterDialog).not.toBeVisible();
    await expect(filtersButton).toHaveAttribute("aria-expanded", "false");
  });
});
