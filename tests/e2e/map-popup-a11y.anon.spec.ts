/**
 * Map popup accessibility (Batch 1 a11y quick wins).
 *
 * - Desktop selection popup: dialog semantics + Tab focus containment so Tab no
 *   longer escapes into the keyboard-tabbable markers behind it (audit medium #2).
 * - Mobile preview card: close button meets the 44px touch-target standard (low).
 *
 * Map tests gracefully skip when WebGL markers are unavailable (headless CI).
 */
import { test, expect, tags, timeouts, SF_BOUNDS } from "./helpers/test-utils";
import { waitForMapReady } from "./helpers";
import { prepareUnclusteredMarkerViewport } from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/**
 * Open the first individual listing marker. Returns false when no markers are
 * available (headless WebGL) so the caller can skip rather than fail.
 */
async function openFirstMarker(page: Page): Promise<boolean> {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await waitForMapReady(page);

  const prepared = await prepareUnclusteredMarkerViewport(page);
  if (!prepared) return false;

  const markers = page.locator(".maplibregl-marker:visible");
  if ((await markers.count()) === 0) return false;

  // Click the .maplibregl-marker wrapper (react-map-gl's native handler).
  await markers.first().evaluate((el) => (el as HTMLElement).click());
  return true;
}

test.describe("Map popup accessibility — desktop dialog + focus trap", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async ({}, testInfo) => {
    test.slow(); // WebGL rendering needs extra time in CI
    test.skip(
      testInfo.project.name.includes("Mobile"),
      "Desktop popup requires a desktop viewport"
    );
    test.skip(
      testInfo.project.name === "webkit",
      "Map tests have timing issues on webkit"
    );
  });

  test(`${tags.anon} ${tags.a11y} selection popup is a labelled dialog that contains Tab`, async ({
    page,
  }) => {
    test.skip(!(await openFirstMarker(page)), "No map markers available (WebGL)");

    const card = page.locator('[data-testid="map-popup-card"]');
    await expect(card).toBeVisible({ timeout: timeouts.action });

    // Dialog semantics with an accessible name sourced from the title heading.
    await expect(card).toHaveAttribute("role", "dialog");
    await expect(card).toHaveAttribute("aria-modal", "true");
    const labelledBy = await card.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = page.locator(`[id="${labelledBy}"]`);
    const headingText = ((await heading.textContent()) ?? "").trim();
    expect(headingText.length).toBeGreaterThan(0);
    await expect(card).toHaveAccessibleName(headingText);

    // Focus containment: Tabbing cycles within the card and never lands on a
    // marker behind the popup (the regression this fix targets).
    const closeBtn = card.locator('button[aria-label="Close listing preview"]');
    await closeBtn.focus();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const onMarker = await page.evaluate(
        () => !!document.activeElement?.closest(".maplibregl-marker")
      );
      expect(onMarker).toBe(false);
      const withinCard = await card.evaluate((el) =>
        el.contains(document.activeElement)
      );
      expect(withinCard).toBe(true);
    }

    // Escape closes the popup and returns focus to the originating marker.
    await page.keyboard.press("Escape");
    await expect(page.locator(".maplibregl-popup")).not.toBeVisible({
      timeout: 2000,
    });
    const focusBackOnMarker = await page.evaluate(
      () => !!document.activeElement?.closest(".maplibregl-marker")
    );
    expect(focusBackOnMarker).toBe(true);
  });
});

test.describe("Map preview accessibility — mobile close-button touch target", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });

  test.beforeEach(async ({}, testInfo) => {
    test.slow();
    test.skip(
      testInfo.project.name === "webkit",
      "Map tests have timing issues on webkit"
    );
  });

  test(`${tags.anon} ${tags.a11y} mobile preview close button meets the 44px touch target`, async ({
    page,
  }) => {
    test.skip(!(await openFirstMarker(page)), "No map markers available (WebGL)");

    const previewCard = page.locator('[data-testid="map-preview-card"]');
    await expect(previewCard).toBeVisible({ timeout: timeouts.action });

    const closeBtn = previewCard.locator(
      'button[aria-label="Close listing preview"]'
    );
    const box = await closeBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
