import { test, expect, searchResultsContainer } from "../helpers";
import { DEDUPE_IDS, searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-05: clicking the card body routes to the canonical sibling detail page", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  await searchResultsContainer(page)
    .locator('[data-testid="listing-card-link"]')
    .first()
    .click();

  await page.waitForURL(`**/listings/${DEDUPE_IDS.canonical}`);
  await expect(page).toHaveURL(new RegExp(`/listings/${DEDUPE_IDS.canonical}$`));
});
