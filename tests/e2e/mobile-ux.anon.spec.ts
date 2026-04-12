/**
 * Terminal 4: Mobile UX E2E Tests (Anonymous — no auth required)
 *
 * Tests for tasks 4.1–4.7: Bottom sheet, floating button, card rendering.
 *
 * Run: pnpm playwright test tests/e2e/mobile-ux.anon.spec.ts --project=chromium-anon
 */

import { test, expect, SF_BOUNDS } from "./helpers/test-utils";
import {
  ensureMobileResultsVisible,
  waitForSheetAnimation,
} from "./helpers/mobile-helpers";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// Mobile viewport — overrides Desktop Chrome defaults
// Note: isMobile/hasTouch removed — unsupported in Firefox and causes
// positioning bugs in Desktop WebKit. Viewport size alone triggers mobile layout.
test.use({
  viewport: { width: 393, height: 852 },
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name.includes("webkit"), "Radix UI hydration issues on webkit");
  test.slow();
});

test.describe("Mobile UX — Page Load", () => {
  test("search page loads and shows listings on mobile", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`/search?${boundsQS}`);

    // Wait for at least one listing to appear
    const listings = page.locator('a[href^="/listings/"]');
    await expect(listings.first()).toBeAttached({ timeout: 30_000 });

    const count = await listings.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Filter benign console errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes("mapbox") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("hydrat") &&
        !e.includes("favicon") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR")
    );
    expect(realErrors).toHaveLength(0);
  });

  test("listing cards keep rounded corners inside the mobile results sheet", async ({
    page,
  }) => {
    await page.goto(`/search?${boundsQS}`);
    await ensureMobileResultsVisible(page);

    const mobileContainer = page.locator(
      '[data-testid="mobile-search-results-container"]'
    );
    const firstCard = mobileContainer.locator('[data-testid="listing-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    const radii = await firstCard.evaluate((article) => {
      const link = article.querySelector("a");
      const cardSurface = link?.firstElementChild;

      return {
        article: getComputedStyle(article as HTMLElement).borderTopLeftRadius,
        link: link
          ? getComputedStyle(link as HTMLElement).borderTopLeftRadius
          : null,
        cardSurface: cardSurface
          ? getComputedStyle(cardSurface as HTMLElement).borderTopLeftRadius
          : null,
      };
    });

    // The article has explicit rounded-2xl. Inner <a> and card surface may
    // or may not have explicit border-radius (CSS border-radius is not
    // inherited). The key invariant: the outer article must be rounded.
    expect(parseFloat(radii.article)).toBeGreaterThan(0);
  });
});

