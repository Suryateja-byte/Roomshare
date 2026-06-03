import fs from "node:fs";
import path from "node:path";

import { expect, test } from "../helpers";

const REVIEWER_LISTING_TITLE = "Reviewer Nob Hill Apartment";
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function reviewerListingId(): string | null {
  const manifestPath = path.join(process.cwd(), "playwright/.cache/e2e-seed.json");

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    listingsByTitle?: Record<string, string>;
  };

  return manifest.listingsByTitle?.[REVIEWER_LISTING_TITLE] ?? null;
}

async function mockListingImages(page: import("@playwright/test").Page) {
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: transparentPng,
    })
  );
  await page.route("**/*supabase.co/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: transparentPng,
    })
  );
}

async function openReviewerListing(page: import("@playwright/test").Page) {
  const listingId = reviewerListingId();
  test.skip(!listingId, "Reviewer listing seed manifest missing");
  if (!listingId) return;

  await mockListingImages(page);
  await page.goto(`/listings/${listingId}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: REVIEWER_LISTING_TITLE })
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("Contact Host listing detail runtime", () => {
  test.slow();

  test("authenticated non-owner sees contact-first CTA", async ({ page }) => {
    await openReviewerListing(page);

    await expect(page.getByText(/hosted by e2e reviewer/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const contactRegion = page
      .locator(
        '[data-testid="contact-host-host-section"], [data-testid="contact-host-sidebar"]'
      )
      .filter({ hasText: /contact host to confirm availability/i })
      .first();

    await expect(
      contactRegion.getByText(/contact host to confirm availability/i)
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      contactRegion.getByTestId("availability-badge")
    ).toBeVisible();
    await expect(
      contactRegion.getByText(
        /no booking request or hold is created from this page/i
      )
    ).toBeVisible();

    await expect(contactRegion).toBeVisible();
    await expect(
      contactRegion
        .getByRole("button", { name: /contact host|unlock to contact/i })
        .or(contactRegion.getByRole("link", { name: /verify email|sign in/i }))
        .first()
    ).toBeVisible();
  });
});

test.describe("Contact Host listing detail runtime anonymous", () => {
  test.slow();
  test.use({ storageState: { cookies: [], origins: [] } });

  test("anonymous visitor sees sign-in-to-contact CTA", async ({ page }) => {
    await openReviewerListing(page);

    await expect(
      page.getByRole("link", { name: /sign in to contact host/i }).first()
    ).toBeVisible({ timeout: 45_000 });
  });
});
