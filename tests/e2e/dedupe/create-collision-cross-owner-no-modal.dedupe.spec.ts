import { test, expect } from "../helpers";
import {
  CROSS_OWNER_ADDRESS,
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  openPreparedCreateListingPage,
} from "./create-collision-helpers";

test("T-20: cross-owner collisions do not open the create collision modal", async ({
  page,
}) => {
  const cleanupIds: string[] = [];

  try {
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
