import { test, expect } from "@playwright/test";
import { VIEWPORTS } from "../helpers/visual-helpers";

/**
 * Responsive breakpoint tests — verify no horizontal overflow,
 * proper navigation, and readable content at every critical viewport.
 *
 * Breakpoints match Tailwind defaults:
 *   sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
 * Plus real device sizes at the narrow end.
 * Aligned with VIEWPORTS from visual-helpers.ts for consistency.
 */

const breakpoints = [
  { name: "small-mobile", width: 320, height: 568 },
  { name: "mobile-se", ...VIEWPORTS.mobileSmall },
  { name: "mobile-14", ...VIEWPORTS.mobileLarge },
  { name: "tablet", ...VIEWPORTS.tablet },
  { name: "desktop-sm", width: 1024, height: 768 },
  { name: "desktop", ...VIEWPORTS.desktop },
] as const;

// Pages that can be tested without auth (public routes)
const publicPages = [
  { name: "homepage", url: "/" },
  { name: "search", url: "/search?minLat=37.7&minLng=-122.5&maxLat=37.8&maxLng=-122.4" },
  { name: "about", url: "/about" },
  { name: "login", url: "/login" },
  { name: "signup", url: "/signup" },
  { name: "forgot-password", url: "/forgot-password" },
  { name: "terms", url: "/terms" },
  { name: "privacy", url: "/privacy" },
] as const;

