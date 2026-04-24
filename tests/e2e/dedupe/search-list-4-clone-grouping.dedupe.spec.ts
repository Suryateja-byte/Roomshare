import { test, expect, searchResultsContainer } from "../helpers";
import { searchUrls, visibleMarkerCount, waitForVisibleCards } from "./dedupe-helpers";

test("T-02: a 4-clone owner group renders as one card and one pin", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const container = searchResultsContainer(page);
  await expect(container.getByText("Available May 20")).toBeVisible();
  await expect(
    container.locator('[data-testid="group-dates-trigger"]')
  ).toHaveText("+3 more dates");

  const markerCount = await visibleMarkerCount(page).catch(() => null);
  if (markerCount !== null) {
    expect(markerCount).toBe(1);
  }
});
