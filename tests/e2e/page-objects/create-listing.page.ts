import { Page, Locator, expect } from '@playwright/test';
import { timeouts } from '../helpers/test-utils';
import path from 'path';

/**
 * Test data interface for create listing form
 */
export interface CreateListingData {
  title: string;
  description: string;
  price: number | string;
  totalSlots?: number | string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  amenities?: string;
  houseRules?: string;
  moveInDate?: string;
  leaseDuration?: string;
  roomType?: string;
  genderPreference?: string;
  householdGender?: string;
  languages?: string[];
}

/**
 * Page Object Model for the Create Listing form at /listings/create
 *
 * Locators verified against actual CreateListingForm.tsx labels.
 * All user-facing locators use getByLabel / getByRole / getByText.
 */
export class CreateListingPage {
  // ── Section 1: The Basics ──
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly priceInput: Locator;
  readonly totalSlotsInput: Locator;

  // ── Section 2: Location ──
  readonly addressInput: Locator;
  readonly cityInput: Locator;
  readonly stateInput: Locator;
  readonly zipInput: Locator;

  // ── Section 3: Photos ──
  readonly imageFileInput: Locator;

  // ── Section 4: Finer Details ──
  readonly amenitiesInput: Locator;
  readonly moveInDateInput: Locator;
  readonly leaseDurationTrigger: Locator;
  readonly roomTypeTrigger: Locator;
  readonly genderPrefTrigger: Locator;
  readonly householdGenderTrigger: Locator;
  readonly houseRulesInput: Locator;

  // ── Form Actions ──
  readonly submitButton: Locator;
  readonly form: Locator;

  // ── State Indicators ──
  readonly errorBanner: Locator;
  readonly draftBanner: Locator;
  readonly resumeDraftButton: Locator;
  readonly startFreshButton: Locator;
  readonly autoSaveIndicator: Locator;

  // ── Progress Steps ──
  readonly progressSection: Locator;
  readonly progressText: Locator;

  // ── Partial Upload Dialog ──
  readonly partialUploadDialog: Locator;

  constructor(readonly page: Page) {
    // Section 1: The Basics
    this.titleInput = page.getByLabel('Listing Title');
    this.descriptionInput = page.getByLabel('Description');
    this.priceInput = page.getByLabel('Monthly Rent ($)');
    this.totalSlotsInput = page.getByLabel('Total Roommates');

    // Section 2: Location
    this.addressInput = page.getByLabel('Street Address');
    this.cityInput = page.getByLabel('City');
    this.stateInput = page.getByLabel('State');
    this.zipInput = page.getByLabel('Zip Code');

    // Section 3: Photos (hidden file input)
    this.imageFileInput = page.locator('input[type="file"]');

    // Section 4: Finer Details
    this.amenitiesInput = page.getByLabel('Amenities');
    this.moveInDateInput = page.getByLabel('Move-In Date');
    this.leaseDurationTrigger = page.locator('#leaseDuration');
    this.roomTypeTrigger = page.locator('#roomType');
    this.genderPrefTrigger = page.locator('#genderPreference');
    this.householdGenderTrigger = page.locator('#householdGender');
    this.houseRulesInput = page.getByLabel('House Rules');

    // Actions
    this.submitButton = page.getByRole('button', { name: /create|submit|publish/i });
    this.form = page.locator('form');

    // State — error banner has specific Tailwind classes
    this.errorBanner = page.locator('.bg-red-50, .bg-red-900\\/20');
    this.draftBanner = page.getByText('You have an unsaved draft');
    this.resumeDraftButton = page.getByRole('button', { name: 'Resume Draft' });
    this.startFreshButton = page.getByRole('button', { name: 'Start Fresh' });
    this.autoSaveIndicator = page.getByText(/Draft saved/);

    // Progress
    this.progressSection = page.locator('.mb-8').first();
    this.progressText = page.getByText(/sections? complete|Ready to publish/);

    // Partial upload confirmation
    this.partialUploadDialog = page.getByRole('alertdialog');
  }

  // ── Navigation ──

  async goto() {
    await this.page.goto('/listings/create');
    await this.page.waitForLoadState('domcontentloaded');
    await this.form.waitFor({ state: 'visible', timeout: timeouts.navigation });
  }

  // ── Form Fill Actions ──

