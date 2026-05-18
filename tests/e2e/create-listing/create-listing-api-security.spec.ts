import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";

test.describe("Create Listing - API Security and Server Errors", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  async function setupSubmittableForm(page: import("@playwright/test").Page) {
    const createPage = new CreateListingPage(page);
    await createPage.goto();
    await createPage.fillRequiredFields({
      title: "Server Error Mapping Listing",
      description:
        "This listing is valid on the client so mocked server errors can be surfaced.",
      price: "1750",
      totalSlots: "2",
      address: "99 Server Error Rd",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    });
    await createPage.mockImageUpload();
    await createPage.uploadTestImage();
    await createPage.waitForUploadComplete();
    return createPage;
  }

  test(`${tags.auth} server field errors map to fields and focus first invalid field`, async ({
    page,
  }) => {
    const createPage = await setupSubmittableForm(page);
    await createPage.mockListingApiError(400, {
      error: "Please fix the highlighted fields",
      fields: {
        title: "Server rejected this title",
        price: "Server rejected this price",
      },
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectValidationError("title");
    await createPage.expectValidationError("price");
    await expect(page.locator("#title-error")).toContainText(
      "Server rejected this title"
    );
    await createPage.expectFieldAriaInvalid("title");
    await expect(createPage.titleInput).toBeFocused();
    await expect(createPage.titleInput).toHaveValue(
      "Server Error Mapping Listing"
    );
  });

  test(`${tags.auth} CSRF failure shows usable error and preserves form`, async ({
    page,
  }) => {
    const createPage = await setupSubmittableForm(page);
    await createPage.mockListingApiError(403, {
      error: "Invalid CSRF token. Please refresh and try again.",
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/csrf|refresh/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(
      "Server Error Mapping Listing"
    );
  });

  test(`${tags.auth} geocoding unavailable shows retryable address error`, async ({
    page,
  }) => {
    const createPage = await setupSubmittableForm(page);
    await createPage.mockListingApiError(503, {
      error:
        "Address verification temporarily unavailable. Please try again shortly.",
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/address verification.*unavailable/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.addressInput).toHaveValue("99 Server Error Rd");
  });

  test(`${tags.auth} invalid image ownership URL is shown as a usable error`, async ({
    page,
  }) => {
    const createPage = await setupSubmittableForm(page);
    await createPage.mockListingApiError(400, {
      error: "One or more image URLs are invalid",
    });

    await createPage.submitAndWaitForResponse();

    await createPage.expectErrorBanner(/image URLs are invalid/i);
    await createPage.expectOnCreatePage();
    await expect(createPage.titleInput).toHaveValue(
      "Server Error Mapping Listing"
    );
  });

  test(`${tags.auth} disallowed title is blocked before publish`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    let listingPostCount = 0;

    await page.route("**/api/listings", async (route) => {
      if (route.request().method() === "POST") {
        listingPostCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Should not post invalid title" }),
        });
        return;
      }
      await route.continue();
    });

    await createPage.goto();
    await createPage.fillRequiredFields({
      title: "English only household",
      description:
        "This description is otherwise long enough to pass client validation.",
      price: "1750",
      totalSlots: "2",
      address: "99 Server Error Rd",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    });
    await createPage.mockImageUpload();
    await createPage.uploadTestImage();
    await createPage.waitForUploadComplete();

    await createPage.submit();

    await createPage.expectValidationError("title");
    await expect(createPage.titleInput).toBeFocused();
    expect(listingPostCount).toBe(0);
  });
});
