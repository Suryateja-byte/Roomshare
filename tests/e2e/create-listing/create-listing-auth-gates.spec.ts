import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";

test.describe("Create Listing - Auth and Profile Gates", () => {
  test(`${tags.anon} anonymous host is redirected to login`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    try {
      await page.goto("/listings/create");
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator("form[novalidate]")).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  test.describe("authenticated host API gates", () => {
    test.use({ storageState: "playwright/.auth/user.json" });

    test(`${tags.auth} unverified host API block shows usable error and preserves form`, async ({
      page,
    }) => {
      test.slow();

      const createPage = new CreateListingPage(page);
      await createPage.goto();
      await createPage.fillRequiredFields({
        title: "Unverified Host Block",
        description:
          "This listing should stay on the form when the API blocks an unverified host.",
        price: "1450",
        totalSlots: "2",
        address: "44 Verification Ave",
        city: "San Francisco",
        state: "CA",
        zipCode: "94102",
      });
      await createPage.mockImageUpload();
      await createPage.uploadTestImage();
      await createPage.waitForUploadComplete();

      await createPage.mockListingApiError(403, {
        error: "Please verify your email before creating a listing",
      });

      await createPage.submitAndWaitForResponse();

      await createPage.expectErrorBanner(/verify.*email/i);
      await createPage.expectOnCreatePage();
      await expect(createPage.titleInput).toHaveValue("Unverified Host Block");
    });
  });
});
