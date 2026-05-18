import { test, expect, searchResultsContainer } from "../helpers";
import { DEDUPE_IDS, searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-05: clicking the card body routes to the canonical sibling detail page", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  const firstCardLink = searchResultsContainer(page)
    .locator('[data-testid="listing-card-link"]')
    .first();

  await expect(firstCardLink).toHaveAttribute(
    "href",
    new RegExp(`/listings/${DEDUPE_IDS.canonical}$`)
  );

  const cardBodyTitle = firstCardLink.getByRole("heading", { level: 3 });
  await expect(cardBodyTitle).toBeVisible();

  const expectedDetailUrl = new RegExp(`/listings/${DEDUPE_IDS.canonical}$`);
  await expect(async () => {
    if (expectedDetailUrl.test(page.url())) {
      return;
    }

    await cardBodyTitle.click();
    await expect(page).toHaveURL(expectedDetailUrl, { timeout: 3_000 });
  }).toPass({
    timeout: 15_000,
    intervals: [100, 250, 500, 1_000],
  });
});
