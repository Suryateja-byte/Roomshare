import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  getListingCollisionState,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

test("T-17: add-date collision retry re-posts with ack and creates a listing", async ({
  page,
}) => {
  const cleanupIds = await seedCollisionListings(page, {
    title: "E2E Collision Add Date",
  });

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData("Collision Add Date Candidate")
    );

    const firstResponse = await createPage.submitAndWaitForResponse();
    expect(firstResponse.status()).toBe(409);

    await expect(page.getByTestId("collision-modal")).toBeVisible();

    const ackRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/api/listings") &&
        request.method() === "POST" &&
        request.headers()["x-collision-ack"] === "1"
    );
    const ackResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/listings") &&
        response.request().method() === "POST" &&
        response.request().headers()["x-collision-ack"] === "1"
    );

    await page.getByTestId("collision-radio-add-date").check();
    await page.getByTestId("collision-continue").click();

    const ackRequest = await ackRequestPromise;
    expect(ackRequest.headers()["x-collision-ack"]).toBe("1");

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
