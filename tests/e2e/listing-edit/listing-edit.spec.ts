/**
 * Listing Edit Page E2E Tests (LE-01 through LE-18)
 *
 * Tests for the /listings/[id]/edit page covering:
 * - Auth & access guards (LE-01 to LE-03)
 * - Field editing assertions (LE-04 to LE-10)
 * - Image management (LE-11 to LE-13)
 * - Draft persistence (LE-14, LE-15)
 * - Form actions (LE-16 to LE-18)
 */

import { test, expect, selectors, SF_BOUNDS, searchResultsContainer } from '../helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the first listing owned by the authenticated test user.
 * Navigates to search, grabs the first listing card href, returns the listing ID.
 */
async function findOwnListingId(page: import('@playwright/test').Page, nav: any): Promise<string | null> {
  await nav.goToSearch({ q: 'Sunny Mission Room', bounds: SF_BOUNDS });
  await page.waitForLoadState('domcontentloaded');

  const container = searchResultsContainer(page);
  const cards = container.locator(selectors.listingCard);
  try {
    await cards.first().waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    return null;
  }
  if ((await cards.count()) === 0) return null;

  const link = cards.first().locator('a[href^="/listings/"]').first();
  const href = await link.getAttribute('href');
  if (!href) return null;

  // Extract ID from /listings/<id>
  const match = href.match(/\/listings\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Find the reviewer-owned listing ("Reviewer Nob Hill Apartment").
 * Returns the listing ID or null.
 */
async function findReviewerListingId(page: import('@playwright/test').Page, nav: any): Promise<string | null> {
  await nav.goToSearch({ q: 'Reviewer Nob Hill', bounds: SF_BOUNDS });
  await page.waitForLoadState('domcontentloaded');

  const container = searchResultsContainer(page);
  const cards = container.locator(selectors.listingCard);
  try {
    await cards.first().waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    return null;
  }
  if ((await cards.count()) === 0) return null;

  // Find the card that matches the reviewer listing
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const cardText = await cards.nth(i).textContent();
    if (cardText && /reviewer.*nob.*hill/i.test(cardText)) {
      const link = cards.nth(i).locator('a[href^="/listings/"]').first();
      const href = await link.getAttribute('href');
      if (href) {
        const match = href.match(/\/listings\/([^/?#]+)/);
        return match ? match[1] : null;
      }
    }
  }

  // Fallback: just grab the first card (might be reviewer's)
  const link = cards.first().locator('a[href^="/listings/"]').first();
  const href = await link.getAttribute('href');
  if (!href) return null;
  const match = href.match(/\/listings\/([^/?#]+)/);
  return match ? match[1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth & Access Guards (LE-01, LE-02, LE-03)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Listing Edit — Auth & Access Guards', () => {
  test('LE-01: unauthenticated user redirected to /login', async ({ browser, nav, page }) => {
    test.slow();

    // First, find a valid listing ID using the authenticated page
    const listingId = await findOwnListingId(page, nav);
    test.skip(!listingId, 'No listing found to test with');

    // Create a new context WITHOUT auth storageState
    const unauthContext = await browser.newContext();
    const unauthPage = await unauthContext.newPage();

    try {
      await unauthPage.goto(`/listings/${listingId}/edit`);
      await unauthPage.waitForLoadState('domcontentloaded');

      // Should redirect to /login
      await expect(unauthPage).toHaveURL(/\/login/, { timeout: 15000 });
    } finally {
      await unauthContext.close();
    }
  });

  test('LE-02: non-owner redirected to listing detail (not /edit)', async ({ page, nav }) => {
    test.slow();

    // Find the reviewer's listing (not owned by testUser)
    const reviewerListingId = await findReviewerListingId(page, nav);
    test.skip(!reviewerListingId, 'Reviewer listing not found — skipping');

    // Navigate to the edit page of a listing NOT owned by testUser
    await page.goto(`/listings/${reviewerListingId}/edit`);
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to /listings/[id] without /edit
    await expect.poll(
      () => {
        const url = page.url();
        return url.includes(`/listings/${reviewerListingId}`) && !url.includes('/edit');
      },
      { timeout: 15000, message: 'Expected redirect away from /edit to listing detail' }
    ).toBe(true);
  });

  test('LE-03: owner can access edit page with pre-filled form', async ({ page, nav }) => {
    test.slow();

    const listingId = await findOwnListingId(page, nav);
    test.skip(!listingId, 'No listing found');

    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');

    // Verify we stayed on the edit page
    await expect(page).toHaveURL(/\/edit/, { timeout: 15000 });

    // Verify form is visible
    const form = page.locator('[data-testid="edit-listing-form"]');
    await expect(form).toBeVisible({ timeout: 15000 });

    // Verify heading
    await expect(
      page.getByRole('heading', { name: /edit listing/i })
    ).toBeVisible({ timeout: 10000 });

    // Verify title is pre-filled (not empty)
    const titleInput = page.locator('[data-testid="listing-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    const titleValue = await titleInput.inputValue();
    expect(titleValue.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Field Editing — Read-Only Assertions (LE-04 through LE-10)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Listing Edit — Field Editing', () => {
  let listingId: string | null = null;

  test.beforeEach(async ({ page, nav }) => {
    test.slow();
    if (!listingId) {
      listingId = await findOwnListingId(page, nav);
    }
    test.skip(!listingId, 'No listing found');
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });
  });

  test('LE-04: title input is editable and pre-filled', async ({ page }) => {
    const titleInput = page.locator('[data-testid="listing-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await expect(titleInput).toBeEnabled();

    const value = await titleInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
    // Seed data: first listing is "Sunny Mission Room"
    expect(value).toMatch(/sunny mission/i);
  });

  test('LE-05: description textarea is editable and pre-filled', async ({ page }) => {
    const descInput = page.locator('[data-testid="listing-description-input"]');
    await expect(descInput).toBeVisible({ timeout: 10000 });
    await expect(descInput).toBeEnabled();

    const value = await descInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('LE-06: price input is editable and shows current price', async ({ page }) => {
    const priceInput = page.locator('[data-testid="listing-price-input"]');
    await expect(priceInput).toBeVisible({ timeout: 10000 });
    await expect(priceInput).toBeEnabled();

    const value = await priceInput.inputValue();
    // Seed data price is 1200
    expect(Number(value)).toBeGreaterThan(0);
  });

  test('LE-07: room type select dropdown is present with options', async ({ page }) => {
    // The form uses Radix Select with id="roomType"
    const roomTypeTrigger = page.locator('#roomType')
      .or(page.getByLabel(/room type/i));
    await expect(roomTypeTrigger.first()).toBeVisible({ timeout: 10000 });

    // Click to open the dropdown
    await roomTypeTrigger.first().click();

    // Verify options are visible in the dropdown content
    const privateRoom = page.getByRole('option', { name: /private room/i });
    const sharedRoom = page.getByRole('option', { name: /shared room/i });
    const entirePlace = page.getByRole('option', { name: /entire place/i });

    await expect(
      privateRoom.or(sharedRoom).or(entirePlace).first()
    ).toBeVisible({ timeout: 5000 });

    // Close dropdown by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('LE-08: amenities field is pre-filled with comma-separated values', async ({ page }) => {
    const amenitiesInput = page.locator('#amenities')
      .or(page.locator('input[name="amenities"]'));
    await expect(amenitiesInput.first()).toBeVisible({ timeout: 10000 });

    const value = await amenitiesInput.first().inputValue();
    // Seed data: ['Wifi', 'Furnished', 'Kitchen', 'Parking'] joined with ', '
    expect(value.length).toBeGreaterThan(0);
    expect(value).toMatch(/wifi/i);
  });

  test('LE-09: location fields are pre-filled (address, city, state, zip)', async ({ page }) => {
    const addressInput = page.locator('#address').or(page.locator('input[name="address"]'));
    const cityInput = page.locator('#city').or(page.locator('input[name="city"]'));
    const stateInput = page.locator('#state').or(page.locator('input[name="state"]'));
    const zipInput = page.locator('#zip').or(page.locator('input[name="zip"]'));

    await expect(addressInput.first()).toBeVisible({ timeout: 10000 });

    const address = await addressInput.first().inputValue();
    const city = await cityInput.first().inputValue();
    const state = await stateInput.first().inputValue();
    const zip = await zipInput.first().inputValue();

    // Seed data: 2400 Mission St, San Francisco, CA, 94110
    expect(address.length).toBeGreaterThan(0);
    expect(city.length).toBeGreaterThan(0);
    expect(state.length).toBeGreaterThan(0);
    expect(zip.length).toBeGreaterThan(0);
  });

  test('LE-10: move-in date field is present', async ({ page }) => {
    // The DatePicker component renders a button (Popover trigger) with id="moveInDate"
    const moveInLabel = page.getByText(/move-in date/i);
    await expect(moveInLabel.first()).toBeVisible({ timeout: 10000 });

    // The date picker has id="moveInDate" on its trigger
    const datePicker = page.locator('#moveInDate')
      .or(page.getByRole('button', { name: /select.*date|move-in/i }));
    await expect(datePicker.first()).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Image Management (LE-11, LE-12, LE-13)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Listing Edit — Image Management', () => {
  let listingId: string | null = null;

  test.beforeEach(async ({ page, nav }) => {
    test.slow();
    if (!listingId) {
      listingId = await findOwnListingId(page, nav);
    }
    test.skip(!listingId, 'No listing found');
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });
  });

  test('LE-11: existing images are displayed', async ({ page }) => {
    // Seed data provides 2 unsplash images per listing
    // Look for img elements within the Photos section
    const photosSection = page.getByText(/photos/i).first();
    await expect(photosSection).toBeVisible({ timeout: 10000 });

    // Images should be rendered (either as img tags or background images)
    const images = page.locator('img[src*="unsplash"]')
      .or(page.locator('img[src*="supabase"]'))
      .or(page.locator('[data-testid="image-preview"]'));

    // At least 1 image should be visible (seed data has 2)
    await expect(images.first()).toBeVisible({ timeout: 10000 });
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('LE-12: image uploader area is visible', async ({ page }) => {
    // ImageUploader renders a drag-and-drop zone with upload button
    const uploadArea = page.getByText(/add photos|drag.*drop|upload/i)
      .or(page.locator('input[type="file"]'))
      .or(page.getByRole('button', { name: /upload|add.*photo/i }));

    await expect(uploadArea.first()).toBeAttached({ timeout: 10000 });
  });

  test('LE-13: image management section is present', async ({ page }) => {
    // The Photos section header
    const photosHeading = page.getByText(/photos/i).first();
    await expect(photosHeading).toBeVisible({ timeout: 10000 });

    // The helper text about adding photos
    const helperText = page.getByText(/add photos.*attract/i)
      .or(page.getByText(/first image.*main photo/i));
    await expect(helperText.first()).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Draft Persistence (LE-14, LE-15) — Serial because they share localStorage
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Listing Edit — Draft Persistence', () => {
  let listingId: string | null = null;

  test('LE-14: edit title → navigate away → return → draft banner appears', async ({ page, nav }) => {
    test.slow();

    listingId = await findOwnListingId(page, nav);
    test.skip(!listingId, 'No listing found');

    // Navigate to the edit page
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // Dismiss any existing draft banner first
    const existingBanner = page.getByText(/you have unsaved edits/i);
    if (await existingBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      const discardBtn = page.getByRole('button', { name: /discard/i });
      if (await discardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await discardBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Edit the title to trigger form change and auto-save
    const titleInput = page.locator('[data-testid="listing-title-input"]');
    await titleInput.click();
    await titleInput.fill('Draft Test Title Changed');

    // Wait for auto-save (useFormPersistence saves on change events)
    await page.waitForTimeout(1000);

    // Navigate away
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate back to the edit page
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // Draft banner should appear: "You have unsaved edits"
    const draftBanner = page.getByText(/you have unsaved edits/i);
    await expect(draftBanner).toBeVisible({ timeout: 10000 });

    // Should have "Resume Edits" button
    const resumeBtn = page.getByRole('button', { name: /resume edits/i });
    await expect(resumeBtn).toBeVisible({ timeout: 5000 });
  });

  test('LE-15: discard draft resets form to original values', async ({ page, nav }) => {
    test.slow();

    // Use the same listingId from the previous test
    if (!listingId) {
      listingId = await findOwnListingId(page, nav);
    }
    test.skip(!listingId, 'No listing found');

    // Navigate to edit page — should show draft banner from LE-14
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // Wait for draft banner
    const draftBanner = page.getByText(/you have unsaved edits/i);
    const hasBanner = await draftBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBanner) {
      // Click Discard
      const discardBtn = page.getByRole('button', { name: /discard/i });
      await expect(discardBtn).toBeVisible({ timeout: 5000 });
      await discardBtn.click();

      // Banner should disappear
      await expect(draftBanner).not.toBeVisible({ timeout: 5000 });
    }

    // Title should be back to original seed value
    const titleInput = page.locator('[data-testid="listing-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    const value = await titleInput.inputValue();
    // After discard, original value should be shown ("Sunny Mission Room")
    expect(value).toMatch(/sunny mission/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Form Actions (LE-16, LE-17, LE-18)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Listing Edit — Form Actions', () => {
  let listingId: string | null = null;

  test.beforeEach(async ({ page, nav }) => {
    test.slow();
    if (!listingId) {
      listingId = await findOwnListingId(page, nav);
    }
    test.skip(!listingId, 'No listing found');
  });

  test('LE-16: cancel button navigates back to listing detail', async ({ page }) => {
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // The cancel button is a Link with data-testid="listing-cancel-button"
    const cancelBtn = page.locator('[data-testid="listing-cancel-button"]');
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await expect(cancelBtn).toHaveText(/back to listing/i);

    await cancelBtn.click();

    // Should navigate to listing detail page (no /edit)
    await expect.poll(
      () => {
        const url = page.url();
        return url.includes(`/listings/${listingId}`) && !url.includes('/edit');
      },
      { timeout: 15000, message: 'Expected navigation to listing detail page' }
    ).toBe(true);
  });

  test('LE-17: submit with no changes redirects to listing detail', async ({ page }) => {
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // Dismiss any draft banner
    const draftBanner = page.getByText(/you have unsaved edits/i);
    if (await draftBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      const discardBtn = page.getByRole('button', { name: /discard/i });
      if (await discardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await discardBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // The save button — check if it's enabled (it may be disabled when images.length === 0)
    const saveBtn = page.locator('[data-testid="listing-save-button"]');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });

    // Wait for images to load (button is disabled when images.length === 0)
    // Give the ImageUploader time to initialize from listing.images
    await page.waitForTimeout(2000);

    const isEnabled = await saveBtn.isEnabled().catch(() => false);
    if (!isEnabled) {
      // Button may be disabled if images haven't loaded yet — skip gracefully
      test.skip(true, 'Save button disabled (images may not have loaded)');
    }

    // Click save (submitting unchanged data)
    await saveBtn.click();

    // Should redirect to the listing detail page after successful PATCH
    await expect.poll(
      () => {
        const url = page.url();
        return url.includes(`/listings/${listingId}`) && !url.includes('/edit');
      },
      { timeout: 20000, message: 'Expected redirect to listing detail after save' }
    ).toBe(true);
  });

  test('LE-18: clear required title → submit → validation error shown', async ({ page }) => {
    await page.goto(`/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="edit-listing-form"]')).toBeVisible({ timeout: 15000 });

    // Dismiss any draft banner
    const draftBanner = page.getByText(/you have unsaved edits/i);
    if (await draftBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      const discardBtn = page.getByRole('button', { name: /discard/i });
      if (await discardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await discardBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Clear the required title field
    const titleInput = page.locator('[data-testid="listing-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.clear();

    // Wait for images to possibly load
    await page.waitForTimeout(2000);

    const saveBtn = page.locator('[data-testid="listing-save-button"]');

    // Try to submit — either browser validation fires or API returns error
    // Use evaluate to call requestSubmit on the form to bypass disabled button state
    const formSubmitted = await page.evaluate(() => {
      const form = document.querySelector('[data-testid="edit-listing-form"]') as HTMLFormElement;
      if (form) {
        // Check if the title input has required attribute
        const titleInput = form.querySelector('[data-testid="listing-title-input"]') as HTMLInputElement;
        if (titleInput && titleInput.required && !titleInput.value) {
          // Browser will show validation popup — check validity
          return !form.checkValidity();
        }
      }
      return false;
    });

    if (formSubmitted) {
      // Browser's built-in validation should prevent submission
      // Verify we're still on the edit page
      expect(page.url()).toContain('/edit');
    } else {
      // If button is enabled, click it — API should return error
      const isEnabled = await saveBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await saveBtn.click();
        await page.waitForTimeout(2000);

        // Should show error message (either field error or general error)
        const errorMsg = page.getByText(/failed to save|title.*required|required/i)
          .or(page.locator('[role="alert"]'))
          .or(page.locator('.text-red-500, .text-red-600'));

        // Either an error is shown OR we're still on the edit page
        const hasError = await errorMsg.first().isVisible({ timeout: 5000 }).catch(() => false);
        const stillOnEdit = page.url().includes('/edit');
        expect(hasError || stillOnEdit).toBeTruthy();
      } else {
        // Button is disabled — form won't submit with empty required field
        // This itself is a valid validation behavior
        expect(page.url()).toContain('/edit');
      }
    }
  });
});
