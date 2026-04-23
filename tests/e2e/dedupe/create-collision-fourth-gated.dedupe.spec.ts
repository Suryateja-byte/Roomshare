import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  getListingCollisionState,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

test("T-19: the fourth acknowledged collision is created under review and shows the moderation toast", async ({
  page,
}) => {
  const cleanupIds = await seedCollisionListings(page, {
    title: "E2E Collision Moderation Gate",
    count: 3,
    createdAtOffsetsHours: [1, 2, 3],
    moveInDateOffsetsDays: [-1, -2, -3],
  });

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData("Collision Moderation Candidate")
    );

    const firstResponse = await createPage.submitAndWaitForResponse();
    expect(firstResponse.status()).toBe(409);

    const ackResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/listings") &&
        response.request().method() === "POST" &&
        response.request().headers()["x-collision-ack"] === "1"
    );

    await page.getByTestId("collision-radio-add-date").check();
    await page.getByTestId("collision-continue").click();

    const ackResponse = await ackResponsePromise;
    expect(ackResponse.status()).toBe(201);

    await expect(
      page
        .locator('[data-sonner-toast][role="status"]')
        .filter({ hasText: /review/i })
        .first()
    ).toBeVisible();

    const createdListingId = await expectCreatedListingId(page);
    cleanupIds.push(createdListingId);

    const listingState = await getListingCollisionState(page, createdListingId);
    expect(listingState.needsMigrationReview).toBe(true);
  } finally {
    await deleteListings(page, cleanupIds);
  }
});
