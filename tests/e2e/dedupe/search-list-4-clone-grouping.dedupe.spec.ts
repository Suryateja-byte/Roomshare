import { test, expect, searchResultsContainer } from "../helpers";
import {
  searchUrls,
  visibleMarkerCount,
  waitForVisibleCards,
} from "./dedupe-helpers";

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
  ).toHaveText("View 3 more available dates");

  const markerCount = await visibleMarkerCount(page).catch(() => null);
  if (markerCount !== null) {
    expect(markerCount).toBe(1);
  }
});

test("T-02a: grouped desktop row card keeps trust and date controls aligned", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "roomshare-map-preference",
      JSON.stringify({ desktop: "split", mobile: "list" })
    );
  });

  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const card = cards.first();
  await expect(card).toBeVisible();
  await expect(
    card.locator('[data-testid="host-identity-badge"]')
  ).toBeVisible();

  const overflow = await card.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const detailsBox = await card
    .locator('[data-testid="listing-card-details"]')
    .boundingBox();
  const actionBox = await card
    .locator('[data-testid="group-dates-action"]')
    .boundingBox();
  const triggerBox = await card
    .locator('[data-testid="group-dates-trigger"]')
    .boundingBox();
  const badgeBox = await card
    .locator('[data-testid="host-identity-badge"]')
    .boundingBox();
  const cardBox = await card.boundingBox();

  expect(detailsBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect(cardBox).not.toBeNull();

  expect(Math.abs(triggerBox!.x - detailsBox!.x)).toBeLessThanOrEqual(2);
  expect(badgeBox!.width).toBeLessThan(cardBox!.width * 0.55);
  await expect(card.locator('[data-testid="group-dates-trigger"]')).toHaveText(
    "View 3 more available dates"
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
