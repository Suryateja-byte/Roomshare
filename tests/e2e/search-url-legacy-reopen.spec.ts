import { test, expect, SF_BOUNDS } from "./helpers/test-utils";
import {
  getListingIds,
  readSearchShellMeta,
  waitForSearchResolution,
} from "./helpers/search-release-gate-helpers";

function buildBoundsParams(): URLSearchParams {
  return new URLSearchParams({
    minLat: String(SF_BOUNDS.minLat),
    maxLat: String(SF_BOUNDS.maxLat),
    minLng: String(SF_BOUNDS.minLng),
    maxLng: String(SF_BOUNDS.maxLng),
  });
}

function buildLegacyUrl(): string {
  const params = buildBoundsParams();
  params.set("minBudget", "500");
  return `/search?${params.toString()}`;
}

function buildCanonicalUrl(): string {
  const params = buildBoundsParams();
  params.set("minPrice", "500");
  return `/search?${params.toString()}`;
}

test.describe("Legacy search URL reopen", () => {
  test("legacy URLs rewrite to canonical output and render the same result set", async ({
    page,
  }) => {
    await page.goto(buildLegacyUrl());
    await page.waitForLoadState("domcontentloaded");
    await waitForSearchResolution(page);

    const rewrittenUrl = new URL(page.url());
    expect(rewrittenUrl.searchParams.get("minPrice")).toBe("500");
    expect(rewrittenUrl.searchParams.has("minBudget")).toBe(false);

    const legacyShellMeta = await readSearchShellMeta(page);
    const legacyListingIds = await getListingIds(page);

    await page.goto(buildCanonicalUrl());
    await page.waitForLoadState("domcontentloaded");
    await waitForSearchResolution(page);

    const canonicalShellMeta = await readSearchShellMeta(page);
    const canonicalListingIds = await getListingIds(page);

    expect(legacyShellMeta.queryHash).toBe(canonicalShellMeta.queryHash);
    expect(legacyListingIds).toEqual(canonicalListingIds);
  });
});
