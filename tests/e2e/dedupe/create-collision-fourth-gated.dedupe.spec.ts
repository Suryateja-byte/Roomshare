import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

test("T-19: the fourth acknowledged collision is blocked", async ({
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
    expect(ackResponse.status()).toBe(429);
    const payload = await ackResponse.json();
    expect(payload.code).toBe("LISTING_CREATE_COLLISION_RATE_LIMITED");
  } finally {
    await deleteListings(page, cleanupIds);
  }
});
