/**
 * Dedicated owner-management coverage for listing status and delete flows.
 *
 * These tests intentionally avoid final destructive deletion. The delete test
 * verifies the visible preflight, confirmation, and password-confirmation path,
 * then cancels before the DELETE request can be submitted.
 */

import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "../helpers";
import { seedListingId } from "./seed-manifest";

const OWNER_LISTING_TITLE = "Sunny Mission Room";

function getRequiredSeedListingId(title: string): string {
  const listingId = seedListingId(title);
  if (!listingId) {
    throw new Error(`Missing E2E seed listing id for "${title}"`);
  }
  return listingId;
}

async function openOwnerListing(page: Page, listingId: string): Promise<void> {
  await page.goto(`/listings/${listingId}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByText("Manage Listing").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("body")).toBeVisible();
}

async function setStatusFromDetail(
  page: Page,
  fromLabel: "Active" | "Paused" | "Rented",
  optionDescription:
    | "Visible to everyone"
    | "Hidden from search"
    | "Marked as rented"
): Promise<void> {
  const statusButtons = page.getByRole("button", {
    name: new RegExp(`^${fromLabel}$`, "i"),
  });
  const option = page.getByText(optionDescription).first();
  const count = await statusButtons.count();

  for (let index = 0; index < count; index += 1) {
    await statusButtons.nth(index).click();
    const opened = await option
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await option.click();
      return;
    }
  }

  throw new Error(`Could not open ${fromLabel} status menu`);
}

async function currentStatusLabel(
  page: Page
): Promise<"Active" | "Paused" | "Rented"> {
  for (const label of ["Active", "Paused", "Rented"] as const) {
    const trigger = page
      .getByRole("button", { name: new RegExp(`^${label}$`, "i") })
      .first();
    if (await trigger.isVisible().catch(() => false)) {
      return label;
    }
  }

  throw new Error("Could not find visible listing status trigger");
}

async function setStatusTo(
  page: Page,
  target: "Active" | "Paused" | "Rented"
): Promise<void> {
  const current = await currentStatusLabel(page);
  if (current === target) {
    return;
  }

  const descriptions = {
    Active: "Visible to everyone",
    Paused: "Hidden from search",
    Rented: "Marked as rented",
  } as const;

  await setStatusFromDetail(page, current, descriptions[target]);
  await expect(
    page.getByRole("button", { name: new RegExp(`^${target}$`, "i") }).first()
  ).toBeVisible({ timeout: 10_000 });
}

test.describe.serial("Listing Management - Status And Delete", () => {
  test("LM-STATUS-01: owner pauses and reactivates a listing from detail", async ({
    page,
  }) => {
    const listingId = getRequiredSeedListingId(OWNER_LISTING_TITLE);
    await openOwnerListing(page, listingId);
    await setStatusTo(page, "Active");

    let paused = false;
    try {
      await expect(
        page.getByRole("button", { name: /^Active$/ }).first()
      ).toBeEnabled({ timeout: 10_000 });

      await setStatusTo(page, "Paused");
      paused = true;

      await setStatusTo(page, "Active");
      paused = false;

      await expect(
        page.getByRole("button", { name: /^Active$/ }).first()
      ).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain(`/listings/${listingId}`);
    } finally {
      if (paused) {
        await page.goto(`/listings/${listingId}`, {
          waitUntil: "domcontentloaded",
        });
        const pausedToggle = page
          .getByRole("button", { name: /^Paused$/ })
          .first();
        if (await pausedToggle.isVisible().catch(() => false)) {
          await setStatusTo(page, "Active");
        }
      }
    }
  });

  test("LM-DELETE-01: owner can open delete confirmation and cancel before deletion", async ({
    page,
  }) => {
    const listingId = getRequiredSeedListingId(OWNER_LISTING_TITLE);
    await openOwnerListing(page, listingId);

    const deleteButton = page
      .getByRole("button", { name: /^Delete Listing$/ })
      .first();
    await expect(deleteButton).toBeVisible();

    let canDeleteChecks = 0;
    await page.route(`**/api/listings/${listingId}/can-delete`, async (route) => {
      canDeleteChecks += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ activeConversations: 1 }),
      });
    });

    const confirmationMessage = page.getByText(
      "Are you sure? This action cannot be undone."
    );

    await expect(async () => {
      if (await confirmationMessage.isVisible().catch(() => false)) {
        return;
      }

      await deleteButton.click();
      await expect(confirmationMessage).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    await expect(confirmationMessage).toBeVisible({ timeout: 10_000 });
    expect(canDeleteChecks).toBeGreaterThan(0);
    await expect(page.getByText("This will affect active users")).toBeVisible();
    await expect(page.getByText("1 conversation")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Delete Anyway$/ })
    ).toBeVisible();

    await page.getByRole("button", { name: /^Delete Anyway$/ }).click();

    const passwordDialog = page.getByRole("dialog", {
      name: /^Delete Listing$/,
    });
    await expect(passwordDialog).toBeVisible({ timeout: 10_000 });
    await expect(
      passwordDialog.getByText(/permanently delete your listing/i)
    ).toBeVisible();
    await expect(
      passwordDialog.getByRole("button", { name: /^Delete Listing$/ })
    ).toBeVisible();

    await passwordDialog.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(passwordDialog).not.toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(
      page.getByRole("button", { name: /^Delete Listing$/ }).first()
    ).toBeVisible();
    expect(page.url()).toContain(`/listings/${listingId}`);
  });
});
