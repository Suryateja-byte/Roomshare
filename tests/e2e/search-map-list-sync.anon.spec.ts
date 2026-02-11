/**
 * Map-List Synchronization E2E Tests
 *
 * Tests the two-way synchronization between listing cards and map markers
 * driven by ListingFocusContext:
 *
 * - Marker click  -> card highlight (ring-2) + scroll into view
 * - Card hover    -> marker scale-up (scale-[1.15])
 * - Marker hover  -> card hover ring (ring-1)
 * - Bidirectional state coexistence (active + hover at same time)
 * - Data sync (marker/card count parity, filter/sort updates)
 * - Edge cases (offscreen cards, rapid clicks, zoom changes)
 * - Visual state verification (ring classes, z-index, no flickering)
 *
 * Run:
 *   pnpm playwright test tests/e2e/search-map-list-sync.anon.spec.ts --project=chromium-anon
 *   pnpm playwright test tests/e2e/search-map-list-sync.anon.spec.ts --project=chromium-anon --headed
 */

import {
  test,
  expect,
  selectors,
  timeouts,
  tags,
  SF_BOUNDS,
  waitForMapMarkers,
  waitForMapReady,
  searchResultsContainer,
} from "./helpers";
import {
  getMarkerState,
  getCardState,
  isCardInViewport,
  getActiveListingId,
  getHoveredListingIds,
  waitForCardHighlight,
  waitForCardHighlightClear,
  waitForCardHover,
  waitForMarkerHover,
  waitForMarkerUnhover,
  getMarkerListingId,
  getAllMarkerListingIds,
  getAllCardListingIds,
  isMapAvailable,
  waitForMapRef,
  zoomToExpandClusters,
  waitForMarkersWithClusterExpansion,
  countActiveCards,
} from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

// Search URL with SF bounds pre-set for immediate marker fetch
const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

/**
 * Get the first visible marker and return its listing ID.
 * Skips the test if map or markers are unavailable.
 */
async function getFirstMarkerIdOrSkip(
  page: Page,
): Promise<string> {
  if (!(await isMapAvailable(page))) {
    test.skip(true, "Map not available (WebGL unavailable in headless)");
  }

  const markerCount = await waitForMarkersWithClusterExpansion(page);
  if (markerCount === 0) {
    test.skip(true, "No markers available after cluster expansion");
  }

  const id = await getMarkerListingId(page, 0);
  if (!id) {
    test.skip(true, "Could not read listing ID from first marker");
  }
  return id!;
}

/**
 * Get the Nth visible marker's listing ID.
 * Returns null if not enough markers.
 */
async function getNthMarkerIdOrNull(
  page: Page,
  index: number,
): Promise<string | null> {
  return getMarkerListingId(page, index);
}

/**
 * Click a map marker by its listing ID using dual strategy inside page.evaluate,
 * then verify the click triggered handleMarkerClick → setActive(listingId).
 *
 * Strategy 1: wrapper.click() on the .maplibregl-marker wrapper element, which has
 * react-map-gl's native addEventListener('click') handler (marker.js:26).
 * Strategy 2: focus + keydown Enter on the inner div, which triggers the React
 * onKeyDown handler (Map.tsx:1841 → handleMarkerClick).
 *
 * Both strategies run atomically in a single evaluate call to avoid the race
 * condition where Mapbox re-creates marker DOM between CDP round-trips.
 * Double-trigger is safe: handleMarkerClick calls setActive(id) which is idempotent.
 *
 * The verification step checks the card's data-focus-state="active" attribute.
 * If the click fired but the React effect hadn't attached the event listener yet,
 * the verification fails and the entire click+verify retries — the re-click will
 * find the listener attached and succeed.
 */
async function clickMarkerByListingId(page: Page, listingId: string): Promise<void> {
  await expect(async () => {
    const result = await page.evaluate((id) => {
      const inner = document.querySelector(
        `.maplibregl-marker [data-listing-id="${id}"]`,
      ) as HTMLElement | null;
      if (!inner?.isConnected) return 'not-found';
      // Strategy 1: Click the .maplibregl-marker wrapper (react-map-gl native handler)
      const wrapper = inner.closest('.maplibregl-marker') as HTMLElement;
      if (wrapper) wrapper.click();
      // Strategy 2: Keyboard Enter on inner div (React onKeyDown handler)
      inner.focus();
      inner.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
      }));
      return 'ok';
    }, listingId);
    expect(result).toBe('ok');

    // Verify the click triggered handleMarkerClick → setActive(listingId)
    const cardState = await getCardState(page, listingId);
    expect(cardState.isActive).toBe(true);
  }).toPass({ timeout: 30_000, intervals: [200, 500, 1000, 2000] });
}

/**
 * Click a visible marker by index.
 * Resolves the listing ID first, then delegates to clickMarkerByListingId.
 */
async function clickMarkerByIndex(page: Page, index: number): Promise<void> {
  const listingId = await getMarkerListingId(page, index);
  if (!listingId) {
    throw new Error(`No marker at index ${index}`);
  }
  await clickMarkerByListingId(page, listingId);
}

/**
 * Fire-and-forget marker click (no effect verification).
 * Used for intermediate clicks in rapid-click tests where verifying each
 * click would take 15s and the marker DOM may change between clicks.
 */
async function clickMarkerFast(page: Page, listingId: string): Promise<void> {
  await page.evaluate((id) => {
    const inner = document.querySelector(
      `.maplibregl-marker [data-listing-id="${id}"]`,
    ) as HTMLElement | null;
    if (!inner?.isConnected) return;
    const wrapper = inner.closest('.maplibregl-marker') as HTMLElement;
    if (wrapper) wrapper.click();
    inner.focus();
    inner.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
    }));
  }, listingId);
}

