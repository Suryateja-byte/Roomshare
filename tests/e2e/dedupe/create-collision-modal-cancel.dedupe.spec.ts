import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

const OWNER_EMAIL = "e2e-other@roomshare.dev";

test.use({ storageState: "playwright/.auth/user2.json" });

test("T-21: collision cancel returns to form without losing data", async ({
  page,
}) => {
  const seededListingIds = await seedCollisionListings(page, {
    title: "E2E Collision Cancel",
    ownerEmail: OWNER_EMAIL,
  });
  const formData = buildCollisionFormData("Collision Cancel Candidate");

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      formData,
      OWNER_EMAIL
    );

    const firstResponse = await createPage.submitAndWaitForResponse();
    expect(firstResponse.status()).toBe(409);

    await expect(page.getByTestId("collision-modal")).toBeVisible();

    const ackRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/api/listings") &&
        request.method() === "POST" &&
        request.headers()["x-collision-ack"] === "1"
      ) {
        ackRequests.push(request.url());
      }
    });

    await page.getByTestId("collision-cancel").click();

    await expect(page.getByTestId("collision-modal")).not.toBeVisible();
    await expect(createPage.titleInput).toHaveValue(formData.title);
    await expect(createPage.addressInput).toHaveValue(formData.address);
    expect(ackRequests).toHaveLength(0);
  } finally {
    await deleteListings(page, seededListingIds);
  }
});
