import { test, expect, searchResultsContainer } from "../helpers";
import { searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-13: grouped results survive reload without cursor params leaking into the shared URL", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroupFiltered, {
    waitUntil: "domcontentloaded",
  });
  await waitForVisibleCards(page);

  await expect(page).toHaveURL(/q=E2E\+Dedupe\+Clone\+Group/);
  await expect(page).not.toHaveURL(/cursor=/);

  await page.reload({ waitUntil: "domcontentloaded" });
  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);
  await expect(
    searchResultsContainer(page).locator('[data-testid="group-dates-trigger"]')
  ).toHaveText("+3 more dates");
});
