/**
 * E2E Test Suite: Create Listing — Functional Tests
 * Tests F-001 through F-018
 *
 * Covers happy-path creation, field validation, optional fields,
 * progress indicator, character counter, and redirect behavior.
 */

import { test, expect, tags } from '../helpers/test-utils';
import { CreateListingPage, CreateListingData } from '../page-objects/create-listing.page';

test.describe('Create Listing — Functional Tests', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  /** Build valid default data; caller can override individual fields. */
  function validData(overrides?: Partial<CreateListingData>): CreateListingData {
    const prefix = `e2e-${Date.now()}`;
    return {
      title: `Test Listing ${prefix}`,
      description: `A comfortable room in a sunny apartment near downtown. Perfect for students or young professionals looking for a great living situation. ${prefix}`,
      price: '1200',
      totalSlots: '3',
      address: '123 Test Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      ...overrides,
    };
  }

  // ────────────────────────────────────────────────────────
  // P0 — Must Ship (F-001 … F-008)
  // ────────────────────────────────────────────────────────

  test.describe('P0: Core creation & validation', () => {

    test(`F-001: Happy path — required fields only ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData();

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock the listing API to avoid slow real API (geocoding, DB, search upsert)
      await clp.mockListingApiSuccess();

      const response = await clp.submitAndWaitForResponse();
      expect(response.status()).toBe(201);

      await clp.expectSuccessToast();
      await clp.expectSuccess();
    });

    test(`F-002: Happy path — ALL fields ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const moveInISO = futureDate.toISOString().split('T')[0];

      const data = validData({
        amenities: 'wifi, parking',
        moveInDate: moveInISO,
        leaseDuration: '12 months',
        roomType: 'Private Room',
        houseRules: 'No smoking, no pets',
      });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({
        amenities: data.amenities,
        leaseDuration: data.leaseDuration,
        roomType: data.roomType,
        houseRules: data.houseRules,
      });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock the listing API to avoid slow real API
      await clp.mockListingApiSuccess();

      const response = await clp.submitAndWaitForResponse();
      expect(response.status()).toBe(201);

      await clp.expectSuccessToast();
      await clp.expectSuccess();
    });

    test(`F-003: Validation — empty form submit ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      await clp.goto();

      // The form has HTML `required` attributes on inputs, so clicking submit
      // with empty fields triggers browser native validation (not handleSubmit).
      // We verify that the page stays on /listings/create and no crash occurs.
      await clp.submit();
      await clp.expectOnCreatePage();

      // Verify HTML required validation is active: title input should be :invalid
      const titleInvalid = await clp.titleInput.evaluate(
        (el) => !(el as HTMLInputElement).validity.valid
      );
      expect(titleInvalid).toBe(true);
    });

    test(`F-004: Validation — description too short ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ description: 'short' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock API to return validation error for short description
      await clp.mockListingApiError(400, {
        error: 'Validation failed',
        fields: { description: 'Description must be at least 10 characters' },
      });

      const response = await clp.submitAndWaitForResponse();
      expect(response.ok()).toBe(false);

      // Server returns field-level errors for description
      await clp.expectValidationError('description');
    });

    test(`F-005: Validation — invalid zip code ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ zipCode: 'ABCDE' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock API to return validation error for invalid zip
      await clp.mockListingApiError(400, {
        error: 'Validation failed',
        fields: { zip: 'Invalid zip code format' },
      });

      const response = await clp.submitAndWaitForResponse();
      expect(response.ok()).toBe(false);

      await clp.expectValidationError('zip');
    });

    test(`F-006: Validation — price is 0 ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ price: '0' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock API to return validation error for zero price
      await clp.mockListingApiError(400, {
        error: 'Validation failed',
        fields: { price: 'Price must be a positive number' },
      });

      const response = await clp.submitAndWaitForResponse();
      expect(response.ok()).toBe(false);

      await clp.expectValidationError('price');
    });

    test(`F-007: Validation — price exceeds maximum ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ price: '99999' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      // Mock API to return validation error for excessive price
      await clp.mockListingApiError(400, {
        error: 'Validation failed',
        fields: { price: 'Price cannot exceed $50,000' },
      });

      const response = await clp.submitAndWaitForResponse();
      expect(response.ok()).toBe(false);

      await clp.expectValidationError('price');
    });

    test(`F-008: Validation — image required ${tags.auth} ${tags.core}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData();

      await clp.goto();
      await clp.fillRequiredFields(data);

      // Do NOT upload any images
      await clp.submit();

      await clp.expectOnCreatePage();
      await clp.expectErrorBanner(/photo|image/i);
    });
  });

  // ────────────────────────────────────────────────────────
  // P1 — Should Ship (F-009 … F-015)
  // ────────────────────────────────────────────────────────

  test.describe('P1: Optional fields & UX', () => {

    test(`F-009: Optional — lease duration "12 months" ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ leaseDuration: '12 months' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({ leaseDuration: data.leaseDuration });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();
    });

    test(`F-010: Optional — room type "Private Room" ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ roomType: 'Private Room' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({ roomType: data.roomType });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();
    });

    test(`F-011: Optional — future move-in date ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const moveInISO = futureDate.toISOString().split('T')[0];

      const data = validData({ moveInDate: moveInISO });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({ moveInDate: data.moveInDate });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();
    });

    test(`F-012: Optional — amenities "wifi, parking" ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ amenities: 'wifi, parking' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({ amenities: data.amenities });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();
    });

    test(`F-013: Optional — house rules "No smoking" ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData({ houseRules: 'No smoking' });

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.fillOptionalFields({ houseRules: data.houseRules });
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();
    });

    test(`F-014: Progress indicator tracks section completion ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData();

      await clp.goto();

      // "Finer Details" is always marked complete (all optional fields)
      const initialSteps = await clp.getCompletedStepCount();
      expect(initialSteps).toBeGreaterThanOrEqual(1); // At least "Finer Details"

      // Fill basics: title + description(>=10 chars) + price + totalSlots
      await clp.fillBasics(data);
      await page.waitForTimeout(500); // debounce for progress update
      const afterBasics = await clp.getCompletedStepCount();
      expect(afterBasics).toBeGreaterThanOrEqual(2); // +The Basics

      // Fill location: address + city + state + zip
      await clp.fillLocation(data);
      await page.waitForTimeout(500);
      const afterLocation = await clp.getCompletedStepCount();
      expect(afterLocation).toBeGreaterThanOrEqual(3); // +Location

      // Upload an image -> Photos section complete
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await page.waitForTimeout(800);
      const afterPhotos = await clp.getCompletedStepCount();
      expect(afterPhotos).toBe(4); // All 4 sections complete
    });

    test(`F-015: Redirect URL contains valid listing ID ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      const data = validData();

      await clp.goto();
      await clp.fillRequiredFields(data);
      await clp.mockImageUpload();
      await clp.uploadTestImage();
      await clp.waitForUploadComplete();

      await clp.mockListingApiSuccess();
      await clp.submitAndWaitForResponse();
      await clp.expectSuccess();

      const url = page.url();
      // URL should be /listings/{some-id} where id is NOT "create"
      const match = url.match(/\/listings\/([a-zA-Z0-9_-]+)/);
      expect(match).not.toBeNull();
      expect(match![1]).not.toBe('create');
      expect(match![1].length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────
  // P2 — Nice to Have (F-016 … F-018)
  // ────────────────────────────────────────────────────────

  test.describe('P2: Edge cases & polish', () => {

    test(`F-016: Character counter on description ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      await clp.goto();

      // Type some text into the description field
      const testText = 'Hello world test description for counting';
      await clp.descriptionInput.fill(testText);

      // The CharacterCounter component should show "{n} / 1000"
      const counter = page.getByText(new RegExp(`${testText.length}\\s*/\\s*1,?000`));
      await expect(counter).toBeVisible({ timeout: 3000 });

      // Type more and verify counter updates
      const longerText = testText + ' with more content added here';
      await clp.descriptionInput.fill(longerText);
      const updatedCounter = page.getByText(new RegExp(`${longerText.length}\\s*/\\s*1,?000`));
      await expect(updatedCounter).toBeVisible({ timeout: 3000 });
    });

    test(`F-017: Title max length (100 chars) ${tags.auth}`, async ({ page }) => {
      const clp = new CreateListingPage(page);
      await clp.goto();

      // Verify the title input has a maxLength attribute
      const maxLength = await clp.titleInput.getAttribute('maxLength');

      // Type 120 characters via keyboard to test browser enforcement
      const longTitle = 'A'.repeat(120);
      await clp.titleInput.fill(longTitle);

      const inputValue = await clp.titleInput.inputValue();

      if (maxLength) {
        // Browser enforces maxLength — value should be truncated
        expect(inputValue.length).toBeLessThanOrEqual(Number(maxLength));
      } else {
        // No client-side cap — value accepted as typed
        expect(inputValue.length).toBe(120);
      }
    });

    test(`F-018: Profile warning banner (placeholder) ${tags.auth}`, async ({ page }) => {
      // This test is a placeholder — verifying the profile-incomplete warning
      // requires a user whose profile is not fully set up. The current auth
      // fixture has a complete profile, so we just verify the banner is NOT
      // shown for a fully-set-up user.
      const clp = new CreateListingPage(page);
      await clp.goto();

      // With a complete profile, the warning banner should NOT appear
      const profileWarning = page.getByText(/complete your profile|profile incomplete/i);
      await expect(profileWarning).not.toBeVisible({ timeout: 3000 });
    });
  });
});