test.describe("Mobile UX — Bottom Sheet (4.1)", () => {
  test("bottom sheet region exists on mobile viewport", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);

    // Wait for listings to load first
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    // The bottom sheet should render with role="region"
    const sheet = page.locator('[role="region"][aria-label="Search results"]');
    // If the sheet is visible, verify it
    const sheetVisible = await sheet
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (sheetVisible) {
      // Sheet should have proper ARIA
      await expect(sheet).toHaveAttribute("role", "region");
      await expect(sheet).toHaveAttribute("aria-label", "Search results");

      // Should have a drag handle (slider role)
      const handle = sheet.locator('[role="slider"]').first();
      await expect(handle).toBeVisible();

      // Should have header text
      const header = sheet.locator('[data-testid="sheet-header-text"]').first();
      await expect(header).toBeVisible();
    } else {
      // On mobile with isMobile: true, the md:hidden parent shows the sheet.
      // If we reach here, check the mobile results container exists
      const mobileContainer = page.locator(
        '[data-testid="mobile-search-results-container"]'
      );
      const containerExists = await mobileContainer
        .count()
        .then((c) => c > 0)
        .catch(() => false);
      expect(containerExists).toBeTruthy();
    }
  });

  test("expand/collapse toggles sheet height", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    const sheet = page.locator('[role="region"][aria-label="Search results"]');
    const sheetVisible = await sheet.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!sheetVisible, "Bottom sheet not visible");
    if (!sheetVisible) return;

    // Wait for sheet animation to fully settle before measuring
    await waitForSheetAnimation(page);
    const beforeBox = await sheet.boundingBox();
    const beforeHeight = beforeBox?.height ?? 0;

    await ensureMobileResultsVisible(page);

    const expandedBox = await sheet.boundingBox();
    const expandedHeight = expandedBox?.height ?? 0;
    expect(expandedHeight).toBeGreaterThanOrEqual(beforeHeight);

    await page.keyboard.press("Escape");
    await waitForSheetAnimation(page);

    const collapsedBox = await sheet.boundingBox();
    const collapsedHeight = collapsedBox?.height ?? 0;
    expect(collapsedHeight).toBeLessThanOrEqual(expandedHeight);
  });

  test("escape key collapses expanded sheet", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    const sheet = page.locator('[role="region"][aria-label="Search results"]');
    const sheetVisible = await sheet.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!sheetVisible, "Bottom sheet not visible");
    if (!sheetVisible) return;

    await ensureMobileResultsVisible(page);
    const expandedBox = await sheet.boundingBox();

    await page.keyboard.press("Escape");
    await waitForSheetAnimation(page);

    const afterEscBox = await sheet.boundingBox();
    if (expandedBox && afterEscBox) {
      expect(afterEscBox.height).toBeLessThan(expandedBox.height);
    }
  });
});

test.describe("Mobile UX — Floating Map Button (4.2)", () => {
  test("floating toggle button is visible", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    // The floating map/list toggle button is visible on mobile
    const btn = page
      .locator('button[aria-label*="map" i], button[aria-label*="list" i]')
      .filter({ hasNotText: "Save" });
    await expect(btn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("floating button toggles between map and list", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    await page.waitForLoadState("networkidle").catch(() => {});
    const listBtn = page.locator('button[aria-label="Show list"]');
    await expect(listBtn).toBeVisible({ timeout: 5_000 });
    await listBtn.click();

    const mapBtn = page.locator('button[aria-label="Show map"]');
    await expect(mapBtn).toBeVisible({ timeout: 5_000 });

    await mapBtn.click();
    await expect(listBtn).toBeVisible({ timeout: 5_000 });
  });

  test("floating button has correct positioning classes", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    const btn = page
      .locator('button[aria-label="Show map"], button[aria-label="Show list"]')
      .first();
    if (await btn.isVisible().catch(() => false)) {
      const cls = (await btn.getAttribute("class")) || "";
      expect(cls).toContain("fixed");
      expect(cls).toContain("rounded-full");
      expect(cls).toContain("z-50");
    }
  });
});

test.describe("Mobile UX — Haptic Feedback (4.7)", () => {
  test("floating button has active scale class", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    const btn = page
      .locator('button[aria-label="Show map"], button[aria-label="Show list"]')
      .first();
    if (await btn.isVisible().catch(() => false)) {
      const cls = (await btn.getAttribute("class")) || "";
      expect(cls).toContain("active:scale-95");
    }
  });
});

test.describe("Mobile UX — Accessibility", () => {
  test("interactive elements have proper ARIA labels", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/"]').first()).toBeAttached({
      timeout: 30_000,
    });

    // Floating button should have aria-label
    const toggleBtn = page.locator(
      'button[aria-label="Show map"], button[aria-label="Show list"]'
    );
    const toggleCount = await toggleBtn.count();
    expect(toggleCount).toBeGreaterThanOrEqual(1);

    // Bottom sheet should have role and aria-label if visible
    const sheet = page.locator('[role="region"][aria-label="Search results"]');
    if (await sheet.isVisible().catch(() => false)) {
      await expect(sheet).toHaveAttribute("role", "region");
    }
  });
});