  async fillBasics(data: Pick<CreateListingData, 'title' | 'description' | 'price' | 'totalSlots'>) {
    await this.titleInput.fill(data.title);
    await this.descriptionInput.fill(data.description);
    await this.priceInput.fill(String(data.price));
    if (data.totalSlots !== undefined) {
      await this.totalSlotsInput.fill(String(data.totalSlots));
    }
  }

  async fillLocation(data: Pick<CreateListingData, 'address' | 'city' | 'state' | 'zipCode'>) {
    await this.addressInput.fill(data.address);
    await this.cityInput.fill(data.city);
    await this.stateInput.fill(data.state);
    await this.zipInput.fill(data.zipCode);
  }

  async fillRequiredFields(data: CreateListingData) {
    await this.fillBasics(data);
    await this.fillLocation(data);
  }

  async fillOptionalFields(data: Partial<CreateListingData>) {
    if (data.amenities) {
      await this.amenitiesInput.fill(data.amenities);
    }
    if (data.houseRules) {
      await this.houseRulesInput.fill(data.houseRules);
    }
    if (data.leaseDuration) {
      await this.selectOption(this.leaseDurationTrigger, data.leaseDuration);
    }
    if (data.roomType) {
      await this.selectOption(this.roomTypeTrigger, data.roomType);
    }
    if (data.genderPreference) {
      await this.selectOption(this.genderPrefTrigger, data.genderPreference);
    }
    if (data.householdGender) {
      await this.selectOption(this.householdGenderTrigger, data.householdGender);
    }
    if (data.moveInDate) {
      // DatePicker is a Radix Popover button trigger — cannot use .fill()
      // Click trigger to open calendar, then click "Today" to set a date
      await this.moveInDateInput.scrollIntoViewIfNeeded();
      await this.moveInDateInput.click();
      const todayButton = this.page.getByRole('button', { name: 'Today' });
      await todayButton.waitFor({ state: 'visible', timeout: 5000 });
      await todayButton.click();
    }
  }

  async fillAllFields(data: CreateListingData) {
    await this.fillRequiredFields(data);
    await this.fillOptionalFields(data);
  }

  // ── Select Helper (Radix UI Select) ──

  private async selectOption(trigger: Locator, value: string) {
    // Scroll trigger into view to ensure it's visible and clickable
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    // Wait for the Radix Select portal listbox to appear
    const listbox = this.page.getByRole('listbox');
    await listbox.waitFor({ state: 'visible', timeout: 5000 });
    // Click the matching option
    const option = this.page.getByRole('option', { name: new RegExp(`^${value}$`, 'i') });
    await option.click();
  }

  // ── Image Upload ──

