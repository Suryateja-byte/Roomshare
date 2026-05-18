import { test, expect } from "../helpers";
import {
  buildCollisionFormData,
  deleteListings,
  expectCreatedListingId,
  openPreparedCreateListingPage,
  seedCollisionListings,
} from "./create-collision-helpers";

const OWNER_EMAIL = "e2e-other@roomshare.dev";
const OTHER_OWNER_EMAIL = process.env.E2E_TEST_EMAIL || "suryaram564@gmail.com";
const REVIEWER_EMAIL = "e2e-reviewer@roomshare.dev";
const CROSS_OWNER_TEST_ADDRESS = {
  address: "1555 Market St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94103",
};

test.use({ storageState: "playwright/.auth/user2.json" });

test("T-20: cross-owner collisions do not open the create collision modal", async ({
  page,
}) => {
  const cleanupIds = [
    ...(await seedCollisionListings(page, {
      title: "E2E Cross Owner Existing A",
      ownerEmail: OTHER_OWNER_EMAIL,
      address: CROSS_OWNER_TEST_ADDRESS.address,
      city: CROSS_OWNER_TEST_ADDRESS.city,
      state: CROSS_OWNER_TEST_ADDRESS.state,
      zipCode: CROSS_OWNER_TEST_ADDRESS.zipCode,
    })),
    ...(await seedCollisionListings(page, {
      title: "E2E Cross Owner Existing B",
      ownerEmail: REVIEWER_EMAIL,
      address: CROSS_OWNER_TEST_ADDRESS.address,
      city: CROSS_OWNER_TEST_ADDRESS.city,
      state: CROSS_OWNER_TEST_ADDRESS.state,
      zipCode: CROSS_OWNER_TEST_ADDRESS.zipCode,
    })),
  ];

  try {
    const createPage = await openPreparedCreateListingPage(
      page,
      buildCollisionFormData(
        "Cross Owner Collision Candidate",
        CROSS_OWNER_TEST_ADDRESS
      ),
      OWNER_EMAIL
    );

    const response = await createPage.submitAndWaitForResponse();
    if (response.status() !== 201) {
      throw new Error(
        `Expected cross-owner create to return 201, got ${response.status()}: ${await response.text()}`
      );
    }

    await expect(page.locator('[data-testid="collision-modal"]')).toHaveCount(
      0
    );

    const createdListingId = await expectCreatedListingId(page);
    cleanupIds.push(createdListingId);
  } finally {
    await deleteListings(page, cleanupIds);
  }
});
