import { test, expect } from "../helpers";
import { searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test("T-08: same-title same-address listings from different owners remain separate cards", async ({
  page,
}) => {
  await page.goto(searchUrls.crossOwner, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(2);
});
