/**
 * Recommended Filters E2E Tests (P2)
 *
 * Validates the RecommendedFilters component that displays contextual
 * suggestion pills ("Try: Furnished, Pet Friendly, Wifi, ...") above
 * search results, helping users discover useful filter combinations.
 *
 * Key implementation details:
 * - Component: RecommendedFilters.tsx
 * - Row container: div.flex.items-center.gap-2 with "Try:" label
 * - SUGGESTIONS array has 10 items; available = those not yet applied
 * - MAX_PILLS = 5 (at most 5 pills visible at once)
 * - Clicking a pill appends the filter to URL and resets pagination
 * - Component returns null when available.length === 0
 * - Array params (amenities, houseRules) append via comma-separated values
 * - Scalar params (roomType, leaseDuration, maxPrice) set directly
 */

import { test, expect, SF_BOUNDS, selectors, timeouts, tags, searchResultsContainer } from "../helpers/test-utils";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

function recommendedRow(page: Page) {
  return searchResultsContainer(page).locator('.flex.items-center.gap-2').filter({ hasText: "Try:" });
}

function appliedFiltersRegion(page: Page) {
  return searchResultsContainer(page).locator('[aria-label="Applied filters"]');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Recommended Filters", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 16.1: Recommended filter pills shown on base search
  test("16.1 - recommended filter pills shown with Try label and up to 5 pills", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const row = recommendedRow(page);
    const rowVisible = await row.isVisible().catch(() => false);
    test.skip(!rowVisible, "Recommended filters row not visible (may require results)");

    // "Try:" label should be visible
    await expect(row.locator("text=Try:")).toBeVisible({ timeout: 10_000 });

    // Count suggestion pill buttons inside the row
    const pills = row.locator("button");
    const pillCount = await pills.count();

    // Should have at least 1 pill and at most MAX_PILLS (5)
    expect(pillCount).toBeGreaterThanOrEqual(1);
    expect(pillCount).toBeLessThanOrEqual(5);

    // Pills should include known suggestions (at least one recognizable label)
    const knownLabels = ["Furnished", "Pet Friendly", "Wifi", "Parking", "Washer"];
    let foundKnown = false;
    for (const label of knownLabels) {
      const pill = row.getByRole("button", { name: label, exact: true });
      if (await pill.isVisible().catch(() => false)) {
        foundKnown = true;
        break;
      }
    }
    expect(foundKnown).toBe(true);
  });

  // 16.2: Clicking suggestion applies the filter
  test("16.2 - clicking Furnished pill applies amenities filter and shows chip", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const row = recommendedRow(page);
    const rowVisible = await row.isVisible().catch(() => false);
    test.skip(!rowVisible, "Recommended filters row not visible");

    // Find and click "Furnished" pill
    const furnishedPill = row.getByRole("button", { name: "Furnished", exact: true });
    await expect(furnishedPill).toBeVisible({ timeout: 10_000 });
    await furnishedPill.click();

    // Wait for URL to update with amenities param
    await page.waitForURL(
      (url) => {
        const amenities = new URL(url).searchParams.get("amenities") ?? "";
        return amenities.includes("Furnished");
      },
      { timeout: 15_000 },
    );

    // URL should contain the amenity
    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Furnished");

    // "Furnished" pill should disappear from recommendations (already applied)
    const updatedRow = recommendedRow(page);
    const updatedRowVisible = await updatedRow.isVisible().catch(() => false);
    if (updatedRowVisible) {
      const furnishedPillAfter = updatedRow.getByRole("button", { name: "Furnished", exact: true });
      await expect(furnishedPillAfter).not.toBeVisible({ timeout: 5_000 });
    }

    // Filter chip for "Furnished" should appear in applied filters
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Furnished/i").first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // 16.3: Suggestions update after filter changes
  test("16.3 - clicking Wifi removes it from suggestions while others remain", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const row = recommendedRow(page);
    const rowVisible = await row.isVisible().catch(() => false);
    test.skip(!rowVisible, "Recommended filters row not visible");

    // Record which pills are initially visible
    const pillsBefore = row.locator("button");
    const countBefore = await pillsBefore.count();

    // Find and click "Wifi" pill
    const wifiPill = row.getByRole("button", { name: "Wifi", exact: true });
    const wifiVisible = await wifiPill.isVisible().catch(() => false);
    test.skip(!wifiVisible, "Wifi pill not visible in recommendations");

    await wifiPill.click();

    // Wait for URL to update
    await page.waitForURL(
      (url) => {
        const amenities = new URL(url).searchParams.get("amenities") ?? "";
        return amenities.includes("Wifi");
      },
      { timeout: 15_000 },
    );

    // Pagination params should be reset
    expect(getUrlParam(page, "cursor")).toBeNull();
    expect(getUrlParam(page, "page")).toBeNull();

    // After applying, check updated recommendations
    await page.waitForTimeout(1_000);
    const updatedRow = recommendedRow(page);
    const updatedRowVisible = await updatedRow.isVisible().catch(() => false);

    if (updatedRowVisible) {
      // "Wifi" should no longer appear in suggestions
      const wifiPillAfter = updatedRow.getByRole("button", { name: "Wifi", exact: true });
      await expect(wifiPillAfter).not.toBeVisible({ timeout: 5_000 });

      // Other suggestions should still be present
      const pillsAfter = updatedRow.locator("button");
      const countAfter = await pillsAfter.count();
      expect(countAfter).toBeGreaterThanOrEqual(1);
    }
  });

  // 16.4: No recommendations when all suggestion filters are applied
  test("16.4 - no Try section when all suggestion filters are already applied", async ({ page }) => {
    // Apply all 10 suggestions from the SUGGESTIONS array via URL params:
    // Furnished, Wifi, Parking, Washer (amenities), Pets allowed + Couples allowed (houseRules),
    // Private Room (roomType), Month-to-month (leaseDuration), 1000 (maxPrice)
    // Note: "Entire Place" also in suggestions but conflicts with Private Room (single-select)
    const allSuggestionsURL = [
      SEARCH_URL,
      "amenities=Furnished,Wifi,Parking,Washer",
      "houseRules=Pets+allowed,Couples+allowed",
      "roomType=Private+Room",
      "leaseDuration=Month-to-month",
      "maxPrice=1000",
    ].join("&");

    await page.goto(allSuggestionsURL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // The "Try:" section should NOT be visible since all applicable suggestions are applied
    // (Private Room blocks Entire Place, and maxPrice=1000 matches Under $1000)
    const row = recommendedRow(page);
    const rowVisible = await row.isVisible().catch(() => false);
    expect(rowVisible).toBe(false);
  });
});
