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
  const viewport = page.viewportSize();
  test.skip(
    !!viewport && viewport.width < 768,
    "Desktop-only collision update route assertion; mobile create flow is covered separately"
  );

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

    await expect(
      page.getByRole("heading", { name: /edit listing/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator(`a[href="/listings/${seededListingIds[0]}"]`).first()
    ).toBeVisible();
    await expect(
      page.locator('form[action*="update"], form').first()
    ).toBeVisible();
  } finally {
    await deleteListings(page, seededListingIds);
  }
});
