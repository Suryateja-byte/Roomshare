import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";
import {
  deleteListings,
  expectCreatedListingId,
} from "../dedupe/create-collision-helpers";

test.describe("Create Listing - Post Publish Search Visibility", () => {
  const ownerEmail = "e2e-other@roomshare.dev";

  test.use({ storageState: "playwright/.auth/user2.json" });

  test(`${tags.auth} newly published listing appears in search soon after creation`, async ({
    page,
  }) => {
    test.slow();

    const unique = Date.now();
    const title = `E2E Post Publish Search ${unique}`;
    const createdListingIds: string[] = [];
    const createPage = new CreateListingPage(page);

    try {
      await createPage.goto();
      await createPage.fillRequiredFields({
        title,
        description:
          "A real create-listing flow used to verify search visibility after publish.",
        price: "1840",
        totalSlots: "2",
        address: "1555 Market St",
        city: "San Francisco",
        state: "CA",
        zipCode: "94103",
      });
      await createPage.mockImageUpload(ownerEmail);
      await createPage.uploadTestImage();
      await createPage.waitForUploadComplete();

      const response = await createPage.submitAndWaitForResponse();
      expect(response.status()).toBe(201);

      const createdListingId = await expectCreatedListingId(page);
      createdListingIds.push(createdListingId);

      await expect(async () => {
        await page.goto(`/search?q=${encodeURIComponent(title)}`);
        await expect(
          page.getByRole("heading", { name: title, level: 3 })
        ).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 45_000, intervals: [2_000, 5_000, 10_000] });
    } finally {
      await deleteListings(page, createdListingIds);
    }
  });
});
