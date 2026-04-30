/**
 * Visual Regression Test Helpers
 *
 * Shared utilities for screenshot-based visual regression testing.
 * Provides animation disabling, default masks, and viewport constants.
 */

import type { Page, Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Viewport Constants
// ---------------------------------------------------------------------------

export const VIEWPORTS = {
  mobileSmall: { width: 360, height: 640 },
  mobile: { width: 390, height: 844 },
  mobileLarge: { width: 390, height: 844 }, // Backwards-compatible alias
  mobileLandscape: { width: 812, height: 375 },
  tablet: { width: 768, height: 1024 },
  tabletLandscape: { width: 1024, height: 768 },
  laptop: { width: 1440, height: 900 },
  desktop: { width: 1440, height: 900 }, // Backwards-compatible alias
  desktopFullHd: { width: 1920, height: 1080 },
} as const;

// ---------------------------------------------------------------------------
// Animation Disabling
// ---------------------------------------------------------------------------

/**
 * Inject CSS to disable all animations and transitions for stable screenshots.
 * Call this before taking screenshots.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
    `,
  });
}

/**
 * Alternative: use Playwright's built-in reduced-motion emulation.
 * Lighter than CSS injection — respects prefers-reduced-motion media queries.
 */
export async function emulateReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

// ---------------------------------------------------------------------------
// Default Masks
// ---------------------------------------------------------------------------

/**
 * Get default mask locators for non-deterministic content.
 * Map tiles, user avatars, and timestamps change between runs.
 */
export function defaultMasks(page: Page): Locator[] {
  return [
    page.locator(".maplibregl-canvas"),
    page.locator(".maplibregl-map"),
    page.locator(".maplibregl-canvas"),
    page.locator(".maplibregl-map"),
  ];
}

/**
 * Get mask locators for dynamic images (avatars, listing images).
 */
export function imageMasks(page: Page): Locator[] {
  return [
    page.locator('img[src*="supabase"]'),
    page.locator('img[src*="blob:"]'),
    page.locator('img[src*="avatar"]'),
  ];
}

// ---------------------------------------------------------------------------
// Screenshot Config
// ---------------------------------------------------------------------------

/** Default screenshot options for full-page comparisons */
export const SCREENSHOT_DEFAULTS = {
  fullPage: {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
    animations: "disabled" as const,
  },
  component: {
    maxDiffPixelRatio: 0.02,
    animations: "disabled" as const,
  },
  /** More lenient for pages with user-generated images */
  withImages: {
    fullPage: true,
    maxDiffPixelRatio: 0.05,
    animations: "disabled" as const,
  },
} as const;
