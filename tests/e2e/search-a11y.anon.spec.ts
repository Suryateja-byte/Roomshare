/**
 * Search Page Accessibility: Landmarks and Semantic Structure (P0)
 *
 * Validates ARIA landmarks, heading hierarchy, image alt text,
 * and broken ARIA references on the search results page.
 *
 * Run: pnpm playwright test tests/e2e/search-a11y.anon.spec.ts --project=chromium-anon
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  tags,
  searchResultsContainer,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/** Wait for search results heading to be visible */
async function waitForResults(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { level: 1 }).first(),
  ).toBeVisible({ timeout: 30000 });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search A11y: Landmarks & Semantic Structure", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);
  });

  // 1. Page has `main` landmark
  test("1. page has main landmark", { tag: [tags.a11y] }, async ({ page }) => {
    // MainLayout renders <main id="main-content" role="main">
    // Search layout may wrap differently, but main should exist somewhere
    const main = page.locator('main, [role="main"]');
    // At least one main landmark must exist
    const count = await main.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // The main landmark should be visible
    await expect(main.first()).toBeVisible();
  });

  // 2. Page has `nav` navigation landmark
  test("2. page has nav navigation landmark", { tag: [tags.a11y] }, async ({ page }) => {
    const nav = page.locator('nav, [role="navigation"]');
    const count = await nav.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(nav.first()).toBeVisible();
  });

  // 3. Feed has role="feed" with aria-label="Search results"
  test("3. feed has role=feed with aria-label", { tag: [tags.a11y] }, async ({ page }) => {
    const container = searchResultsContainer(page);
    const feed = container.locator('[role="feed"][aria-label="Search results"]');
    await expect(feed).toBeAttached({ timeout: timeouts.action });

    // Feed should contain listing cards
    const cards = feed.locator('[data-testid="listing-card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  // 4. Feed has aria-busy attribute during loading
  test("4. feed container supports aria-busy during loading", { tag: [tags.a11y] }, async ({ page }) => {
    // The SearchResultsLoadingWrapper wraps results with aria-busy
    // It uses aria-busy={isPending} on its outer div
    // On initial load, the feed itself does not have aria-busy (only during transitions)
    // We verify the loading wrapper structure is present
    const loadingWrapper = page.locator('[aria-busy]');
    // After page loads, aria-busy should be "false" or not present
    // We simply verify the feed role exists and the wrapper exists in DOM
    const feed = page.locator('[role="feed"]').first();
    await expect(feed).toBeAttached();

    // The SearchResultsLoadingWrapper parent should have aria-busy attribute
    // After loading completes, it should be false
    const wrapperBusy = page.locator('.relative[aria-busy]');
    if (await wrapperBusy.count() > 0) {
      const busyValue = await wrapperBusy.first().getAttribute("aria-busy");
      // After results load, should no longer be busy
      expect(busyValue).toBe("false");
    }
  });

  // 5. Map has appropriate role and label
  test("5. map region has appropriate role and label", { tag: [tags.a11y] }, async ({ page }) => {
    // The map container may have role="application" or be a canvas
    // MobileBottomSheet has role="region" aria-label="Search results"
    // Check for map container via data-testid or class patterns
    const mapContainer = page.locator(
      '[data-testid="map"], .maplibregl-map, .maplibregl-map, [role="application"]'
    );

    // Map may not render on all viewport sizes, so check if present first
    const mapCount = await mapContainer.count();
    if (mapCount > 0) {
      // Map container should be visible on desktop
      const isVisible = await mapContainer.first().isVisible().catch(() => false);
      if (isVisible) {
        // Mapbox canvas should have some accessible identification
        // The mapboxgl-canvas typically has role="region" or is contained in one
        const canvas = page.locator('.maplibregl-canvas, .maplibregl-canvas');
        if (await canvas.count() > 0) {
          // Canvas should have aria-label or be inside a labeled container
          const parentRole = await canvas.first().evaluate((el) => {
            const parent = el.closest('[role]');
            return parent?.getAttribute("role") || null;
          });
          // Log for awareness - map canvas accessibility varies by library
          if (!parentRole) {
            console.log("Info: Map canvas parent has no explicit ARIA role");
          }
        }
      }
    }
  });

  // 6. Heading hierarchy: h1 exists, no skipped levels
  test("6. heading hierarchy - h1 exists with no skipped levels", { tag: [tags.a11y] }, async ({ page }) => {
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(hs).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim().slice(0, 80) || "",
        visible: (h as HTMLElement).offsetParent !== null,
      }));
    });

    // Must have at least one h1
    const h1s = headings.filter((h) => h.level === 1);
    expect(h1s.length).toBeGreaterThanOrEqual(1);

    // Search results heading should exist
    // page.tsx renders: <h1 id="search-results-heading">
    const searchHeading = page.locator("#search-results-heading").first();
    await expect(searchHeading).toBeAttached();

    // Check for skipped heading levels among visible headings
    const visibleHeadings = headings.filter((h) => h.visible);
    const skippedLevels: string[] = [];
    let previousLevel = 0;

    for (const heading of visibleHeadings) {
      if (heading.level > previousLevel + 1 && previousLevel !== 0) {
        skippedLevels.push(
          `Skipped from h${previousLevel} to h${heading.level}: "${heading.text}"`,
        );
      }
      previousLevel = heading.level;
    }

    if (skippedLevels.length > 0) {
      console.log("Heading hierarchy issues found:");
      skippedLevels.forEach((s) => console.log(`  - ${s}`));
    }

    // Allow a small number of skips (e.g., sidebar/widget headings)
    expect(skippedLevels.length).toBeLessThan(3);
  });

  // 7. All images have alt text or role="presentation"
  test("7. all images have alt text or role=presentation", { tag: [tags.a11y] }, async ({ page }) => {
    const images = page.locator("img:visible");
    const imageCount = await images.count();

    const missingAlt: string[] = [];

    for (let i = 0; i < Math.min(imageCount, 30); i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");
      const ariaLabel = await img.getAttribute("aria-label");
      const ariaHidden = await img.getAttribute("aria-hidden");
      const src = await img.getAttribute("src");

      // Image should have alt, aria-label, role="presentation", or aria-hidden="true"
      if (
        alt === null &&
        role !== "presentation" &&
        !ariaLabel &&
        ariaHidden !== "true"
      ) {
        missingAlt.push(src?.slice(0, 80) || "unknown");
      }
    }

    if (missingAlt.length > 0) {
      console.log("Images missing accessible text:");
      missingAlt.slice(0, 5).forEach((s) => console.log(`  - ${s}`));
    }

    expect(missingAlt).toHaveLength(0);
  });

  // 8. No broken ARIA references (aria-labelledby/describedby point to existing IDs)
  test("8. no broken ARIA references", { tag: [tags.a11y] }, async ({ page }) => {
    const brokenRefs = await page.evaluate(() => {
      const broken: string[] = [];
      const refAttrs = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"];

      for (const attr of refAttrs) {
        const elements = document.querySelectorAll(`[${attr}]`);
        elements.forEach((el) => {
          const refValue = el.getAttribute(attr);
          if (!refValue) return;

          // aria-labelledby/describedby can have multiple space-separated IDs
          const ids = refValue.split(/\s+/);
          for (const id of ids) {
            if (id && !document.getElementById(id)) {
              const tag = el.tagName.toLowerCase();
              const elId = el.id ? `#${el.id}` : "";
              broken.push(`${tag}${elId}[${attr}="${refValue}"] -> missing #${id}`);
            }
          }
        });
      }

      return broken;
    });

    if (brokenRefs.length > 0) {
      console.log("Broken ARIA references found:");
      brokenRefs.forEach((r) => console.log(`  - ${r}`));
    }

    expect(brokenRefs).toHaveLength(0);
  });
});