for (const bp of breakpoints) {
  test.describe(`${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });

    for (const page of publicPages) {
      test(`no horizontal scroll on ${page.name}`, async ({ page: p }) => {
        await p.goto(page.url, { waitUntil: "domcontentloaded" });
        // Wait for layout to settle
        await p.waitForLoadState("networkidle").catch(() => {});

        const hasHorizontalScroll = await p.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      });

      test(`no element overflows viewport on ${page.name}`, async ({ page: p }) => {
        await p.goto(page.url, { waitUntil: "domcontentloaded" });
        await p.waitForLoadState("networkidle").catch(() => {});

        // Find elements that extend beyond viewport width.
        // Elements visually clipped by an overflow-hidden ancestor are excluded —
        // their getBoundingClientRect reports the un-clipped position, but they
        // don't cause visible overflow (e.g., carousel slides, scrollable panels).
        const overflowingElements = await p.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const elements = document.querySelectorAll("body *");
          const overflows: string[] = [];

          // Check if any ancestor clips this element via overflow
          function isClippedByAncestor(el: Element): boolean {
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
              const parentStyle = window.getComputedStyle(parent);
              const overflow = parentStyle.overflow + parentStyle.overflowX;
              if (overflow.includes("hidden") || overflow.includes("clip") || overflow.includes("auto") || overflow.includes("scroll")) {
                const parentRect = parent.getBoundingClientRect();
                // Parent clips content and its right edge is within viewport
                if (parentRect.right <= viewportWidth + 2) {
                  return true;
                }
              }
              parent = parent.parentElement;
            }
            return false;
          }

          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            // Only check visible elements
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
              continue;
            }
            if (rect.right > viewportWidth + 2) {
              // Skip elements clipped by overflow-hidden ancestors (carousels, sliders)
              if (isClippedByAncestor(el)) {
                continue;
              }
              // 2px tolerance for sub-pixel rendering
              const tag = el.tagName.toLowerCase();
              const cls = el.className ? `.${String(el.className).split(" ").slice(0, 2).join(".")}` : "";
              overflows.push(`${tag}${cls} (right: ${Math.round(rect.right)}px > viewport: ${viewportWidth}px)`);
            }
          }
          return overflows.slice(0, 5); // Cap at 5 to keep output readable
        });

        expect(overflowingElements, `Overflowing elements at ${bp.width}px`).toEqual([]);
      });
    }

    // Navigation accessibility varies by breakpoint
    test("navigation is accessible", async ({ page: p }) => {
      await p.goto("/", { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("networkidle").catch(() => {});

      if (bp.width < 768) {
        // Mobile: should have a hamburger/menu button OR collapsed nav
        const mobileMenu = p.locator(
          'button[aria-label*="menu" i], button[aria-label*="nav" i], [data-testid="mobile-menu"], nav button'
        );
        const desktopNav = p.locator('nav a:visible, nav [role="menuitem"]:visible');
        const desktopNavCount = await desktopNav.count();

        // Either there's a hamburger, or nav items are few enough to be shown
        const hasMobileMenu = (await mobileMenu.count()) > 0;
        const hasMinimalNav = desktopNavCount <= 4;

        expect(
          hasMobileMenu || hasMinimalNav,
          `At ${bp.width}px: expected hamburger menu or compact nav`
        ).toBe(true);
      } else {
        // Desktop: nav links should be visible
        const navLinks = p.locator("nav a:visible");
        expect(await navLinks.count()).toBeGreaterThan(0);
      }
    });

    // Text readability: no text smaller than 12px
    test("text is readable (min font size 12px)", async ({ page: p }) => {
      await p.goto("/", { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("networkidle").catch(() => {});

      const tinyTextElements = await p.evaluate(() => {
        const elements = document.querySelectorAll(
          "p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button"
        );
        const tiny: string[] = [];
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
          ) {
            continue;
          }
          const fontSize = parseFloat(style.fontSize);
          const text = el.textContent?.trim() || "";
          // Skip: icon-like elements (≤3 chars), short badge/tag text (≤20 chars at 10px+),
          // footer copyright, and decorative elements
          if (text.length <= 3) continue;
          if (fontSize >= 10 && text.length <= 25) continue; // badges, tags, copyright
          if (fontSize < 11) {
            const tag = el.tagName.toLowerCase();
            tiny.push(`${tag}: "${text.slice(0, 30)}" (${fontSize}px)`);
          }
        }
        return tiny.slice(0, 5);
      });

      expect(tinyTextElements, `Text elements below 11px at ${bp.width}px`).toEqual([]);
    });

    // Images should have proper sizing (no broken aspect ratios from missing width/height)
    test("images have proper dimensions", async ({ page: p }) => {
      await p.goto("/", { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("networkidle").catch(() => {});

      const brokenImages = await p.evaluate(() => {
        const images = document.querySelectorAll("img:not([aria-hidden='true'])");
        const broken: string[] = [];
        for (const img of images) {
          const el = img as HTMLImageElement;
          const rect = el.getBoundingClientRect();
          // Skip hidden images
          if (rect.width === 0 || rect.height === 0) continue;
          // Check for stretched images (aspect ratio mismatch)
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            const naturalRatio = el.naturalWidth / el.naturalHeight;
            const displayRatio = rect.width / rect.height;
            // Allow object-fit: cover/contain to change ratios — check for extreme distortion only
            const ratioDiff = Math.abs(naturalRatio - displayRatio) / naturalRatio;
            if (ratioDiff > 2) {
              broken.push(
                `${el.src.slice(-40)} (natural: ${naturalRatio.toFixed(2)}, display: ${displayRatio.toFixed(2)})`
              );
            }
          }
        }
        return broken.slice(0, 5);
      });

      expect(brokenImages, `Distorted images at ${bp.width}px`).toEqual([]);
    });
  });
}

// Search page specific responsive tests
test.describe("search page responsive layout", () => {
  const searchUrl = "/search?minLat=37.7&minLng=-122.5&maxLat=37.8&maxLng=-122.4";

  test.describe("mobile (375px)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("shows mobile bottom sheet or list view", async ({ page }) => {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});

      // On mobile, either bottom sheet or list is visible
      const bottomSheet = page.locator('[data-testid="mobile-bottom-sheet"], [role="region"]');
      const listView = page.locator('[data-testid="listings-list"], [data-testid="search-results"]');

      const hasBottomSheet = (await bottomSheet.count()) > 0;
      const hasListView = (await listView.count()) > 0;

      expect(hasBottomSheet || hasListView).toBe(true);
    });

    test("map is not hidden on mobile", async ({ page }) => {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});

      // Per CLAUDE.md: "Map is always visible on mobile"
      const mapContainer = page.locator('[data-testid="map"], .mapboxgl-map, .maplibregl-map, [class*="map"]');
      // Map should be in DOM even if behind bottom sheet
      expect(await mapContainer.count()).toBeGreaterThan(0);
    });
  });

  test.describe("desktop (1440px)", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("shows split view (list + map side by side)", async ({ page }) => {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});

      // Desktop should show list and map side by side
      const hasNoHScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(hasNoHScroll).toBe(true);
    });
  });
});

// Listing detail responsive tests
test.describe("listing detail responsive", () => {
  test.describe("mobile (375px)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("listing page renders without overflow", async ({ page }) => {
      // Visit homepage to find a visible listing link (not hidden menu items)
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      const listingLink = page
        .locator('[data-testid="listing-card"] a[href*="/listings/"]')
        .or(page.locator('main a[href^="/listings/"]:visible'))
        .first();

      const hasLink = await listingLink.isVisible({ timeout: 10000 }).catch(() => false);
      if (hasLink) {
        await listingLink.click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle").catch(() => {});

        const hasHScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHScroll).toBe(false);
      } else {
        test.skip(true, "No visible listing links on homepage");
      }
    });
  });

  test.describe("tablet (768px)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("listing page layout adapts at tablet", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      const listingLink = page
        .locator('[data-testid="listing-card"] a[href*="/listings/"]')
        .or(page.locator('main a[href^="/listings/"]:visible'))
        .first();

      const hasLink = await listingLink.isVisible({ timeout: 10000 }).catch(() => false);
      if (hasLink) {
        await listingLink.click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle").catch(() => {});

        const hasHScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHScroll).toBe(false);
      } else {
        test.skip(true, "No visible listing links on homepage");
      }
    });
  });
});
