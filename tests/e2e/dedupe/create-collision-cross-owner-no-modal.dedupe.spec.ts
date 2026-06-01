import { test, expect } from "../helpers";
import {
  CROSS_OWNER_ADDRESS,
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  findOwnerListingsByTitlePrefix,
  openPreparedCreateListingPage,
} from "./create-collision-helpers";

test.use({ storageState: "playwright/.auth/incomplete-host.json" });

test("T-20: cross-owner collisions do not open the create collision modal", async ({
  page,
}) => {
  const cleanupIds: string[] = [];

  try {
    await deleteListings(
      page,
      await findOwnerListingsByTitlePrefix(page, {
        titlePrefix: "Cross Owner Collision Candidate",
        address: CROSS_OWNER_ADDRESS,
      })
    );

    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData("Cross Owner Collision Candidate", CROSS_OWNER_ADDRESS)
    );

    const response = await createPage.submitAndWaitForResponse();
    expect(response.status()).toBe(201);

    await expect(page.locator('[data-testid="collision-modal"]')).toHaveCount(0);

    const createdListingId = await expectCreatedListingId(page);
    cleanupIds.push(createdListingId);
  } finally {
    await deleteListings(page, cleanupIds);
  }
});
