/**
 * Sync Helpers - Utilities for testing map-list synchronization
 *
 * Provides functions to inspect marker and card visual states (hover, active,
 * viewport visibility) driven by ListingFocusContext. Uses page.evaluate for
 * reliable Tailwind v4 class detection rather than Playwright CSS selectors.
 */

import { Page, expect } from "@playwright/test";
import { timeouts } from "./test-utils";

// ---------------------------------------------------------------------------
// Marker State Inspection
// ---------------------------------------------------------------------------

/**
 * Get the visual state of a map marker by listing ID.
 *
 * Inspects the marker inner div (the element with data-listing-id) for classes
 * applied by Map.tsx based on ListingFocusContext state:
 * - hoveredId match: scale-[1.15] z-50
 * - activeId match: z-40
 * - other markers when one hovered: opacity-60
 * - pulsing ring child: border-zinc-900 (hover) or border-zinc-400 (active)
 */
export async function getMarkerState(
  page: Page,
  listingId: string,
): Promise<{
  isActive: boolean;
  isHovered: boolean;
  hasRing: boolean;
  isScaled: boolean;
  isDimmed: boolean;
}> {
  return page.evaluate((id) => {
    // The marker inner div carries data-listing-id
    const markers = Array.from(
      document.querySelectorAll(`[data-listing-id="${id}"]`),
    );
    // Find the one inside a .mapboxgl-marker (not the listing card)
    const markerEl = markers.find((el) => el.closest(".mapboxgl-marker"));
    if (!markerEl) {
      return {
        isActive: false,
        isHovered: false,
        hasRing: false,
        isScaled: false,
        isDimmed: false,
      };
    }

    // Use data-focus-state attribute instead of Tailwind class inspection
    const focusState = markerEl.getAttribute("data-focus-state") || "none";

    const isHovered = focusState === "hovered";
    const isActive = focusState === "active";
    const isScaled = focusState === "hovered"; // scale applied on hover
    const isDimmed = focusState === "dimmed";

    // Pulsing ring child present (appears when hovered or active)
    const ringChild = markerEl.querySelector(
      "[class*='animate-ping'], [class*='pulse-ring']",
    );
    const hasRing = ringChild !== null || isHovered || isActive;

    return { isActive, isHovered, hasRing, isScaled, isDimmed };
  }, listingId);
}

// ---------------------------------------------------------------------------
// Card State Inspection
// ---------------------------------------------------------------------------

/**
 * Get the visual state of a listing card by listing ID.
 *
 * Inspects the card wrapper element (data-testid="listing-card") for classes
 * applied by ListingCard.tsx based on ListingFocusContext:
 * - isActive: ring-2 ring-blue-500 ring-offset-2
 * - isHovered && !isActive: shadow-md ring-1 ring-blue-200
 */
export async function getCardState(
  page: Page,
  listingId: string,
): Promise<{
  isActive: boolean;
  isHovered: boolean;
  hasRing: boolean;
  isInViewport: boolean;
}> {
  return page.evaluate((id) => {
    // Directly select the listing card (not a marker element)
    const cardEl = document.querySelector(
      `[data-testid="listing-card"][data-listing-id="${id}"]`,
    );
    if (!cardEl) {
      return {
        isActive: false,
        isHovered: false,
        hasRing: false,
        isInViewport: false,
      };
    }

    // Use data-focus-state attribute instead of Tailwind class inspection
    const focusState = cardEl.getAttribute("data-focus-state") || "none";
    const isActive = focusState === "active";
    const isHovered = focusState === "hovered";
    const hasRing = isActive || isHovered;
    const rect = cardEl.getBoundingClientRect();
    const isInViewport =
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0;
    return { isActive, isHovered, hasRing, isInViewport };
  }, listingId);
}

// ---------------------------------------------------------------------------
// Viewport Visibility
// ---------------------------------------------------------------------------

/**
 * Check if a listing card is currently within the visible viewport.
 */
export async function isCardInViewport(
  page: Page,
  listingId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const card = document.querySelector(
      `[data-testid="listing-card"][data-listing-id="${id}"]`,
    );
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }, listingId);
}

// ---------------------------------------------------------------------------
// Active Listing ID
// ---------------------------------------------------------------------------

/**
 * Get the listing ID of the currently active (ring-2) card.
 * Returns null if no card has the active ring.
 */
export async function getActiveListingId(
  page: Page,
): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.querySelector(
      '[data-testid="listing-card"][data-focus-state="active"]',
    );
    return active?.getAttribute("data-listing-id") ?? null;
  });
}

/**
 * Get all listing IDs that have the hovered ring (ring-1) class.
 */
