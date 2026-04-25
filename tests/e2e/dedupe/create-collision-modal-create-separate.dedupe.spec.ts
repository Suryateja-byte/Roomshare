import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  getListingCollisionState,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

test("T-18: create-separate requires a reason and creates a non-moderated listing", async ({
  page,
}) => {
  const cleanupIds = await seedCollisionListings(page, {
    title: "E2E Collision Create Separate",
  });

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData("Collision Create Separate Candidate")
    );

    const firstResponse = await createPage.submitAndWaitForResponse();
    expect(firstResponse.status()).toBe(409);

    await expect(page.getByTestId("collision-modal")).toBeVisible();
    await page.getByTestId("collision-radio-create-separate").check();

    const reasonTextarea = page.getByTestId("collision-reason-textarea");
    await expect(reasonTextarea).toBeVisible();

    await reasonTextarea.fill("too few");
    await expect(page.getByTestId("collision-continue")).toBeDisabled();

    const ackResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/listings") &&
        response.request().method() === "POST" &&
        response.request().headers()["x-collision-ack"] === "1"
    );

    await reasonTextarea.fill("Separate lease and entrance justify its own listing.");
    await expect(page.getByTestId("collision-continue")).toBeEnabled();
    await page.getByTestId("collision-continue").click();

    const ackResponse = await ackResponsePromise;
    expect(ackResponse.status()).toBe(201);

    const createdListingId = await expectCreatedListingId(page);
    cleanupIds.push(createdListingId);

    const listingState = await getListingCollisionState(page, createdListingId);
    expect(listingState.normalizedAddress).toBeTruthy();
  } finally {
    await deleteListings(page, cleanupIds);
  }
});
