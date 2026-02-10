/**
 * E2E Test Suite: Create Listing — Image Upload
 * Tests: IMG-001 through IMG-008
 *
 * Covers single/multi upload, removal, invalid file types,
 * progress indicators, failure + retry, max limit, and
 * submit-blocked-during-upload guard.
 */

import { test, expect, tags, timeouts } from '../helpers/test-utils';
import { CreateListingPage } from '../page-objects/create-listing.page';

test.describe('Create Listing — Image Upload', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  let createPage: CreateListingPage;

  test.beforeEach(async ({ page }) => {
    test.slow();
    createPage = new CreateListingPage(page);
  });

  // ── IMG-001: Upload single valid JPEG ──────────────────────────────

  test(`${tags.auth} IMG-001 upload single valid JPEG shows preview and Main badge`, async ({ page }) => {
    await createPage.mockImageUpload();
    await createPage.goto();

    await createPage.uploadTestImage('valid-photo.jpg');

    // Wait for the preview image to appear (blob: preview or supabase URL)
    const preview = page.locator('img[alt="Preview 1"]');
    await expect(preview).toBeVisible({ timeout: timeouts.action });

    // First image should have the "Main" badge (scoped to avoid "Skip to main content")
    await expect(page.locator('[class*="relative"]').getByText('Main', { exact: true }).first()).toBeVisible();

    // Image count summary should show "1 of 10 images"
    await expect(page.getByText('1 of 10 images')).toBeVisible();

    // Upload success summary
    await expect(page.getByText('1 image uploaded successfully')).toBeVisible();
  });

  // ── IMG-002: Upload multiple images ────────────────────────────────

  test(`${tags.auth} IMG-002 upload 3 images shows all previews with Main on first`, async ({ page }) => {
    await createPage.mockImageUpload();
    await createPage.goto();

    // Upload 3 images sequentially
    await createPage.uploadTestImage('valid-photo.jpg');
    await expect(page.locator('img[alt="Preview 1"]')).toBeVisible({ timeout: timeouts.action });

    await createPage.uploadTestImage('valid-photo.png');
    await expect(page.locator('img[alt="Preview 2"]')).toBeVisible({ timeout: timeouts.action });

    await createPage.uploadTestImage('valid-photo.webp');
    await expect(page.locator('img[alt="Preview 3"]')).toBeVisible({ timeout: timeouts.action });

    // All 3 previews visible
    const previews = page.locator('img[alt^="Preview"]');
    await expect(previews).toHaveCount(3);

    // Only the first has "Main" badge
    await expect(page.locator('[class*="relative"]').getByText('Main', { exact: true }).first()).toBeVisible();

    // Count summary
    await expect(page.getByText('3 of 10 images')).toBeVisible();
    await expect(page.getByText('3 images uploaded successfully')).toBeVisible();
  });

  // ── IMG-003: Remove uploaded image ─────────────────────────────────

  test(`${tags.auth} IMG-003 remove second uploaded image leaves only one`, async ({ page }) => {
    await createPage.mockImageUpload();
    await createPage.goto();

    // Upload 2 images
    await createPage.uploadTestImage('valid-photo.jpg');
    await expect(page.locator('img[alt="Preview 1"]')).toBeVisible({ timeout: timeouts.action });

    await createPage.uploadTestImage('valid-photo.png');
    await expect(page.locator('img[alt="Preview 2"]')).toBeVisible({ timeout: timeouts.action });

    // Verify we have 2 previews
    await expect(page.locator('img[alt^="Preview"]')).toHaveCount(2);

    // Click the remove button on the second image
    // Remove buttons have aria-label="Remove image"
    const removeButtons = page.getByRole('button', { name: 'Remove image' });
    await expect(removeButtons).toHaveCount(2);

    // Hover to reveal the remove button (it's opacity-0 until hover)
    const secondImageContainer = page.locator('img[alt="Preview 2"]').locator('..');
    await secondImageContainer.hover();
    await removeButtons.nth(1).click({ force: true });

    // Should be back to 1 image
    await expect(page.locator('img[alt^="Preview"]')).toHaveCount(1);
    await expect(page.getByText('1 of 10 images')).toBeVisible();
  });

  // ── IMG-004: Upload invalid file type ──────────────────────────────

  test(`${tags.auth} IMG-004 upload invalid .txt file is rejected`, async ({ page }) => {
    await createPage.goto();

    // Record how many previews exist before (should be 0)
    const previewsBefore = await page.locator('img[alt^="Preview"]').count();
    expect(previewsBefore).toBe(0);

    // Try to upload a .txt file
    await createPage.uploadTestImage('invalid-type.txt');

    // Wait briefly, then confirm no image was added
    await page.waitForTimeout(1000);
    const previewsAfter = await page.locator('img[alt^="Preview"]').count();
    expect(previewsAfter).toBe(0);

    // No image count summary should appear (no images in state)
    await expect(page.getByText(/of 10 images/)).not.toBeVisible();
  });

  // ── IMG-005: Upload progress indicator ─────────────────────────────

  test(`${tags.auth} IMG-005 shows spinner during upload`, async ({ page }) => {
    // Mock a slow upload (3s delay)
    await page.route('**/api/upload', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://fake.supabase.co/storage/v1/object/public/images/listings/slow-${Date.now()}.jpg`,
        }),
      });
    });

    await createPage.goto();
    await createPage.uploadTestImage('valid-photo.jpg');

    // The image should appear with opacity-50 (uploading state) and a spinner overlay
    const spinner = page.locator('form .animate-spin').first();
    await expect(spinner).toBeVisible({ timeout: 5000 });

    // The submit button should show "Uploading Images..." while uploading
    await expect(page.locator('button[type="submit"]')).toContainText(/Uploading Images/);

    // Wait for upload to complete
    await expect(spinner).not.toBeVisible({ timeout: 5000 });

    // After completion, success summary should appear
    await expect(page.getByText('1 image uploaded successfully')).toBeVisible({ timeout: 2000 });
  });

  // ── IMG-006: Upload failure + retry ────────────────────────────────

  test(`${tags.auth} IMG-006 failed upload shows error overlay and retry succeeds`, async ({ page }) => {
    // First call fails, second succeeds
    let uploadAttempt = 0;
    await page.route('**/api/upload', async (route) => {
      uploadAttempt++;
      if (uploadAttempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upload failed' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: `https://fake.supabase.co/storage/v1/object/public/images/listings/retry-${Date.now()}.jpg`,
          }),
        });
      }
    });

    await createPage.goto();
    await createPage.uploadTestImage('valid-photo.jpg');

    // Error overlay should appear on the failed image — look for retry button
    const retryButton = page.getByRole('button', { name: /retry/i });
    await expect(retryButton).toBeVisible({ timeout: timeouts.action });

    // Failed image summary
    await expect(page.getByText(/failed to upload/i)).toBeVisible();

    // Click retry via dispatchEvent (delete overlay is on top in DOM, blocking pointer events)
    await retryButton.dispatchEvent('click');

    // After retry succeeds, retry button should disappear
    await expect(retryButton).not.toBeVisible({ timeout: timeouts.navigation });

    // Success summary should replace the failure
    await expect(page.getByText('1 image uploaded successfully')).toBeVisible();
  });

  // ── IMG-007: Max 10 images ─────────────────────────────────────────

  test(`${tags.auth} IMG-007 cannot add more than 10 images`, async ({ page }) => {
    test.slow(); // uploading 10+ images is slow
    await createPage.mockImageUpload();
    await createPage.goto();

    // Upload 10 images sequentially
    for (let i = 0; i < 10; i++) {
      await createPage.uploadTestImage('valid-photo.jpg');
      // Wait for each preview to register
      await page.waitForTimeout(500);
    }

    // Wait for all 10 to appear
    await expect(page.locator('img[alt^="Preview"]')).toHaveCount(10, { timeout: 30000 });
    await expect(page.getByText('10 of 10 images')).toBeVisible();

    // The upload drop zone should be hidden when at max
    const uploadArea = page.getByText('Click to upload');
    await expect(uploadArea).not.toBeVisible();
  });

  // ── IMG-008: Submit blocked during upload ──────────────────────────

  test(`${tags.auth} IMG-008 submit is blocked while images are still uploading`, async ({ page }) => {
    // Mock a very slow upload so we can click submit while it is in-flight
    await page.route('**/api/upload', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://fake.supabase.co/storage/v1/object/public/images/listings/slow-block-${Date.now()}.jpg`,
        }),
      });
    });

    await createPage.goto();

    // Fill required fields so the form doesn't fail on other validations first
    await createPage.fillRequiredFields({
      title: 'Test Listing for Upload Block',
      description: 'Description to satisfy validation requirements for testing upload blocking',
      price: 1200,
      address: '123 Test St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
    });

    // Start an upload (will take 5s)
    await createPage.uploadTestImage('valid-photo.jpg');

    // Verify upload is in progress (scope to form to avoid nav spinner)
    await expect(page.locator('form .animate-spin').first()).toBeVisible({ timeout: 5000 });

    // The submit button should be disabled and show "Uploading Images..." during upload
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled({ timeout: 5000 });
    await expect(submitBtn).toContainText(/Uploading Images/);

    // We should still be on the create page (no submission possible)
    await createPage.expectOnCreatePage();

    // Wait for upload to complete and verify button re-enables
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await expect(submitBtn).toContainText(/Publish/);
  });
});