export async function getHoveredListingIds(
  page: Page,
): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        '[data-testid="listing-card"][data-focus-state="hovered"]',
      ),
    )
      .map((card) => card.getAttribute("data-listing-id"))
      .filter((id): id is string => id !== null);
  });
}

// ---------------------------------------------------------------------------
// Wait Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a specific listing card to receive the active highlight (ring-2 ring-blue-500).
 * Uses polling with Playwright's auto-retry via expect().toPass().
 */
export async function waitForCardHighlight(
  page: Page,
  listingId: string,
  timeout = timeouts.action,
): Promise<void> {
  await expect(async () => {
    const state = await getCardState(page, listingId);
    expect(state.isActive).toBe(true);
  }).toPass({ timeout });
}

/**
 * Wait for a specific listing card's highlight to clear.
 */
export async function waitForCardHighlightClear(
  page: Page,
  listingId: string,
  timeout = timeouts.action,
): Promise<void> {
  await expect(async () => {
    const state = await getCardState(page, listingId);
    expect(state.isActive).toBe(false);
  }).toPass({ timeout });
}

/**
 * Wait for a specific listing card to have the hover ring (ring-1).
 */
export async function waitForCardHover(
  page: Page,
  listingId: string,
  timeout = timeouts.action,
): Promise<void> {
  await expect(async () => {
    const state = await getCardState(page, listingId);
    expect(state.isHovered).toBe(true);
  }).toPass({ timeout });
}

/**
 * Wait for a marker to become scaled (hovered state: scale-[1.15]).
 */
export async function waitForMarkerHover(
  page: Page,
  listingId: string,
  timeout = timeouts.action,
): Promise<void> {
  await expect(async () => {
    const state = await getMarkerState(page, listingId);
    expect(state.isScaled).toBe(true);
  }).toPass({ timeout });
}

/**
 * Wait for a marker to return to normal scale (no longer hovered).
 */
export async function waitForMarkerUnhover(
  page: Page,
  listingId: string,
  timeout = timeouts.action,
): Promise<void> {
  await expect(async () => {
    const state = await getMarkerState(page, listingId);
    expect(state.isScaled).toBe(false);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// Listing ID Extraction
// ---------------------------------------------------------------------------

/**
 * Get the listing ID from a visible marker element.
 * Reads data-listing-id from the marker's inner role="button" div.
 */
export async function getMarkerListingId(
  page: Page,
  markerIndex: number,
): Promise<string | null> {
  return page.evaluate((idx) => {
    const visible = Array.from(
      document.querySelectorAll(".mapboxgl-marker"),
    ).filter((m) => {
      const rect = m.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (idx >= visible.length) return null;
    const inner = visible[idx].querySelector("[data-listing-id]");
    return inner?.getAttribute("data-listing-id") ?? null;
  }, markerIndex);
}

/**
 * Get all visible marker listing IDs.
 */
export async function getAllMarkerListingIds(
  page: Page,
): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll(".mapboxgl-marker"))
      .filter((m) => {
        const rect = m.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((m) => {
        const inner = m.querySelector("[data-listing-id]");
        return inner?.getAttribute("data-listing-id") ?? null;
      })
      .filter((id): id is string => id !== null);
  });
}

/**
 * Get all visible listing card IDs.
 */
export async function getAllCardListingIds(
  page: Page,
): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        '[data-testid="listing-card"][data-listing-id]',
      ),
    )
      .map((card) => card.getAttribute("data-listing-id"))
      .filter((id): id is string => id !== null);
  });
}

// ---------------------------------------------------------------------------
// Map / Marker Readiness
// ---------------------------------------------------------------------------

/**
 * Wait for the E2E map ref to be exposed (map loaded and ready).
 * Returns true if available, false on timeout.
 */