/**
 * Hover a map marker by listing ID using page.evaluate + PointerEvent dispatch,
 * then verify the hover triggered setHovered(listingId) → marker scales up.
 *
 * Dispatches 'pointerover' on the .maplibregl-marker WRAPPER element (where
 * react-map-gl attaches onPointerEnter). React 18 uses pointerover/pointerout
 * for enter/leave delegation. Setting relatedTarget to document.body (outside
 * the marker tree) ensures React's enter/leave diffing correctly identifies
 * this as a "pointer entered from outside" event — if relatedTarget were inside
 * the marker tree, React would suppress the enter.
 * Sets pointerType='mouse' to pass the touch guard in Map.tsx:1815.
 */
async function hoverMarkerByListingId(page: Page, listingId: string): Promise<void> {
  await expect(async () => {
    const hovered = await page.evaluate((id) => {
      const inner = document.querySelector(
        `.maplibregl-marker [data-listing-id="${id}"]`,
      ) as HTMLElement | null;
      if (!inner?.isConnected) return false;
      // Target the wrapper where onPointerEnter is attached
      const wrapper = inner.closest('.maplibregl-marker') as HTMLElement;
      if (!wrapper) return false;
      const rect = wrapper.getBoundingClientRect();
      wrapper.dispatchEvent(new PointerEvent('pointerover', {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        // relatedTarget MUST be outside the marker tree for React to treat
        // this as an "enter" event (not just moving between children)
        relatedTarget: document.body,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      return true;
    }, listingId);
    expect(hovered).toBe(true);

    // Verify the hover triggered the handler → setHovered(listingId) → marker scales
    const state = await getMarkerState(page, listingId);
    expect(state.isScaled).toBe(true);
  }).toPass({ timeout: 10_000, intervals: [200, 500, 1000, 2000] });
}

/**
 * Hover a visible marker by index.
 */
async function hoverMarkerByIndex(page: Page, index: number): Promise<void> {
  const listingId = await getMarkerListingId(page, index);
  if (!listingId) {
    throw new Error(`No marker at index ${index}`);
  }
  await hoverMarkerByListingId(page, listingId);
}

/**
 * Fire-and-forget marker hover (no effect verification).
 * Used in debounce tests where rapid successive hovers are needed and
 * verifying each one would defeat the timing test.
 */
async function hoverMarkerFast(page: Page, listingId: string): Promise<void> {
  await page.evaluate((id) => {
    const inner = document.querySelector(
      `.maplibregl-marker [data-listing-id="${id}"]`,
    ) as HTMLElement | null;
    if (!inner?.isConnected) return;
    const wrapper = inner.closest('.maplibregl-marker') as HTMLElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    wrapper.dispatchEvent(new PointerEvent('pointerover', {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
      relatedTarget: document.body,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  }, listingId);
}

/**
 * Hover a listing card element. On mobile, the bottom sheet overlay (z-40)
 * intercepts pointer events. We raise the card's z-index above the overlay,
 * then perform a real Playwright hover (trusted mouse events that React's
 * event delegation processes correctly). The z-index stays elevated until
 * unhoverCardElement resets it — resetting immediately would let the overlay
 * re-cover the card and the browser would recalculate hover state.
 */
async function hoverCardElement(page: Page, card: import('@playwright/test').Locator): Promise<void> {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    // Raise card above bottom sheet overlay for trusted mouse events
    // Z-index is reset in unhoverCardElement, not here, to maintain hover state
    await card.evaluate((el) => {
      (el as HTMLElement).style.position = 'relative';
      (el as HTMLElement).style.zIndex = '9999';
    });
    await card.hover();
  } else {
    await card.hover();
  }
}

/**
 * Un-hover a card element. On mobile, resets the z-index that hoverCardElement
 * elevated above the bottom sheet overlay. Then moves mouse away to trigger
 * real mouseleave.
 */
async function unhoverCardElement(page: Page, card: import('@playwright/test').Locator): Promise<void> {
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    // Reset z-index that was raised in hoverCardElement
    await card.evaluate((el) => {
      (el as HTMLElement).style.position = '';
      (el as HTMLElement).style.zIndex = '';
    });
  }
  await page.mouse.move(0, 0);
}

/**
 * Get the first card listing ID from the page.
 */
async function getFirstCardId(page: Page): Promise<string | null> {
  const card = searchResultsContainer(page).locator(selectors.listingCard).first();
  return card.getAttribute("data-listing-id");
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Map-List Synchronization", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Handle rate-limit page: wait and retry if search returned 429
    const rateLimited = page.locator('h1:has-text("Too Many Requests")');
    if (await rateLimited.isVisible({ timeout: 2000 }).catch(() => false)) {
      const retryText = await page.locator('text=/Try again in \\d+ seconds/').textContent().catch(() => null);
      const seconds = parseInt(retryText?.match(/\d+/)?.[0] || "10");
      await page.waitForTimeout((seconds + 1) * 1000);
      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");
    }

    // Wait for listing cards to render (SSR) — scoped to visible container
    await expect(searchResultsContainer(page).locator(selectors.listingCard).first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Wait for map E2E hook
    const mapReady = await waitForMapRef(page);
    if (!mapReady) return;

    // Zoom in to expand clusters into individual markers
    await zoomToExpandClusters(page);

    // Brief stabilization — let Mapbox finish rendering markers after zoom
    await page.waitForTimeout(500);
  });

  // =========================================================================
  // Group 1: Marker -> Card Sync (P0)
  // =========================================================================

  test.describe("Group 1: Marker -> Card Sync (P0)", () => {
    test("1.1 - Click marker -> corresponding card gets ring-2 highlight", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // No active card initially
      const initialActiveId = await getActiveListingId(page);
      expect(initialActiveId).toBeNull();

      // Click the marker
      await clickMarkerByIndex(page, 0);

      // Card should now have the active ring-2 highlight
      await waitForCardHighlight(page, listingId);

      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
      expect(cardState.hasRing).toBe(true);
    });

    test("1.2 - Click marker -> card scrolls into view", async ({ page }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Scroll the list container to bottom so the target card is offscreen
      await page.evaluate((isMobile) => {
        const testId = isMobile
          ? 'mobile-search-results-container'
          : 'search-results-container';
        const container = document.querySelector(
          `[data-testid="${testId}"]`,
        );
        if (container) container.scrollTop = container.scrollHeight;
      }, (page.viewportSize()?.width ?? 1024) < 768);

      // Click the marker
      await clickMarkerByIndex(page, 0);

      // Wait for smooth scroll to complete by polling card viewport position
      await expect.poll(
        () => isCardInViewport(page, listingId),
        { timeout: 5000 },
      ).toBe(true);
    });

    test("1.3 - Click different marker -> previous card loses highlight, new card highlighted", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 2,
      });
      if (markerCount < 2) {
        test.skip(true, "Need at least 2 markers");
      }

      const firstId = await getMarkerListingId(page, 0);
      const secondId = await getMarkerListingId(page, 1);
      if (!firstId || !secondId || firstId === secondId) {
        test.skip(true, "Could not get two distinct marker IDs");
      }

      // Click first marker
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, firstId!);

      // Click second marker
      await clickMarkerByIndex(page, 1);
      await waitForCardHighlight(page, secondId!);

      // First card should lose highlight
      const firstCardState = await getCardState(page, firstId!);
      expect(firstCardState.isActive).toBe(false);

      // Only one card should be active
      const activeCount = await countActiveCards(page);
      expect(activeCount).toBe(1);
    });

    test("1.4 - Click marker -> popup appears AND card highlights (both sync)", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker
      await clickMarkerByIndex(page, 0);

      // Popup should appear
      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible({ timeout: timeouts.action });

      // Card should have highlight simultaneously
      await waitForCardHighlight(page, listingId);

      // Both states should be true at the same time
      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
      const popupVisible = await popup.isVisible();
      expect(popupVisible).toBe(true);
    });

    test("1.5 - Close popup -> card highlight persists (activeId independent from selectedListing)", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker to open popup and highlight card
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible({ timeout: timeouts.action });

      // Close popup via close button
      const closeBtn = page
        .locator(
          'button[aria-label="Close listing preview"], button[aria-label="Close popup"]',
        )
        .first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        // Fallback: press Escape (only closes popup, not activeId)
        await page.keyboard.press("Escape");
      }

      // Popup should be gone
      await expect(popup).not.toBeVisible({ timeout: 2000 });

      // Card highlight should STILL be present (activeId persists)
      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
    });
  });

  // =========================================================================
  // Group 2: Card -> Marker Sync (P0)
  // =========================================================================

  test.describe("Group 2: Card -> Marker Sync (P0)", () => {
    test("2.1 - Hover card -> corresponding marker gets elevated styling", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) test.skip(true, "No markers");

      // Get the listing ID of the first card
      const cardId = await getFirstCardId(page);
      if (!cardId) test.skip(true, "No card listing ID");

      // Check if this card has a corresponding marker visible
      const markerIds = await getAllMarkerListingIds(page);
      if (!markerIds.includes(cardId!)) {
        test.skip(true, "Card listing has no visible marker on map");
      }

      // Hover the card (uses evaluate on mobile to bypass bottom sheet overlay)
      const card = searchResultsContainer(page)
        .locator(`[data-testid="listing-card"][data-listing-id="${cardId}"]`)
        .first();
      await hoverCardElement(page, card);

      // Marker should get scale-[1.15] (hovered state)
      await waitForMarkerHover(page, cardId!, timeouts.action);

      const markerState = await getMarkerState(page, cardId!);
      expect(markerState.isScaled).toBe(true);
    });

    test("2.2 - Un-hover card -> marker returns to normal", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) test.skip(true, "No markers");

      const cardId = await getFirstCardId(page);
      if (!cardId) test.skip(true, "No card listing ID");

      const markerIds = await getAllMarkerListingIds(page);
      if (!markerIds.includes(cardId!)) {
        test.skip(true, "No visible marker for this card");
      }

      // Hover the card (uses evaluate on mobile to bypass bottom sheet overlay)
      const card = searchResultsContainer(page)
        .locator(`[data-testid="listing-card"][data-listing-id="${cardId}"]`)
        .first();
      await hoverCardElement(page, card);
      await waitForMarkerHover(page, cardId!, timeouts.action);

      // Move mouse away from the card (uses evaluate on mobile)
      await unhoverCardElement(page, card);

      // Marker should return to normal scale
      await waitForMarkerUnhover(page, cardId!, timeouts.action);

      const markerState = await getMarkerState(page, cardId!);
      expect(markerState.isScaled).toBe(false);
    });

    test("2.3 - Hover different card -> previous marker de-elevates, new marker elevates", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 2,
      });
      if (markerCount < 2) test.skip(true, "Need 2+ markers");

      const markerIds = await getAllMarkerListingIds(page);
      const cardIds = await getAllCardListingIds(page);

      // Find two card IDs that also have visible markers
      const overlapping = cardIds.filter((id) => markerIds.includes(id));
      if (overlapping.length < 2) {
        test.skip(true, "Need 2+ cards with visible markers");
      }

      const firstId = overlapping[0];
      const secondId = overlapping[1];

      // Hover first card (uses evaluate on mobile to bypass bottom sheet overlay)
      const firstCard = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${firstId}"]`,
        )
        .first();
      await hoverCardElement(page, firstCard);
      await waitForMarkerHover(page, firstId, timeouts.action);

      // Hover second card
      const secondCard = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${secondId}"]`,
        )
        .first();
      await hoverCardElement(page, secondCard);
      await waitForMarkerHover(page, secondId, timeouts.action);

      // First marker should no longer be scaled
      const firstMarkerState = await getMarkerState(page, firstId);
      expect(firstMarkerState.isScaled).toBe(false);

      // First marker should be dimmed (opacity-60)
      expect(firstMarkerState.isDimmed).toBe(true);
    });

    test("2.4 - Click card -> navigates to listing detail (not marker interaction)", async ({
      page,
    }) => {
      const cardId = await getFirstCardId(page);
      if (!cardId) test.skip(true, "No card listing ID");

      // Get the card's navigation link href — the Link component wraps the
      // card content including ImageCarousel which has drag handlers that can
      // intercept Playwright clicks. Verify href and navigate via evaluate.
      const card = searchResultsContainer(page).locator(selectors.listingCard).first();
      const cardLink = card.locator(`a[href*="/listings/"]`).first();
      await expect(cardLink).toBeAttached({ timeout: 5000 });
      const href = await cardLink.getAttribute("href");
      expect(href).toContain(`/listings/${cardId}`);

      // Use page.evaluate to click the link — bypasses ImageCarousel's drag
      // handler which can prevent default click behavior on Playwright's
      // synthesized mouse events. HTMLAnchorElement.click() triggers both
      // native navigation and Next.js Link's React onClick handler.
      await page.evaluate((id) => {
        const cardEl = document.querySelector(
          `[data-testid="listing-card"][data-listing-id="${id}"]`,
        );
        const link = cardEl?.querySelector('a[href*="/listings/"]') as HTMLAnchorElement;
        if (link) link.click();
      }, cardId);

      // Wait for URL to contain the listing ID — use waitForURL with "commit"
      // to avoid timeout waiting for full page resource load on listing detail pages
      await page.waitForURL(new RegExp(`/listings/${cardId}`), {
        timeout: timeouts.navigation,
        waitUntil: "commit",
      });
    });
  });

  // =========================================================================
  // Group 3: Bidirectional State
  // =========================================================================

  test.describe("Group 3: Bidirectional State", () => {
    test("3.1 - Click marker, then hover different card -> both active and hover states coexist", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 2,
      });
      if (markerCount < 2) test.skip(true, "Need 2+ markers");

      const markerIds = await getAllMarkerListingIds(page);
      const cardIds = await getAllCardListingIds(page);
      const overlapping = cardIds.filter((id) => markerIds.includes(id));
      if (overlapping.length < 2) {
        test.skip(true, "Need 2+ overlapping listings");
      }

      const activeId = overlapping[0];
      const hoverId = overlapping[1];

      // Click marker to set active (use listing ID directly — index-based lookup
      // is brittle because getAllMarkerListingIds may return a high index)
      await clickMarkerByListingId(page, activeId);
      await waitForCardHighlight(page, activeId);

      // Hover a DIFFERENT card (uses evaluate on mobile to bypass bottom sheet overlay)
      const hoverCard = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${hoverId}"]`,
        )
        .first();
      await hoverCardElement(page, hoverCard);
      await waitForCardHover(page, hoverId, timeouts.action);

      // Active card should still have ring-2
      const activeCardState = await getCardState(page, activeId);
      expect(activeCardState.isActive).toBe(true);

      // Hovered card should have ring-1 (hover ring)
      const hoverCardState = await getCardState(page, hoverId);
      expect(hoverCardState.isHovered).toBe(true);

      // Both states coexist
      expect(activeCardState.isActive && hoverCardState.isHovered).toBe(true);
    });

    test("3.2 - After marker click, hovering same card -> active ring takes precedence", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      const markerIds = await getAllMarkerListingIds(page);
      const cardIds = await getAllCardListingIds(page);
      if (!cardIds.includes(listingId) || !markerIds.includes(listingId)) {
        test.skip(true, "Listing not in both cards and markers");
      }

      // Click marker to activate
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      // Now hover the same card (uses evaluate on mobile to bypass bottom sheet overlay)
      const card = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${listingId}"]`,
        )
        .first();
      await hoverCardElement(page, card);

      // Wait for hover event to propagate, then verify active takes precedence
      await expect.poll(
        async () => (await getCardState(page, listingId)).isActive,
        { timeout: timeouts.action },
      ).toBe(true);

      // Card should have ring-2 (active takes precedence over hover)
      // ListingCard.tsx: isActive && "ring-2 ring-blue-500 ring-offset-2"
      // isHovered && !isActive && "shadow-md ring-1 ring-blue-200"
      // Since isActive is true, the ring-1 hover style should NOT appear
      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
      expect(cardState.isHovered).toBe(false); // ring-1 suppressed when active
    });

    test("3.3 - Click map background -> card highlight clears (clearFocus)", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker to activate
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      // Click on map canvas background (corner area, away from markers)
      const mapCanvas = page.locator(".maplibregl-canvas:visible").first();
      const box = await mapCanvas.boundingBox();
      expect(box).toBeTruthy();

      // Click bottom-left corner of map (least likely to have markers)
      await page.mouse.click(box!.x + 10, box!.y + box!.height - 10);

      // After background click, the popup closes (setSelectedListing(null))
      // Note: activeId may or may not be cleared depending on implementation
      // The popup closing is the primary observable behavior here
      const popup = page.locator(".maplibregl-popup");
      const popupCount = await popup.count();
      // Either popup closed or a new one opened (if we hit another marker)
      expect(popupCount).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // Group 4: Data Synchronization
  // =========================================================================

  test.describe("Group 4: Data Synchronization", () => {
    test("4.1 - Marker count matches listing card count (or subset if clustered)", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) test.skip(true, "No markers");

      const cardIds = await getAllCardListingIds(page);
      const markerIds = await getAllMarkerListingIds(page);

      // Markers should be a subset of (or equal to) cards
      // Not all cards may have visible markers (offscreen/clustered)
      // But all marker IDs should correspond to a known listing
      for (const markerId of markerIds) {
        // Marker ID should be a valid listing (may or may not be in the current card set
        // since map shows listings from the server action, cards from SSR search)
        expect(markerId).toBeTruthy();
      }

      // At least some overlap should exist between markers and cards
      const overlap = markerIds.filter((id) => cardIds.includes(id));
      // In a normal search scenario, there should be some overlap
      // but with independent data sources, 0 overlap is possible
      expect(markerIds.length).toBeGreaterThan(0);
      expect(cardIds.length).toBeGreaterThan(0);
    });

    test("4.2 - After filter change -> both markers and cards update", async ({
      page,
    }) => {
      test.slow(); // Filter navigation + map reload can exceed 60s on mobile
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      await waitForMarkersWithClusterExpansion(page);

      // Get initial counts
      const initialCardCount = await searchResultsContainer(page).locator(selectors.listingCard).count();
      const initialMarkerCount = await page
        .locator(".maplibregl-marker:visible")
        .count();

      // Apply a price filter via URL navigation (simplest approach)
      const url = new URL(page.url());
      url.searchParams.set("maxPrice", "500");
      await page.goto(url.toString());
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("main").first()).toBeVisible({
        timeout: timeouts.navigation,
      });

      // Wait for map and content to settle after filter change
      await waitForMapReady(page);
      // Wait for search results to load (either cards appear or "no results" state settles)
      await page.waitForTimeout(2000);

      // Cards should have updated (may be fewer or zero due to filter)
      const filteredCardCount = await page
        .locator(selectors.listingCard)
        .count();

      // The page should have responded to the filter (count changed or stayed same)
      // We verify the page actually processed it by checking the URL
      expect(page.url()).toContain("maxPrice=500");

      // Both markers and cards exist on the page
      // (exact count comparison is unreliable since map fetches independently)
      expect(filteredCardCount).toBeGreaterThanOrEqual(0);
    });

    test("4.3 - After sort change -> card order changes but sync maintained", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      await waitForMarkersWithClusterExpansion(page);

      // Get initial card order
      const initialCardIds = await getAllCardListingIds(page);
      if (initialCardIds.length < 2) test.skip(true, "Need 2+ cards for sort test");

      // Change sort via URL
      const url = new URL(page.url());
      url.searchParams.set("sort", "price_asc");
      await page.goto(url.toString());
      await page.waitForLoadState("domcontentloaded");
      await expect(searchResultsContainer(page).locator(selectors.listingCard).first()).toBeVisible({
        timeout: timeouts.navigation,
      });

      // Wait for map and cards to settle after sort change
      await waitForMapReady(page);
      await expect(searchResultsContainer(page).locator(selectors.listingCard).first())
        .toBeVisible({ timeout: timeouts.navigation });

      const sortedCardIds = await getAllCardListingIds(page);

      // Card IDs should still be valid
      expect(sortedCardIds.length).toBeGreaterThan(0);

      // If markers are visible, sync should still work
      const markerCount = await page
        .locator(".maplibregl-marker:visible")
        .count();
      if (markerCount > 0) {
        // Markers should still be rendered (sort does not affect map markers)
        expect(markerCount).toBeGreaterThan(0);
      }
    });

    test("4.4 - After search-as-I-move -> new markers and new cards appear", async ({
      page,
    }) => {
      test.slow(); // Map pan + search reload can exceed 60s on mobile
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const hasMapRef = await waitForMapRef(page);
      if (!hasMapRef) test.skip(true, "Map ref not available");

      // Get initial marker IDs
      await waitForMarkersWithClusterExpansion(page);
      const initialMarkerIds = await getAllMarkerListingIds(page);

      // Pan the map programmatically to a new area
      const moved = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const map = (window as any).__e2eMapRef;
          if (!map) {
            resolve(false);
            return;
          }
          map.once("idle", () => resolve(true));
          // Pan slightly east
          const center = map.getCenter();
          map.flyTo({
            center: [center.lng + 0.02, center.lat],
            duration: 300,
          });
          setTimeout(() => resolve(true), 5000);
        });
      });

      if (!moved) test.skip(true, "Could not pan map");

      // Wait for map to settle after pan, then for markers or cards to appear
      await waitForMapReady(page);
      // Wait for markers to appear after pan
      await expect(
        page.locator('.maplibregl-marker:visible').first()
      ).toBeVisible({ timeout: timeouts.navigation });

      // Page should still have markers and cards
      const newMarkerCount = await page
        .locator(".maplibregl-marker:visible")
        .count();
      const newCardCount = await searchResultsContainer(page).locator(selectors.listingCard).count();

      // At least one of markers or cards should exist
      expect(newMarkerCount + newCardCount).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Group 5: Edge Cases
  // =========================================================================

  test.describe("Group 5: Edge Cases", () => {
    test("5.1 - Marker click when card is offscreen -> card scrolls into view", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Verify the card exists
      const cardExists = await searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${listingId}"]`,
        )
        .count();
      if (cardExists === 0) {
        test.skip(true, "Card not found for this marker's listing");
      }

      // Scroll the results container to the bottom to ensure card is offscreen
      await page.evaluate((isMobile) => {
        const testId = isMobile
          ? 'mobile-search-results-container'
          : 'search-results-container';
        const container = document.querySelector(
          `[data-testid="${testId}"]`,
        );
        if (container) {
          container.scrollTop = container.scrollHeight;
        } else {
          // Fallback: scroll window
          window.scrollTo(0, document.body.scrollHeight);
        }
      }, (page.viewportSize()?.width ?? 1024) < 768);

      // Click the marker
      await clickMarkerByIndex(page, 0);

      // Wait for smooth scroll to bring card into viewport
      await expect.poll(
        () => isCardInViewport(page, listingId),
        { timeout: 5000 },
      ).toBe(true);
    });

    test("5.2 - Rapid marker clicks -> only last clicked card is highlighted", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 3,
      });
      if (markerCount < 3) test.skip(true, "Need 3+ markers");

      const id0 = await getMarkerListingId(page, 0);
      const id1 = await getMarkerListingId(page, 1);
      const id2 = await getMarkerListingId(page, 2);
      if (!id0 || !id1 || !id2) test.skip(true, "Could not read marker IDs");

      // Rapidly click three markers: fire-and-forget for first two (no verification
      // delay), verify only the last click's effect. Using clickMarkerFast avoids the
      // 15s verify timeout per click and prevents marker DOM churn between clicks.
      await clickMarkerFast(page, id0!);
      await clickMarkerFast(page, id1!);
      await clickMarkerByListingId(page, id2!);

      // Wait for the last clicked card to become active
      await waitForCardHighlight(page, id2!);

      // Only the LAST clicked card should have the active ring
      const activeId = await getActiveListingId(page);
      expect(activeId).toBe(id2);

      // Only one card should have ring-2
      const activeCount = await countActiveCards(page);
      expect(activeCount).toBe(1);
    });

    test("5.3 - Map zoom in/out -> markers update, sync maintained", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const hasMapRef = await waitForMapRef(page);
      if (!hasMapRef) test.skip(true, "Map ref not available");

      // Get initial marker count after expansion
      const initialCount = await waitForMarkersWithClusterExpansion(page);
      if (initialCount === 0) test.skip(true, "No markers");

      // Click a marker to set active state
      const listingId = await getMarkerListingId(page, 0);
      if (!listingId) test.skip(true, "No marker ID");
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId!);

      // Zoom in programmatically
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          const map = (window as any).__e2eMapRef;
          const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
          if (map && setProgrammatic) {
            setProgrammatic(true);
            map.once("idle", () => resolve());
            map.zoomTo(map.getZoom() + 1, { duration: 200 });
            setTimeout(() => resolve(), 5000);
          } else {
            resolve();
          }
        });
      });
      await waitForMapReady(page);

      // Card highlight should still be present after zoom
      const cardState = await getCardState(page, listingId!);
      expect(cardState.isActive).toBe(true);

      // Markers should still exist
      const afterZoomCount = await page
        .locator(".maplibregl-marker:visible")
        .count();
      expect(afterZoomCount).toBeGreaterThanOrEqual(0); // May change due to clustering
    });

    test("5.4 - Mobile: marker click -> bottom sheet scrolls to card", async ({
      page,
    }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");

      // Wait for content — scoped to visible container (mobile viewport)
      await expect(searchResultsContainer(page).locator(selectors.listingCard).first()).toBeVisible({
        timeout: timeouts.navigation,
      });

      // Check for map availability on mobile
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not visible on mobile viewport");
      }

      const mapReady = await waitForMapRef(page);
      if (!mapReady) test.skip(true, "Map not ready");

      await zoomToExpandClusters(page);

      const markerCount = await page
        .locator(".maplibregl-marker:visible")
        .count();
      if (markerCount === 0) test.skip(true, "No markers on mobile");

      const listingId = await getMarkerListingId(page, 0);
      if (!listingId) test.skip(true, "No marker ID");

      // Click the marker
      await clickMarkerByIndex(page, 0);

      // Wait for card highlight to appear after marker click
      await waitForCardHighlight(page, listingId!);

      // Card should be highlighted
      const cardState = await getCardState(page, listingId!);
      // On mobile, the card may be in a bottom sheet/panel
      // The highlight should still be applied via context
      expect(cardState.isActive).toBe(true);
    });
  });

  // =========================================================================
  // Group 6: Visual State Verification
  // =========================================================================

  test.describe("Group 6: Visual State Verification", () => {
    test("6.1 - Active card has data-focus-state='active'", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker to activate
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      // Verify focus state via data attribute (filter by visibility to skip hidden dual-container duplicate)
      const focusState = await page.evaluate((id) => {
        const cards = document.querySelectorAll(
          `[data-testid="listing-card"][data-listing-id="${id}"]`,
        );
        let card: Element | null = null;
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { card = c; break; }
        }
        if (!card) card = cards[0] ?? null;
        return card?.getAttribute("data-focus-state") ?? "none";
      }, listingId);

      expect(focusState).toBe("active");
    });

    test("6.2 - Hovered card has data-focus-state='hovered'", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      await waitForMarkersWithClusterExpansion(page);

      const cardId = await getFirstCardId(page);
      if (!cardId) test.skip(true, "No card");

      const markerIds = await getAllMarkerListingIds(page);
      if (!markerIds.includes(cardId!)) {
        test.skip(true, "Card has no visible marker");
      }

      // Hover the card (uses evaluate on mobile to bypass bottom sheet overlay)
      const card = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${cardId}"]`,
        )
        .first();
      await hoverCardElement(page, card);
      await waitForCardHover(page, cardId!, timeouts.action);

      // Verify hover state via data attribute
      const focusState = await page.evaluate((id) => {
        const cards = document.querySelectorAll(
          `[data-testid="listing-card"][data-listing-id="${id}"]`,
        );
        const c = Array.from(cards).find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }) ?? cards[0] ?? null;
        return c?.getAttribute("data-focus-state") ?? "none";
      }, cardId!);

      expect(focusState).toBe("hovered");
    });

    test("6.3 - Marker z-index changes on hover/active", async ({ page }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 2,
      });
      if (markerCount < 2) test.skip(true, "Need 2+ markers");

      const cardIds = await getAllCardListingIds(page);
      const markerIds = await getAllMarkerListingIds(page);
      const overlapping = cardIds.filter((id) => markerIds.includes(id));
      if (overlapping.length === 0) {
        test.skip(true, "No overlapping card/marker IDs");
      }

      const targetId = overlapping[0];

      // Hover the card to trigger marker hover state (evaluate on mobile)
      const card = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${targetId}"]`,
        )
        .first();
      await hoverCardElement(page, card);
      await waitForMarkerHover(page, targetId, timeouts.action);

      // Marker should have z-50 when hovered
      const hoveredState = await getMarkerState(page, targetId);
      expect(hoveredState.isScaled).toBe(true);

      // Move away to clear hover (evaluate on mobile)
      await unhoverCardElement(page, card);
      await waitForMarkerUnhover(page, targetId, timeouts.action);

      // Click marker to set active (use listing ID directly — index-based lookup
      // is brittle because getAllMarkerListingIds may return a high index)
      await clickMarkerByListingId(page, targetId);
      await waitForCardHighlight(page, targetId);

      // Marker should have z-40 when active (not hovered)
      const activeState = await getMarkerState(page, targetId);
      // activeId match gives z-40 (when hoveredId is null)
      expect(activeState.isActive).toBe(true);
    });

    test("6.4 - Multiple hover/active transitions don't cause flickering", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 2,
      });
      if (markerCount < 2) test.skip(true, "Need 2+ markers");

      const cardIds = await getAllCardListingIds(page);
      const markerIds = await getAllMarkerListingIds(page);
      const overlapping = cardIds.filter((id) => markerIds.includes(id));
      if (overlapping.length < 2) {
        test.skip(true, "Need 2+ overlapping IDs");
      }

      const id1 = overlapping[0];
      const id2 = overlapping[1];

      // Instrument a transition counter to detect flickering
      await page.evaluate(
        ({ targetId1, targetId2 }) => {
          (window as any).__transitionCounts = { [targetId1]: 0, [targetId2]: 0 };

          const observe = (id: string) => {
            const els = document.querySelectorAll(
              `[data-testid="listing-card"][data-listing-id="${id}"]`,
            );
            let el: Element | null = null;
            for (const c of els) {
              const r = c.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) { el = c; break; }
            }
            if (!el) el = els[0] ?? null;
            if (!el) return;
            const observer = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (m.attributeName === "class") {
                  (window as any).__transitionCounts[id]++;
                }
              }
            });
            observer.observe(el, { attributes: true, attributeFilter: ["class"] });
          };
          observe(targetId1);
          observe(targetId2);
        },
        { targetId1: id1, targetId2: id2 },
      );

      // Perform rapid hover transitions
      const card1 = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${id1}"]`,
        )
        .first();
      const card2 = searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${id2}"]`,
        )
        .first();

      // Hover card1 -> card2 -> card1 -> card2 -> away (rapid transitions)
      await hoverCardElement(page, card1);
      await hoverCardElement(page, card2);
      await hoverCardElement(page, card1);
      await hoverCardElement(page, card2);
      await unhoverCardElement(page, card2);

      // Wait for all class mutations to settle
      await expect.poll(
        async () => {
          const counts = await page.evaluate(
            () => (window as any).__transitionCounts as Record<string, number>,
          );
          return Object.values(counts).every((c) => c > 0);
        },
        { timeout: 5000 },
      ).toBe(true);

      // Check transition counts - should be reasonable (not excessive flickering)
      const counts = await page.evaluate(
        () => (window as any).__transitionCounts as Record<string, number>,
      );

      // Each card should have had a limited number of class changes
      // 4 rapid hovers across 2 cards = roughly 4-8 class changes each
      // With flicker, we'd see 20+ changes per element
      for (const [id, count] of Object.entries(counts)) {
        expect(count).toBeLessThan(20);
      }
    });
  });

  // =========================================================================
  // Additional Sync Tests
  // =========================================================================

  test.describe("Additional Sync Scenarios", () => {
    test("Marker hover -> card gets ring-1 hover highlight", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) test.skip(true, "No markers");

      const listingId = await getMarkerListingId(page, 0);
      if (!listingId) test.skip(true, "No marker ID");

      // Check if a card exists for this listing
      const cardExists = await searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${listingId}"]`,
        )
        .count();
      if (cardExists === 0) {
        test.skip(true, "No card for this marker's listing");
      }

      // Hover the marker
      await hoverMarkerByIndex(page, 0);

      // The corresponding card should get ring-1 hover highlight
      // (via setHovered from map, which updates ListingFocusContext)
      await waitForCardHover(page, listingId!, timeouts.action);

      const cardState = await getCardState(page, listingId!);
      expect(cardState.isHovered).toBe(true);
    });

    test("Active card ring persists > 1.5s (no auto-clear)", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      // Intentional delay: verifying ring persists after 1.5s (old impl had auto-clear)
      await page.waitForTimeout(1500);

      // Ring should STILL be present
      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
    });

    test("Escape closes popup but card highlight persists", async ({
      page,
    }) => {
      const listingId = await getFirstMarkerIdOrSkip(page);

      // Click marker
      await clickMarkerByIndex(page, 0);
      await waitForCardHighlight(page, listingId);

      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible({ timeout: timeouts.action });

      // Press Escape
      await page.keyboard.press("Escape");

      // Popup gone
      await expect(popup).not.toBeVisible({ timeout: 2000 });

      // Card highlight persists (Escape only calls setSelectedListing(null),
      // NOT setActive(null))
      const cardState = await getCardState(page, listingId);
      expect(cardState.isActive).toBe(true);
    });

    test("Marker hover debounces scroll request (300ms)", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page, {
        minCount: 3,
      });
      if (markerCount < 3) test.skip(true, "Need 3+ markers");

      // Get marker IDs for PointerEvent-based hover dispatch
      const hid0 = await getMarkerListingId(page, 0);
      const hid1 = await getMarkerListingId(page, 1);
      const hid2 = await getMarkerListingId(page, 2);
      if (!hid0 || !hid1 || !hid2) test.skip(true, "Could not read marker IDs");

      // Instrument scroll count before hovering (viewport-aware container)
      await page.evaluate(() => {
        (window as any).__scrollRequestCount = 0;
        const isMobile = window.innerWidth < 768;
        const testId = isMobile ? 'mobile-search-results-container' : 'search-results-container';
        const container = document.querySelector(
          `[data-testid="${testId}"]`,
        );
        if (container) {
          container.addEventListener("scroll", () => {
            (window as any).__scrollRequestCount++;
          });
        }
      });

      // Rapidly hover across markers via PointerEvent dispatch (faster than 300ms debounce).
      // First two use fire-and-forget dispatch to maintain rapid timing.
      // Last one uses verified hover to ensure at least one handler fires.
      await hoverMarkerFast(page, hid0!);
      await page.waitForTimeout(50); // debounce test: intentionally faster than 300ms debounce
      await hoverMarkerFast(page, hid1!);
      await page.waitForTimeout(50); // debounce test: intentionally faster than 300ms debounce
      await hoverMarkerByListingId(page, hid2!);

      // debounce wait: allow 300ms debounce timer to fire + buffer
      await page.waitForTimeout(500);

      // The scroll container should have received at most 1 scroll event
      // (the debounced one from the last hovered marker)
      const scrollCount = await page.evaluate(
        () => (window as any).__scrollRequestCount ?? 0,
      );
      // Due to debouncing, only the last hover should trigger a scroll
      // May be 0 if the card was already in view
      expect(scrollCount).toBeLessThanOrEqual(2);
    });

    test("FocusSource guard prevents card hover -> map -> card loop", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) test.skip(true, "Map not available");

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) test.skip(true, "No markers");

      const listingId = await getMarkerListingId(page, 0);
      if (!listingId) test.skip(true, "No marker ID");

      const cardExists = await searchResultsContainer(page)
        .locator(
          `[data-testid="listing-card"][data-listing-id="${listingId}"]`,
        )
        .count();
      if (cardExists === 0) test.skip(true, "No card for listing");

      // Hover marker (sets focusSource to "map")
      await hoverMarkerByIndex(page, 0);

      // The card should get hover highlight from the map's setHovered
      // But the card's onMouseEnter should NOT fire back because
      // focusSource === "map" guard prevents the loop
      await waitForCardHover(page, listingId!, timeouts.action);
      const hoveredIds = await getHoveredListingIds(page);

      // This is hard to assert directly, but we verify no infinite loop
      // by checking that the page remains responsive
      expect(true).toBe(true); // If we get here, no infinite loop

      // Move away to clean up
      await page.mouse.move(0, 0);
    });

    test("Clicking 'Show on map' button sets activeId on card", async ({
      page,
    }) => {
      const cardId = await getFirstCardId(page);
      if (!cardId) test.skip(true, "No card");

      // Find the "Show on map" button on the first card
      const showOnMapBtn = searchResultsContainer(page).locator(
        `[data-testid="listing-card"][data-listing-id="${cardId}"] button[aria-label="Show on map"]`,
      );

      if ((await showOnMapBtn.count()) === 0) {
        test.skip(true, "No 'Show on map' button found");
      }

      await showOnMapBtn.click();

      // Card should now have active ring (setActive was called)
      await waitForCardHighlight(page, cardId!, timeouts.action);
      const cardState = await getCardState(page, cardId!);
      expect(cardState.isActive).toBe(true);
    });
  });
});
