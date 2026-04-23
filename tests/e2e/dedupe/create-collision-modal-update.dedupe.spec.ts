import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

test("T-16: duplicate create opens the collision modal and update routes to edit", async ({
  page,
}) => {
  const seededListingIds = await seedCollisionListings(page, {
    title: "E2E Collision Update Existing",
  });

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData("Collision Update Candidate")
    );

    const firstResponse = await createPage.submitAndWaitForResponse();
    expect(firstResponse.status()).toBe(409);

    await expect(page.getByTestId("collision-modal")).toBeVisible();
    await page.getByTestId("collision-radio-update").check();
    await page.getByTestId("collision-continue").click();

    await expect(page).toHaveURL(
      new RegExp(`/listings/${seededListingIds[0]}/edit$`)
    );
  } finally {
    await deleteListings(page, seededListingIds);
  }
});
