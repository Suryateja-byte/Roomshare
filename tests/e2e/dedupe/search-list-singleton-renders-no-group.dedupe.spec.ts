import { test, expect, searchResultsContainer } from "../helpers";
import { searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-01: a singleton listing renders without a grouping affordance", async ({
  page,
}) => {
  await page.goto(searchUrls.singleton, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const container = searchResultsContainer(page);
  await expect(
    container.locator('[data-testid="group-dates-trigger"]')
  ).toHaveCount(0);
  await expect(page.locator('[data-testid="group-dates-panel"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="group-dates-modal"]')).toHaveCount(0);
});
