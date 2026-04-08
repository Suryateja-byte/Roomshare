/**
 * POI Layer Hydration Safety Tests
 *
 * Verifies that the POI toggle layer renders without hydration mismatches
 * and functions correctly. The POILayer component defers sessionStorage reads
 * to useEffect to avoid SSR/hydration mismatches.
 *
 * Run:
 *   pnpm playwright test tests/search-stability/poi-hydration.anon.spec.ts --project=chromium-anon
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if the map canvas is visible (WebGL initialized) */
async function isMapAvailable(page: Page): Promise<boolean> {
  try {
    await page.locator(".maplibregl-canvas:visible").first().waitFor({
      state: "visible",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Wait for the E2E map ref to be exposed */
async function waitForMapRef(page: Page, timeout = 30_000): Promise<boolean> {
  try {
    await page.waitForFunction(() => !!(window as any).__e2eMapRef, {
      timeout,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate POI toggle buttons.
 * Desktop POI controls live inside the Map tools menu and expose
 * menuitemcheckbox semantics with aria-label like "Show Transit".
 */
function poiButtons(page: Page) {
  return page.locator('[data-testid="poi-category"]');
}

async function openMapTools(page: Page) {
  const trigger = page.locator('button[aria-label^="Map tools"]').first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  await poiButtons(page).first().waitFor({ state: "visible", timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("POI Layer Hydration Safety", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test("POI toggle buttons render after map loads", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    test.skip(!(await isMapAvailable(page)), "Map not available (WebGL unavailable in headless)");

    const hasMapRef = await waitForMapRef(page);
    test.skip(!hasMapRef, "Map E2E ref not available");

    await openMapTools(page);

    // POI buttons should be rendered (Transit, POIs, Parks)
    const buttons = poiButtons(page);
    await expect(buttons.first()).toBeVisible({ timeout: 15_000 });

    // Should have exactly 3 category buttons
    const count = await buttons.count();
    expect(count).toBe(3);

    // All should start unpressed (default state, no sessionStorage)
    for (let i = 0; i < count; i++) {
      const pressed = await buttons.nth(i).getAttribute("aria-checked");
      expect(pressed).toBe("false");
    }
  });

  test("toggling a POI button activates it (aria-pressed=true)", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    test.skip(!(await isMapAvailable(page)), "Map not available (WebGL unavailable in headless)");

    const hasMapRef = await waitForMapRef(page);
    test.skip(!hasMapRef, "Map E2E ref not available");

    // Wait for POI buttons
    await openMapTools(page);
    const buttons = poiButtons(page);

    // Click the first POI button (Transit)
    const transitButton = buttons.first();
    await transitButton.click();

    // Should now be pressed
    await expect(transitButton).toHaveAttribute("aria-checked", "true");

    // Click again to toggle off
    await transitButton.click();

    // Should be unpressed again
    await expect(transitButton).toHaveAttribute("aria-checked", "false");
  });

  test("no hydration mismatch warnings in console", async ({ page }) => {
    const consoleMessages: { type: string; text: string }[] = [];

    page.on("console", (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    test.skip(!(await isMapAvailable(page)), "Map not available (WebGL unavailable in headless)");

    // Wait for map and POI layer to fully render
    await waitForMapRef(page);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Check for hydration-related warnings/errors
    const hydrationIssues = consoleMessages.filter(({ text }) => {
      const lower = text.toLowerCase();
      return (
        lower.includes("hydration") ||
        lower.includes("text content does not match") ||
        lower.includes("did not match") ||
        lower.includes("server-rendered") ||
        lower.includes("hydrate")
      );
    });

    // Filter out known non-critical messages
    const criticalHydrationIssues = hydrationIssues.filter(({ text }) => {
      // React hydration errors are always critical
      return (
        text.includes("Hydration failed") ||
        text.includes("Text content does not match") ||
        text.includes("did not match. Server:") ||
        text.includes("There was an error while hydrating")
      );
    });

    expect(criticalHydrationIssues).toHaveLength(0);
  });

  test("POI button aria-labels are correct for accessibility", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    test.skip(!(await isMapAvailable(page)), "Map not available (WebGL unavailable in headless)");

    const hasMapRef = await waitForMapRef(page);
    test.skip(!hasMapRef, "Map E2E ref not available");

    await openMapTools(page);

    const buttons = poiButtons(page);

    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const ariaLabel = await buttons.nth(i).getAttribute("aria-label");
      expect(ariaLabel).toBeTruthy();
      // Should contain "Show" or "Hide" prefix
      expect(ariaLabel).toMatch(/^(Show|Hide) /);
    }
  });
});