export async function waitForMapRef(
  page: Page,
  timeout = 30000,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => !!(window as any).__e2eMapRef,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if map canvas is visible (WebGL initialized).
 */
export async function isMapAvailable(page: Page): Promise<boolean> {
  try {
    await page.locator(".mapboxgl-canvas:visible").first().waitFor({
      state: "visible",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zoom in programmatically to expand clusters into individual markers.
 * Uses E2E hooks to avoid triggering "Search as I move" URL updates.
 */
export async function zoomToExpandClusters(
  page: Page,
): Promise<boolean> {
  // Check if individual markers are already visible
  const existingCount = await page.locator(".mapboxgl-marker:visible").count();
  if (existingCount > 0) return true;

  const hasMapRef = await waitForMapRef(page);
  if (!hasMapRef) return false;

  // Get a listing location to center on
  const listingCenter = await page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    if (map && map.getSource("listings")) {
      try {
        const features = map.querySourceFeatures("listings");
        if (features.length > 0) {
          const coords = features[0].geometry.coordinates;
          return { lng: coords[0], lat: coords[1] };
        }
      } catch {
        // ignore
      }
    }
    return null;
  });

  // Zoom to uncluster
  const zoomed = await page.evaluate(
    ({ center }) => {
      return new Promise<boolean>((resolve) => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) {
          resolve(false);
          return;
        }
        setProgrammatic(true);
        map.once("idle", () => resolve(true));
        const opts: any = { zoom: 14 };
        if (center) opts.center = [center.lng, center.lat];
        map.jumpTo(opts);
        setTimeout(() => resolve(true), 10000);
      });
    },
    { center: listingCenter },
  );

  if (!zoomed) return false;

  // Trigger marker update after tiles load
  await page.evaluate(() => {
    const updateMarkers = (window as any).__e2eUpdateMarkers;
    if (typeof updateMarkers === "function") updateMarkers();
  });

  // Poll until markers appear rather than using a fixed timeout
  try {
    await expect
      .poll(
        () => page.locator(".mapboxgl-marker:visible").count(),
        { timeout: 10_000, message: "Waiting for markers after cluster expansion" },
      )
      .toBeGreaterThan(0);
    return true;
  } catch {
    return (await page.locator(".mapboxgl-marker:visible").count()) > 0;
  }
}

/**
 * Wait for markers with automatic cluster expansion.
 */
export async function waitForMarkersWithClusterExpansion(
  page: Page,
  options?: { minCount?: number },
): Promise<number> {
  const minCount = options?.minCount ?? 1;
  let markerCount = await page.locator(".mapboxgl-marker:visible").count();

  if (markerCount < minCount) {
    await zoomToExpandClusters(page);
  }

  markerCount = await page.locator(".mapboxgl-marker:visible").count();
  return markerCount;
}

/**
 * Count the number of active (ring-2 highlighted) cards on the page.
 */
export async function countActiveCards(page: Page): Promise<number> {
  return page.evaluate(() => {
    return document.querySelectorAll(
      '[data-testid="listing-card"][data-focus-state="active"]',
    ).length;
  });
}

// ---------------------------------------------------------------------------
// Polling Wait Helpers (replacements for waitForTimeout patterns)
// ---------------------------------------------------------------------------

/**
 * Poll until visible map markers reach a minimum count.
 * Replaces `waitForTimeout(N); expect(markers.count()).toBeGreaterThan(0)`.
 */
export async function pollForMarkers(
  page: Page,
  minCount = 1,
  timeout = 15_000,
): Promise<void> {
  await expect
    .poll(
      () => page.locator(".mapboxgl-marker:visible").count(),
      { timeout, message: `Expected at least ${minCount} visible map markers` },
    )
    .toBeGreaterThanOrEqual(minCount);
}

/**
 * Poll until a URL search parameter matches the expected value.
 * Replaces `waitForTimeout(N); expect(url).toContain(key=value)`.
 */
export async function pollForUrlParam(
  page: Page,
  key: string,
  expected: string | null,
  timeout = 10_000,
): Promise<void> {
  if (expected === null) {
    await expect
      .poll(
        () => new URL(page.url(), "http://localhost").searchParams.get(key),
        { timeout, message: `Expected URL param "${key}" to be absent` },
      )
      .toBeNull();
  } else {
    await expect
      .poll(
        () => new URL(page.url(), "http://localhost").searchParams.get(key),
        { timeout, message: `Expected URL param "${key}" to be "${expected}"` },
      )
      .toBe(expected);
  }
}

/**
 * Poll until a URL search parameter is present (any value).
 * Replaces `waitForTimeout(N); expect(url).toContain(key)`.
 */
export async function pollForUrlParamPresent(
  page: Page,
  key: string,
  timeout = 10_000,
): Promise<void> {
  await expect
    .poll(
      () => new URL(page.url(), "http://localhost").searchParams.has(key),
      { timeout, message: `Expected URL param "${key}" to be present` },
    )
    .toBe(true);
}

/**
 * Poll until visible listing card count reaches a minimum.
 * Replaces `waitForTimeout(N); expect(cards.count()).toBeGreaterThan(initial)`.
 */
export async function pollForCardCount(
  page: Page,
  minCount: number,
  timeout = 15_000,
): Promise<void> {
  await expect
    .poll(
      () => page.locator('[data-testid="listing-card"]:visible').count(),
      { timeout, message: `Expected at least ${minCount} visible listing cards` },
    )
    .toBeGreaterThanOrEqual(minCount);
}
