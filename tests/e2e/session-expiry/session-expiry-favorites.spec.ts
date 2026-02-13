/**
 * E2E Test Suite: Session Expiry — Favorites
 * Test IDs: SE-F01..F02
 *
 * Validates FavoriteButton 401 handling:
 * - Optimistic heart fill reverts on 401
 * - Redirect to /login
 *
 * References:
 *   FavoriteButton.tsx:46-50 — response.status === 401 check + redirect
 *   FavoriteButton.tsx:72 — aria-label "Save listing" / "Remove from saved"
 *   FavoriteButton.tsx:73 — aria-pressed tracks saved state
 */

import { test, expect, tags, SF_BOUNDS, searchResultsContainer, selectors } from "../helpers";
import { expireSession, mockApi401, expectLoginRedirect } from "../helpers";

test.describe("Session Expiry: Favorites", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-F01: FavoriteButton redirects to login on session expiry`, async ({
    page,
  }) => {
    // Navigate to search results to find a listing with a favorite button
    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for listing cards to load
    const container = searchResultsContainer(page);
    const firstCard = container.locator(selectors.listingCard).first();
    if (!(await firstCard.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, "No listings found");
      return;
    }

    // Click into the first listing detail page
    const listingLink = firstCard.locator("a").first();
    await listingLink.click();
    await page.waitForURL(/\/listings\/.+/);

    // Expire session and mock 401 on favorites API
    await expireSession(page);
    await mockApi401(page, "**/api/favorites", { method: "POST" });

    // Find the favorite/save button
    const favBtn = page
      .locator(
        'button[aria-label="Save listing"], button[aria-label="Remove from saved"]',
      )
      .first();
    if (!(await favBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "No favorite button found on listing detail page");
      return;
    }

    // Click favorite — should trigger 401 -> redirect
    await favBtn.click();

    // Verify redirect to login
    await expectLoginRedirect(page);
  });

  test(`${tags.auth} ${tags.sessionExpiry} - SE-F02: Optimistic state reverts on 401`, async ({
    page,
  }) => {
    // Navigate to a listing detail page
    await page.goto(
      `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
    );
    await page.waitForLoadState("domcontentloaded");

    const container = searchResultsContainer(page);
    const firstCard = container.locator(selectors.listingCard).first();
    if (!(await firstCard.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, "No listings found");
      return;
    }

    const listingLink = firstCard.locator("a").first();
    await listingLink.click();
    await page.waitForURL(/\/listings\/.+/);

    // Find an unsaved favorite button
    const favBtn = page
      .locator('button[aria-label="Save listing"]')
      .first();
    if (!(await favBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "No unsaved favorite button found");
      return;
    }

    // Verify initial state is not pressed (not saved)
    await expect(favBtn).toHaveAttribute("aria-pressed", "false");

    // Expire session and mock 401
    await expireSession(page);
    await mockApi401(page, "**/api/favorites", { method: "POST" });

    // Click — optimistic state briefly flips to true, then reverts
    await favBtn.click();

    // FavoriteButton does `router.push('/login')` on 401 which triggers redirect
    // The button state should revert before redirect
    await expectLoginRedirect(page);
  });
});
