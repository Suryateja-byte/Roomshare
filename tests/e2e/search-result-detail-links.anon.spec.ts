import type { Page } from "@playwright/test";
import {
  expect,
  SF_BOUNDS,
  searchResultsContainer,
  test,
} from "./helpers/test-utils";

type LinkSample = {
  id: string;
  href: string;
  text: string;
};

type SearchV2Item = {
  id?: unknown;
  groupSummary?: {
    members?: Array<{
      listingId?: unknown;
    }>;
  };
};

type SearchV2Feature = {
  properties?: {
    id?: unknown;
  };
};

type SearchV2Response = {
  list?: {
    fullItems?: SearchV2Item[];
  };
  map?: {
    geojson?: {
      features?: SearchV2Feature[];
    };
  };
};

type MapListing = {
  id?: unknown;
};

type MapListingsResponse = {
  data?: {
    listings?: MapListing[];
  };
  geojson?: {
    features?: SearchV2Feature[];
  };
  listings?: MapListing[];
};

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;
const DETAIL_LINK_LIMIT = 8;
const SUSPENDED_OWNER_LISTING_ID = "e2e-contact-suspended-host";

async function waitForVisibleCards(page: Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  await expect(cards.first()).toBeAttached({ timeout: 30_000 });
  await expect
    .poll(() => cards.count(), {
      timeout: 30_000,
      message: "Expected visible search listing cards",
    })
    .toBeGreaterThan(0);
  return cards;
}

async function collectVisibleCardLinks(
  page: Page,
  limit = DETAIL_LINK_LIMIT
): Promise<LinkSample[]> {
  const cards = await waitForVisibleCards(page);
  const count = Math.min(await cards.count(), limit);
  const links: LinkSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const id =
      (await card.getAttribute("data-listing-id")) ??
      (await card.getAttribute("data-listing-card-id"));
    const href = await card
      .locator('[data-testid="listing-card-link"]')
      .first()
      .getAttribute("href");
    const text = (await card.innerText()).replace(/\s+/g, " ").trim();

    expect(id, `card ${index} should expose a listing id`).toBeTruthy();
    expect(href, `card ${index} should link to a listing detail route`).toMatch(
      /^\/listings\/[^?/#]+/
    );

    links.push({ id: id!, href: href!, text });
  }

  return links;
}