  /**
   * Mock /api/upload to return instant fake Supabase URLs.
   * Call before uploading images.
   */
  async mockImageUpload() {
    let uploadCount = 0;
    await this.page.route('**/api/upload', async (route) => {
      uploadCount++;
      const id = `mock-${Date.now()}-${uploadCount}`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `https://fake.supabase.co/storage/v1/object/public/images/listings/${id}.jpg`,
        }),
      });
    });
  }

  /**
   * Upload a test image file via the hidden file input.
   */
  async uploadTestImage(fileName: string = 'valid-photo.jpg') {
    const filePath = path.resolve(__dirname, '../fixtures/test-images', fileName);
    await this.imageFileInput.setInputFiles(filePath);
  }

  /**
   * Wait until image upload is fully complete (preview + success text visible).
   */
  async waitForUploadComplete(count: number = 1) {
    // Wait for preview image to render
    await expect(this.page.locator(`img[alt="Preview ${count}"]`)).toBeVisible({ timeout: 10000 });
    // Wait for React state to settle (success summary appears)
    await expect(
      this.page.getByText(new RegExp(`${count} image[s]? uploaded successfully`))
    ).toBeVisible({ timeout: 10000 });
  }

  /**
   * Upload multiple test images.
   */
  async uploadMultipleImages(count: number) {
    for (let i = 0; i < count; i++) {
      await this.uploadTestImage('valid-photo.jpg');
      // Wait for each upload to show preview
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Get count of visible image previews (successfully uploaded).
   */
  async getUploadedImageCount(): Promise<number> {
    // Image previews are rendered in the ImageUploader component
    const previews = this.page.locator('[class*="relative"] img[src*="supabase"], [class*="relative"] img[src*="blob:"]');
    return previews.count();
  }

  // ── Form Submission ──

  async submit() {
    await this.submitButton.click();
  }

  async submitAndWaitForResponse() {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/listings') && resp.request().method() === 'POST',
      { timeout: timeouts.navigation }
    );
    await this.submitButton.click();
    return responsePromise;
  }

  // ── Assertions ──

  async expectSuccess() {
    // Wait for redirect to /listings/{id} — must NOT match /listings/create
    await this.page.waitForURL(/\/listings\/(?!create)[a-zA-Z0-9]/, { timeout: timeouts.navigation });
  }

  async expectSuccessToast() {
    await expect(
      this.page.locator('[data-sonner-toast]').filter({ hasText: /published|success/i })
    ).toBeVisible({ timeout: 5000 });
  }

  async expectOnCreatePage() {
    expect(this.page.url()).toContain('/listings/create');
  }

  async expectValidationError(fieldId: string) {
    const errorEl = this.page.locator(`#${fieldId}-error`);
    await expect(errorEl).toBeVisible({ timeout: 5000 });
  }

  async expectFieldAriaInvalid(fieldId: string) {
    await expect(this.page.locator(`#${fieldId}`)).toHaveAttribute('aria-invalid', 'true');
  }

  async expectErrorBanner(message?: string | RegExp) {
    await expect(this.errorBanner).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.errorBanner).toContainText(message);
    }
  }

  async expectNoErrorBanner() {
    await expect(this.errorBanner).not.toBeVisible();
  }

  async expectDraftBanner() {
    await expect(this.draftBanner).toBeVisible({ timeout: 5000 });
  }

  async expectNoDraftBanner() {
    await expect(this.draftBanner).not.toBeVisible();
  }

  // ── Progress Indicator ──

  async getCompletedStepCount(): Promise<number> {
    // Completed step circles: w-10 h-10 rounded-full with bg-green-50 (light) or bg-green-900 (dark)
    const greenSteps = this.page.locator('.w-10.h-10.rounded-full.bg-green-50, .w-10.h-10.rounded-full[class*="bg-green-900"]');
    return greenSteps.count();
  }

  async expectProgressText(text: string | RegExp) {
    await expect(this.progressText).toContainText(text);
  }

  // ── Draft Persistence ──

  async resumeDraft() {
    await this.resumeDraftButton.click();
  }

  async startFresh() {
    await this.startFreshButton.click();
  }

  /**
   * Seed a draft in localStorage before navigating.
   * Must be called before goto().
   */
  async seedDraft(data: Partial<CreateListingData>) {
    const draftData = {
      title: data.title || '',
      description: data.description || '',
      price: String(data.price || ''),
      totalSlots: String(data.totalSlots || '1'),
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      zip: data.zipCode || '',
      amenities: data.amenities || '',
      houseRules: data.houseRules || '',
      moveInDate: data.moveInDate || '',
      leaseDuration: data.leaseDuration || '',
      roomType: data.roomType || '',
      genderPreference: data.genderPreference || '',
      householdGender: data.householdGender || '',
      selectedLanguages: data.languages || [],
      images: [],
    };

    await this.page.addInitScript((draft) => {
      localStorage.setItem('listing-draft', JSON.stringify({
        data: draft,
        savedAt: Date.now(),
      }));
    }, draftData);
  }

  /**
   * Clear draft from localStorage.
   */
  async clearDraft() {
    await this.page.evaluate(() => {
      localStorage.removeItem('listing-draft');
    });
  }

  // ── API Mocking Helpers ──

  /**
   * Mock POST /api/listings to return a specific error.
   */
  async mockListingApiError(status: number, body: Record<string, unknown>) {
    await this.page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Mock POST /api/listings with a delay (slow response).
   */
  async mockListingApiSlow(delayMs: number = 5000) {
    await this.page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, delayMs));
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-slow-id' }),
        });
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Mock POST /api/listings to return instant success.
   */
  async mockListingApiSuccess(id?: string) {
    const mockId = id || `mock-${Date.now()}`;
    await this.page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: mockId }),
        });
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Count POST /api/listings calls via route interception.
   * Returns a getter function for the current count.
   */
  async countListingApiCalls(): Promise<() => number> {
    let count = 0;
    await this.page.route('**/api/listings', async (route) => {
      if (route.request().method() === 'POST') {
        count++;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: `mock-counted-${count}` }),
        });
      } else {
        await route.continue();
      }
    });
    return () => count;
  }
}
