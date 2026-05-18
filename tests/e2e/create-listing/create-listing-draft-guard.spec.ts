import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";
import type { Page } from "@playwright/test";

const draftPayload = {
  title: "Expired Draft Title",
  description: "This draft is old enough to be cleared automatically.",
  price: "1900",
  totalSlots: "2",
  address: "222 Draft Guard Street",
  city: "San Francisco",
  state: "CA",
  zip: "94110",
  amenities: "",
  houseRules: "",
  moveInDate: "",
  leaseDuration: "",
  roomType: "",
  genderPreference: "",
  householdGender: "",
  bookingMode: "SHARED",
  selectedLanguages: [],
  images: [],
};

async function waitForDraftSaved(page: Page) {
  await expect(async () => {
    const draft = await page.evaluate(() =>
      localStorage.getItem("listing-draft")
    );
    expect(draft).not.toBeNull();
  }).toPass({ timeout: 5_000 });
}

async function expectBeforeUnloadBlocked(page: Page) {
  await expect(async () => {
    const prevented = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  }).toPass({ timeout: 5_000 });
}

async function expectBeforeUnloadAllowed(page: Page) {
  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
}

async function activateUnsavedGuard(createPage: CreateListingPage) {
  await createPage.fillBasics({
    title: "Unsaved Guard Title",
    description: "This unsaved listing should trigger navigation protection.",
    price: "2100",
    totalSlots: "2",
  });
  await waitForDraftSaved(createPage.page);
  await expectBeforeUnloadBlocked(createPage.page);
}

function unsavedDialog(page: Page) {
  return page.getByRole("alertdialog").filter({ hasText: "Unsaved Changes" });
}

test.describe("Create Listing - Draft And Navigation Guard", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("listing-draft"));
  });

  test(`${tags.auth} successful publish clears draft and disables the guard`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await createPage.mockImageUpload();
    await createPage.mockListingApiSuccess("mock-draft-cleared-id");

    await createPage.fillRequiredFields({
      title: "Successful Draft Clear Title",
      description:
        "This valid listing should publish, clear the saved draft, and stop warning on navigation.",
      price: 2300,
      totalSlots: 2,
      address: "444 Draft Success Ave",
      city: "San Francisco",
      state: "CA",
      zipCode: "94110",
    });
    await waitForDraftSaved(page);
    await createPage.uploadTestImage();
    await createPage.waitForUploadComplete();

    const response = await createPage.submitAndWaitForResponse();
    expect(response.status()).toBe(201);

    await createPage.expectSuccessToast();
    await createPage.expectSuccess();

    await expect(async () => {
      const storedDraft = await page.evaluate(() =>
        localStorage.getItem("listing-draft")
      );
      expect(storedDraft).toBeNull();
    }).toPass({ timeout: 5_000 });
    await expectBeforeUnloadAllowed(page);
  });

  test(`${tags.auth} expired draft is cleared and not offered for resume`, async ({
    page,
  }) => {
    await page.addInitScript((draft) => {
      localStorage.setItem(
        "listing-draft",
        JSON.stringify({
          data: draft,
          savedAt: Date.now() - 25 * 60 * 60 * 1000,
        })
      );
    }, draftPayload);

    const createPage = new CreateListingPage(page);
    await createPage.goto();

    await createPage.expectNoDraftBanner();
    await expect(createPage.titleInput).toHaveValue("");
    await expect(createPage.descriptionInput).toHaveValue("");

    await expect(async () => {
      const storedDraft = await page.evaluate(() =>
        localStorage.getItem("listing-draft")
      );
      expect(storedDraft).toBeNull();
    }).toPass({ timeout: 5_000 });
  });

  test(`${tags.auth} cross-tab draft conflict warning appears and dismisses`, async ({
    page,
    context,
  }) => {
    const createPage = new CreateListingPage(page);
    await createPage.goto();

    const secondTab = await context.newPage();
    try {
      await secondTab.goto("/listings/create");
      await secondTab.waitForLoadState("domcontentloaded");
      await secondTab.evaluate((draft) => {
        localStorage.setItem(
          "listing-draft",
          JSON.stringify({ data: draft, savedAt: Date.now() })
        );
      }, draftPayload);

      const warning = page.getByText(/This draft was modified in another tab/i);
      await expect(warning).toBeVisible({ timeout: 5_000 });

      await page.getByRole("button", { name: "Dismiss" }).click();
      await expect(warning).not.toBeVisible();
    } finally {
      await secondTab.close();
    }
  });

  test(`${tags.auth} beforeunload is cancelled when unsaved data exists`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await activateUnsavedGuard(createPage);

    await expectBeforeUnloadBlocked(page);
  });

  test(`${tags.auth} custom navigation guard supports stay and leave actions`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await activateUnsavedGuard(createPage);

    await page.evaluate(() => window.history.pushState({}, "", "/search"));

    const dialog = unsavedDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/unsaved changes/i);
    await expect(page).toHaveURL(/\/listings\/create/);

    await page.getByRole("button", { name: "Stay on Page" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/listings\/create/);

    await page.evaluate(() => window.history.pushState({}, "", "/search"));
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Leave Page" }).click();
    await expect(page).toHaveURL(/\/search/);
  });

  test(`${tags.auth} browser back is caught by the unsaved changes guard`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.goto("/listings/create");
    await expect(page).toHaveURL(/\/listings\/create/);

    const createPage = new CreateListingPage(page);
    await createPage.form.waitFor({ state: "visible", timeout: 30_000 });
    await activateUnsavedGuard(createPage);

    await page.evaluate(() => window.history.back());

    const dialog = unsavedDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/listings\/create/);

    await page.getByRole("button", { name: "Stay on Page" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/listings\/create/);
  });

  test(`${tags.auth} submission-in-progress guard uses the publishing warning`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await createPage.mockImageUpload();
    await createPage.mockListingApiSlow(30_000);

    await createPage.fillRequiredFields({
      title: "Publishing Guard Title",
      description:
        "This valid listing keeps the submit request open for guard testing.",
      price: 2200,
      totalSlots: 2,
      address: "333 Publishing Guard Ave",
      city: "San Francisco",
      state: "CA",
      zipCode: "94110",
    });
    await createPage.uploadTestImage();
    await createPage.waitForUploadComplete();

    await createPage.submit();
    await expect(createPage.submitButton).toContainText(/Publishing/i, {
      timeout: 5_000,
    });

    await page.evaluate(() => window.history.pushState({}, "", "/search"));

    const dialog = unsavedDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/still being created/i);

    await page.getByRole("button", { name: "Stay on Page" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/listings\/create/);
  });
});
