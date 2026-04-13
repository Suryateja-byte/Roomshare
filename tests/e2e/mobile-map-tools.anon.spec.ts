import { test, expect, SF_BOUNDS, timeouts, waitForMapReady } from "./helpers/test-utils";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

async function openPhoneMap(page: import("@playwright/test").Page) {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-testid="listing-card"]')
    .first()
    .waitFor({ state: "attached", timeout: timeouts.navigation });
  await waitForMapReady(page);

  const showMap = page.getByRole("button", { name: "Show map" });
  if (await showMap.isVisible().catch(() => false)) {
    await showMap.click();
  }

  await expect(
    page.getByRole("button", { name: /more map tools/i })
  ).toBeVisible({ timeout: timeouts.action });
}

async function expectPhoneToolsSheetFitsViewport(
  page: import("@playwright/test").Page,
  viewport: { width: number; height: number }
) {
  const trigger = page.getByRole("button", { name: /more map tools/i });
  await trigger.click();

  const sheet = page.getByTestId("mobile-map-tools-sheet");
  await expect(sheet).toBeVisible({ timeout: timeouts.action });
  await expect(page.getByTestId("mobile-map-tools-overlay")).toBeVisible();
  await expect(page.getByRole("button", { name: /zoom in on map/i })).toHaveCount(
    0
  );

  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeGreaterThan(viewport.width * 0.8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThan(viewport.height * 0.2);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByTestId("mobile-map-tools-overlay").click({ position: { x: 24, y: 24 } });
  await expect(sheet).toHaveCount(0);

  await trigger.click();
  await expect(sheet).toBeVisible({ timeout: timeouts.action });
  await page.getByRole("button", { name: /^drop pin$/i }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /more map tools, 1 active/i })
  ).toBeVisible({ timeout: timeouts.action });
}

test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name.includes("webkit")) {
    test.skip(true, "Radix dialog/mobile layout coverage is validated in Chromium");
  }
  if (testInfo.project.name.includes("firefox")) {
    test.skip(true, "Phone-sized map controls are validated in Chromium");
  }
  test.slow();
});

test.describe("Mobile map tools", () => {
  test("390x844 renders a bottom-anchored tools sheet that dismisses cleanly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPhoneMap(page);
    await expectPhoneToolsSheetFitsViewport(page, { width: 390, height: 844 });
  });

  test("375x812 avoids clipping and horizontal overflow on narrower phones", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPhoneMap(page);
    await expectPhoneToolsSheetFitsViewport(page, { width: 375, height: 812 });
  });
});
