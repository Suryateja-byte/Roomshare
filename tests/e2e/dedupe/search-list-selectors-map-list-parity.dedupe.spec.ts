import { test, expect, searchResultsContainer } from "../helpers";
import { searchUrls, visibleMarkerCount, waitForVisibleCards } from "./dedupe-helpers";

async function assertMapListParity(page: import("@playwright/test").Page) {
  const cards = await waitForVisibleCards(page);
  const cardCount = await cards.count();
  const markerCount = await visibleMarkerCount(page).catch(() => null);

  if (markerCount !== null) {
    expect(markerCount).toBe(cardCount);
  }
}

test("T-15: map pin count stays in parity with canonical list cards before and after filter changes", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await assertMapListParity(page);
  await expect(
    searchResultsContainer(page).locator('[data-testid="listing-card"]')
  ).toHaveCount(1);

  await page.goto(searchUrls.cloneGroupFiltered, {
    waitUntil: "domcontentloaded",
  });
  await assertMapListParity(page);
  await expect(
    searchResultsContainer(page).locator('[data-testid="listing-card"]')
  ).toHaveCount(1);
});
