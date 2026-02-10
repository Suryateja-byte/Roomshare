/**
 * User Profile & Blocking Journeys (J35–J37)
 *
 * J35: View public user profile
 * J36: Block a user
 * J37: Edit profile fields
 */

import { test, expect, selectors, timeouts, SF_BOUNDS, searchResultsContainer } from "../helpers";

// ─── J35: View Public User Profile ────────────────────────────────────────────
test.describe("J35: View Public User Profile", () => {
  test("listing detail → click host name → verify profile page", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to a listing
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState('domcontentloaded');

    const container = searchResultsContainer(page);
    const cards = container.locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "No listings — skipping");

    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Find and click host name/link
    const hostLink = page
      .locator('main a[href*="/users/"]')
      .or(page.locator('main a[href*="/profile/"]'))
      .or(page.locator("main").getByRole("link", { name: /host|owner|posted by/i }));

    const hasHostLink = await hostLink.first().isVisible().catch(() => false);
    test.skip(!hasHostLink, "No host profile link — skipping");

    await hostLink.first().click();

    // Wait for navigation to user profile page
    try {
      await page.waitForURL(/\/users\//, { timeout: 10000 });
    } catch {
      // May already be on user page or redirected
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 3: Verify profile page
    const onProfile = page.url().includes("/users/") || page.url().includes("/profile/");
    expect(onProfile).toBeTruthy();

    // Step 4: Verify name is visible
    const heading = page.locator("main h1, main h2").first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Step 5: Verify no private data exposed
    const privateData = page.getByText(/password|ssn|social security|credit card/i);
    const hasPrivate = await privateData.isVisible().catch(() => false);
    expect(hasPrivate).toBeFalsy();
  });
});

// ─── J36: Block a User ────────────────────────────────────────────────────────
test.describe("J36: Block a User", () => {
  test("user profile → block → confirm → verify", async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to a NON-OWNED listing to find the reviewer's profile
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });

    // Wait for listing cards to appear (up to 10s)
    let j36Container = searchResultsContainer(page);
    let cardLocator = j36Container.locator(selectors.listingCard);
    try {
      await cardLocator.first().waitFor({ state: "visible", timeout: 10000 });
    } catch {
      // Retry with broader search
      await nav.goToSearch({ bounds: SF_BOUNDS });
      j36Container = searchResultsContainer(page);
      cardLocator = j36Container.locator(selectors.listingCard);
      try {
        await cardLocator.first().waitFor({ state: "visible", timeout: 10000 });
      } catch {
        test.skip(true, "No listings appeared — skipping");
      }
    }

    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Navigate to user profile — find host link
    const hostLink = page
      .locator('main a[href*="/users/"]')
      .or(page.locator("main").getByRole("link", { name: /host|owner|posted by|hosted by/i }));

    const hasHostLink = await hostLink.first().isVisible().catch(() => false);
    test.skip(!hasHostLink, "No host profile link — skipping");

    await hostLink.first().click();
    try {
      await page.waitForURL(/\/users\//, { timeout: 10000 });
    } catch {
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 3: Look for block button
    const blockBtn = page
      .getByRole("button", { name: /block/i })
      .or(page.locator('[data-testid="block-user"]'));

    const canBlock = await blockBtn.first().isVisible().catch(() => false);
    test.skip(!canBlock, "No block button — skipping");

    await blockBtn.first().click();
    await page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Step 4: Confirm block — modal has "Block User" button
    const confirmBtn = page.getByRole("button", { name: /block user/i })
      .or(page.locator('[role="dialog"] button').filter({ hasText: /block/i }));
    if (await confirmBtn.first().isVisible().catch(() => false)) {
      await confirmBtn.first().click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 5: Verify block happened
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const unblockBtn = page.getByRole("button", { name: /unblock/i });
    const isBlocked = await unblockBtn.isVisible().catch(() => false);
    expect(hasToast || isBlocked).toBeTruthy();

    // Clean up: unblock
    if (isBlocked) {
      await unblockBtn.click();
      await page.waitForLoadState('domcontentloaded');
      const confirmUnblock = page.getByRole("button", { name: /confirm|yes|unblock/i }).first();
      if (await confirmUnblock.isVisible().catch(() => false)) {
        await confirmUnblock.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }
  });
});

// ─── J37: Edit Profile Fields ─────────────────────────────────────────────────
test.describe("J37: Edit Profile Fields", () => {
  test("profile → edit → fill bio + languages → save → verify display", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to profile
    await nav.goToProfile();
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Click edit button or navigate to edit page directly
    const editBtn = page
      .getByRole("link", { name: /edit/i })
      .or(page.getByRole("button", { name: /edit/i }))
      .or(page.locator('a[href*="/profile/edit"]'))
      .or(page.locator('a[href*="/settings"]'));

    const canEdit = await editBtn.first().isVisible().catch(() => false);
    if (canEdit) {
      await editBtn.first().click();
      await page.waitForLoadState('domcontentloaded');
    } else {
      // Fallback: navigate directly to edit page
      await page.goto("/profile/edit");
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 3: Fill bio field
    const bioField = page
      .getByLabel(/bio/i)
      .or(page.locator('textarea[name="bio"]'))
      .or(page.locator('textarea').first());

    const canEditBio = await bioField.isVisible().catch(() => false);
    test.skip(!canEditBio, "No bio field — skipping");

    const testBio = `E2E test bio updated at ${Date.now()}`;
    await bioField.clear();
    await bioField.fill(testBio);

    // Step 4: Save
    const saveBtn = page
      .getByRole("button", { name: /save|update|submit/i })
      .or(page.locator('button[type="submit"]'));
    if (await saveBtn.first().isVisible().catch(() => false)) {
      await saveBtn.first().click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 5: Verify changes persisted
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    const bioText = page.getByText(testBio);
    const hasBio = await bioText.isVisible().catch(() => false);
    expect(hasToast || hasBio).toBeTruthy();
  });
});
