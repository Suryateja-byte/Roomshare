import { test, expect, searchResultsContainer } from "../helpers";
import { searchUrls, visibleMarkerCount, waitForVisibleCards } from "./dedupe-helpers";

test("T-02: a 4-clone owner group renders as one card and one pin", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const container = searchResultsContainer(page);
  await expect(container.getByText("Available Mar 20")).toBeVisible();
  await expect(
    container.locator('[data-testid="group-dates-trigger"]')
  ).toHaveText("+3 more dates");

  await expect.poll(() => visibleMarkerCount(page)).toBe(1);
});
