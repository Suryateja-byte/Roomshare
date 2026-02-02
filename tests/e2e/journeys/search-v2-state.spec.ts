/**
 * Search V2 State Reset Tests
 *
 * P2b: Validates that navigating from a V2 search to a bounds-required path
 * properly resets the V2 context state (via V1PathResetSetter).
 *
 * Problem: When v2 search succeeds, isV2Enabled=true persists in context.
 * If the next navigation hits boundsRequired early return, V2MapDataSetter
 * doesn't render, leaving stale v2 state. PersistentMapWrapper's race guard
 * then loops forever waiting for v2 data that will never arrive.
 *
 * Solution: Include V1PathResetSetter in the boundsRequired early return path.
 */
import { test, expect, tags, SF_BOUNDS, timeouts } from "../helpers";

test.describe("V2 State Reset on Bounds-Required Path", () => {
  test(`${tags.core} - resets v2 context state when navigating to bounds-required path`, async ({
    page,
  }) => {
    // Use desktop viewport for consistent behavior
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Do a v2 search with valid bounds (simulates successful v2 search)
    const boundsParams = new URLSearchParams({
      q: "austin",
      minLat: SF_BOUNDS.minLat.toString(),
      maxLat: SF_BOUNDS.maxLat.toString(),
      minLng: SF_BOUNDS.minLng.toString(),
      maxLng: SF_BOUNDS.maxLng.toString(),
    });

    await page.goto(`/search?${boundsParams.toString()}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for initial search to complete (results heading visible)
    const resultsHeading = page
      .getByRole("heading", {
        name: /\d+\+?\s*places?|available/i,
      })
      .first();
    await expect(resultsHeading).toBeVisible({ timeout: timeouts.navigation });

    // 2. Navigate to bounds-required path (query without bounds)
    // This triggers the boundsRequired early return in page.tsx
    await page.goto("/search?q=downtown");
    await page.waitForLoadState("domcontentloaded");

    // 3. Verify: Should show location prompt, not hang in loading
    // The key assertion: "Please select a location" appears within reasonable time
    const locationPrompt = page.getByText("Please select a location");
    await expect(locationPrompt).toBeVisible({ timeout: timeouts.action });

    // 4. Map should not be stuck in loading state
    // The race guard overlay shows "Updating..." when stuck
    const updatingOverlay = page.locator('[aria-label="Updating map results"]');
    await expect(updatingOverlay).not.toBeVisible();

    // Also verify the "Loading map..." placeholder is gone
    const mapLoadingText = page.getByText("Loading map...");
    // If visible, it should disappear quickly (not stuck)
    const isMapLoading = await mapLoadingText.isVisible();
    if (isMapLoading) {
      // If somehow still loading, it should resolve within action timeout
      await expect(mapLoadingText).not.toBeVisible({ timeout: timeouts.action });
    }
  });

  test(`${tags.core} - handles rapid navigation between v2 and bounds-required paths`, async ({
    page,
  }) => {
    // Use desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    const boundsParams = new URLSearchParams({
      q: "test",
      minLat: SF_BOUNDS.minLat.toString(),
      maxLat: SF_BOUNDS.maxLat.toString(),
      minLng: SF_BOUNDS.minLng.toString(),
      maxLng: SF_BOUNDS.maxLng.toString(),
    });

    // Rapid navigation pattern that could trigger race conditions
    // V2 search -> bounds-required -> V2 search -> bounds-required
    await page.goto(`/search?${boundsParams.toString()}`);
    await page.waitForLoadState("domcontentloaded");

    await page.goto("/search?q=city1");
    await page.waitForLoadState("domcontentloaded");

    await page.goto(`/search?${boundsParams.toString()}`);
    await page.waitForLoadState("domcontentloaded");

    await page.goto("/search?q=city2");
    await page.waitForLoadState("domcontentloaded");

    // Final state: should show location prompt, not be stuck
    const locationPrompt = page.getByText("Please select a location");
    await expect(locationPrompt).toBeVisible({ timeout: timeouts.action });

    // Verify no stuck loading states
    const updatingOverlay = page.locator('[aria-label="Updating map results"]');
    await expect(updatingOverlay).not.toBeVisible();
  });
});
