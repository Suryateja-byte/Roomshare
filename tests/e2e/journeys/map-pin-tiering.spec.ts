/**
 * E2E Test: Map Pin Tiering
 *
 * Tests Airbnb-style pin tiering with mocked API data.
 * Run with: pnpm test:e2e tests/e2e/journeys/map-pin-tiering.spec.ts
 *
 * The mock creates 50 listings at 50 unique locations.
 * With default PRIMARY_PIN_LIMIT=40, we get 40 primary + 10 mini pins (deterministic).
 */

import { test, expect, timeouts, tags, waitForMapMarkers } from "../helpers";
import { setupPinTieringMock } from "../helpers/pin-tiering-helpers";

test.describe("Map Pin Tiering", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`${tags.anon} - Renders both primary and mini pins`, async ({
    page,
  }) => {
    const { cleanup, triggerRefetch } = await setupPinTieringMock(page);

    try {
      await triggerRefetch();
      await waitForMapMarkers(page);

      // With 49 unique locations and PRIMARY_PIN_LIMIT=40, expect 40 primary + 9 mini
      // Use .mapboxgl-marker as base selector (react-map-gl wrapper class)
      const miniPins = page.locator(
        '.mapboxgl-marker:visible [data-testid^="map-pin-mini-"]',
      );
      const primaryPins = page.locator(
        '.mapboxgl-marker:visible [data-testid^="map-pin-primary-"]',
      );

      // Assert both types exist (mock guarantees this)
      await expect(miniPins.first()).toBeVisible({ timeout: timeouts.action });
      await expect(primaryPins.first()).toBeVisible({
        timeout: timeouts.action,
      });

      const miniCount = await miniPins.count();
      const primaryCount = await primaryPins.count();

      console.log(`[Pin Tiering] Primary: ${primaryCount}, Mini: ${miniCount}`);

      // With PRIMARY_PIN_LIMIT=40 and 50 locations: 40 primary, 10 mini
      expect(miniCount).toBeGreaterThanOrEqual(1);
      expect(primaryCount).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  test(`${tags.anon} - Mini pin click opens popup`, async ({ page }) => {
    const { cleanup, triggerRefetch } = await setupPinTieringMock(page);

    try {
      await triggerRefetch();
      await waitForMapMarkers(page);

      // Get a mini pin
      const miniPin = page
        .locator('.mapboxgl-marker:visible [data-testid^="map-pin-mini-"]')
        .first();
      await expect(miniPin).toBeVisible({ timeout: timeouts.action });

      // Use evaluate to click since map markers are positioned with CSS transforms
      // and may be outside the Playwright-recognized viewport
      await miniPin.evaluate((el) => {
        (el as HTMLElement).click();
      });
      await page.waitForTimeout(timeouts.animation);

      // Popup should appear
      const popup = page.locator(
        '.mapboxgl-popup, [data-testid="stacked-popup"]',
      );
      await expect(popup).toBeVisible({ timeout: timeouts.action });
    } finally {
      await cleanup();
    }
  });

  test(`${tags.anon} - Mini pin hover triggers visual feedback`, async ({
    page,
  }) => {
    const { cleanup, triggerRefetch } = await setupPinTieringMock(page);

    try {
      await triggerRefetch();
      await waitForMapMarkers(page);

      // Get a mini pin
      const miniPin = page
        .locator('.mapboxgl-marker:visible [data-testid^="map-pin-mini-"]')
        .first();
      await expect(miniPin).toBeVisible();

      // Use evaluate to dispatch mouseenter since map markers are positioned
      // with CSS transforms and may be outside the Playwright-recognized viewport
      await miniPin.evaluate((el) => {
        el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      });
      await page.waitForTimeout(timeouts.animation);

      // Mini pin should scale up (visual feedback)
      // Check for ring class or scale class on the dot (inner div inside data-testid element)
      const dotElement = miniPin.locator("div").first();
      const classes = await dotElement.getAttribute("class");

      // On hover, should have either scale-150 (from isGroupFocused) or scale-125 (from hover:)
      expect(classes).toMatch(/scale-1(25|50)/);
    } finally {
      await cleanup();
    }
  });

  test(`${tags.anon} - Primary pins still work with tiering enabled`, async ({
    page,
  }) => {
    const { cleanup, triggerRefetch } = await setupPinTieringMock(page);

    try {
      await triggerRefetch();
      await waitForMapMarkers(page);

      const primaryPin = page
        .locator('.mapboxgl-marker:visible [data-testid^="map-pin-primary-"]')
        .first();
      await expect(primaryPin).toBeVisible({ timeout: timeouts.action });

      // Click primary pin - use force to bypass triangle pointer interception
      await primaryPin.click({ force: true });
      await page.waitForTimeout(timeouts.animation);

      // Popup should appear
      await expect(page.locator(".mapboxgl-popup")).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
