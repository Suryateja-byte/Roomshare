import {
  test,
  expect,
  searchResultsContainer,
  openListingDetail,
} from "../helpers";
import { DEDUPE_IDS, searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-05: clicking the card body routes to the canonical sibling detail page", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  // Desktop opens the detail in a new tab; mobile navigates the same tab.
  const { detail } = await openListingDetail(
    page,
    () =>
      searchResultsContainer(page)
        .locator('[data-testid="listing-card-link"]')
        .first()
        .click(),
    `**/listings/${DEDUPE_IDS.canonical}`
  );

  await expect(detail).toHaveURL(
    new RegExp(`/listings/${DEDUPE_IDS.canonical}$`)
  );
});