async function expectPublicDetailRenders(page: Page, href: string) {
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${href} should return a public detail page`).toBe(
    200
  );
  await expect(page).not.toHaveTitle(/Listing Not Found/i);
  await expect(
    page.getByRole("heading", { name: /listing not found/i })
  ).toHaveCount(0);
  await expect(page.locator("main")).toBeVisible();
}

async function expectDetailIdsRender(page: Page, ids: string[]) {
  expect(ids.length).toBeGreaterThan(0);

  for (const id of ids.slice(0, DETAIL_LINK_LIMIT)) {
    await expectPublicDetailRenders(page, `/listings/${id}`);
  }
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    )
  );
}

test.describe("anonymous search result detail links", () => {
  test("visible listing tab cards open public listing detail pages", async ({
    browser,
    page,
  }) => {
    await page.goto(SEARCH_URL);
    const links = await collectVisibleCardLinks(page);
    const opened: LinkSample[] = [];

    for (const link of links) {
      const detailPage = await browser.newPage();
      await expectPublicDetailRenders(detailPage, link.href);
      opened.push(link);
      await detailPage.close();
    }

    expect(opened.map((link) => link.id)).toEqual(links.map((link) => link.id));
  });

  test("mobile listing tab cards open public listing detail pages", async ({
    browser,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SEARCH_URL);
    const links = await collectVisibleCardLinks(page, 5);

    for (const link of links) {
      const detailPage = await browser.newPage();
      await expectPublicDetailRenders(detailPage, link.href);
      await detailPage.close();
    }
  });

  test("V2 cursor page results open public listing detail pages", async ({
    page,
    request,
  }) => {
    const firstResponse = await request.get(`/api/search/v2?v2=1&${boundsQS}`);
    expect(firstResponse.status()).toBe(200);
    const firstPayload = (await firstResponse.json()) as SearchV2Response & {
      list?: { nextCursor?: string | null };
    };
    expect(firstPayload.list?.nextCursor).toBeTruthy();

    const cursor = encodeURIComponent(firstPayload.list?.nextCursor ?? "");
    const nextResponse = await request.get(
      `/api/search/v2?v2=1&${boundsQS}&cursor=${cursor}`
    );
    expect(nextResponse.status()).toBe(200);
    const nextPayload = (await nextResponse.json()) as SearchV2Response;
    const nextPageIds = uniqueStrings(
      nextPayload.list?.fullItems?.map((item) => item.id) ?? []
    );

    await expectDetailIdsRender(page, nextPageIds);
  });

  test("V2 list, grouped member, and map payload ids resolve to public listing detail pages", async ({
    page,
    request,
  }) => {
    const response = await request.get(`/api/search/v2?v2=1&${boundsQS}`);
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as SearchV2Response;
    const listIds = uniqueStrings(
      payload.list?.fullItems?.map((item) => item.id) ?? []
    );
    const groupedMemberIds = uniqueStrings(
      payload.list?.fullItems?.flatMap(
        (item) =>
          item.groupSummary?.members?.map((member) => member.listingId) ?? []
      ) ?? []
    );
    const mapIds = uniqueStrings(
      payload.map?.geojson?.features?.map(
        (feature) => feature.properties?.id
      ) ?? []
    );

    await expectDetailIdsRender(page, listIds);
    await expectDetailIdsRender(page, groupedMemberIds);
    await expectDetailIdsRender(page, mapIds);
  });

  test("map-listings API ids resolve to public listing detail pages", async ({
    page,
    request,
  }) => {
    const response = await request.get(`/api/map-listings?${boundsQS}`);
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as MapListingsResponse;
    const ids = uniqueStrings([
      ...(payload.data?.listings?.map((listing) => listing.id) ?? []),
      ...(payload.listings?.map((listing) => listing.id) ?? []),
      ...(payload.geojson?.features?.map((feature) => feature.properties?.id) ??
        []),
    ]);

    await expectDetailIdsRender(page, ids);
  });

  test("suspended-owner listings do not render publicly or appear in search payloads", async ({
    page,
    request,
  }) => {
    const searchResponse = await request.get(`/api/search/v2?v2=1&${boundsQS}`);
    expect(searchResponse.status()).toBe(200);
    const searchPayload = (await searchResponse.json()) as SearchV2Response;
    const searchIds = uniqueStrings([
      ...(searchPayload.list?.fullItems?.map((item) => item.id) ?? []),
      ...(searchPayload.list?.fullItems?.flatMap(
        (item) =>
          item.groupSummary?.members?.map((member) => member.listingId) ?? []
      ) ?? []),
      ...(searchPayload.map?.geojson?.features?.map(
        (feature) => feature.properties?.id
      ) ?? []),
    ]);
    expect(searchIds).not.toContain(SUSPENDED_OWNER_LISTING_ID);

    const mapResponse = await request.get(`/api/map-listings?${boundsQS}`);
    expect(mapResponse.status()).toBe(200);
    const mapPayload = (await mapResponse.json()) as MapListingsResponse;
    const mapIds = uniqueStrings([
      ...(mapPayload.data?.listings?.map((listing) => listing.id) ?? []),
      ...(mapPayload.listings?.map((listing) => listing.id) ?? []),
      ...(mapPayload.geojson?.features?.map(
        (feature) => feature.properties?.id
      ) ?? []),
    ]);
    expect(mapIds).not.toContain(SUSPENDED_OWNER_LISTING_ID);

    await page.goto(SEARCH_URL);
    const visibleLinks = await collectVisibleCardLinks(page);
    expect(visibleLinks.map((link) => link.id)).not.toContain(
      SUSPENDED_OWNER_LISTING_ID
    );

    await page.goto(`/listings/${SUSPENDED_OWNER_LISTING_ID}`);
    await expect(page).toHaveTitle(/Listing Not Found/i);
  });

  test("invalid public listing ids still render not found", async ({
    page,
  }) => {
    await page.goto("/listings/does-not-exist-search-link-regression");

    await expect(page).toHaveTitle(/Listing Not Found/i);
  });
});
