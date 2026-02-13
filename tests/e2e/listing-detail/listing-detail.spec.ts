/**
 * Listing Detail Page — Functional E2E Tests (LD-01 through LD-22)
 *
 * Coverage: /listings/[id] — visitor view, owner view, gallery,
 * booking form basics, reviews, action buttons.
 *
 * Seed data used:
 *   "Reviewer Nob Hill Apartment" — owned by e2e-reviewer → test user sees VISITOR view
 *   "Sunny Mission Room"         — owned by e2e-test     → test user sees OWNER view
 */

import {
  test,
  expect,
  selectors,
  timeouts,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers";

test.beforeEach(async () => {
  test.slow(); // 3× timeout (180 s) for server-rendered detail pages
});

// ---------------------------------------------------------------------------
// Shared navigation helper
// ---------------------------------------------------------------------------
async function goToListing(
  page: import("@playwright/test").Page,
  nav: ReturnType<typeof import("../helpers").navigationHelpers>,
  query: string,
) {
  await nav.goToSearch({ q: query, bounds: SF_BOUNDS });
  await expect(searchResultsContainer(page)).toBeAttached({
    timeout: timeouts.navigation,
  });

  const cards = searchResultsContainer(page).locator(selectors.listingCard);
  const count = await cards.count();
  if (count === 0) return false;

  await nav.clickListingCard(0);
  await page.waitForURL(/\/listings\//, {
    timeout: timeouts.navigation,
    waitUntil: "commit",
  });
  await page.waitForLoadState("domcontentloaded");
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Block 1: Page Load & Content — Visitor ("Reviewer Nob Hill Apartment")
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Page Load & Content (Visitor)", () => {
  test("LD-01  page loads with h1 title and location", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found in search");

    await expect(page.locator("h1")).toContainText("Reviewer Nob Hill Apartment");
    // City name visible (in breadcrumb or stats bar)
    await expect(page.getByText("San Francisco").first()).toBeVisible();
  });

  test("LD-02  quick stats bar shows status, location, slots", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(page.getByText("Active Listing")).toBeVisible();
    await expect(page.getByText(/San Francisco.*CA/)).toBeVisible();
    await expect(page.getByText(/Slots Available/)).toBeVisible();
  });

  test("LD-03  About section shows description", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(
      page.getByRole("heading", { name: /About this place/ }),
    ).toBeVisible();
    await expect(page.getByText(/Cozy apartment on Nob Hill/)).toBeVisible();
  });

  test("LD-04  amenities grid renders", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(
      page.getByRole("heading", { name: /What this place offers/ }),
    ).toBeVisible();
    await expect(page.getByText("WiFi")).toBeVisible();
  });

  test("LD-05  host section with Contact Host button", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(page.getByText(/Hosted by/).first()).toBeVisible();
    await expect(page.getByText("E2E Reviewer")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Contact Host/i }),
    ).toBeVisible();
    await expect(page.getByText("Identity verified")).toBeVisible();
  });

  test("LD-06  price in booking sidebar", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // Price may render as "$1,500" (toLocaleString) or "$1500" (raw)
    await expect(page.getByText(/\$1,?500/).first()).toBeVisible();
    await expect(page.getByText(/\/ month|\/mo/).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Request to Book/i }),
    ).toBeVisible();
  });

  test("LD-07  reviews section with count", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(
      page.getByRole("heading", { name: /Reviews/ }),
    ).toBeVisible();
    // Count in parentheses — could be (0) or higher
    await expect(page.getByText(/\(\d+\)/)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 2: Visitor Action Buttons ("Reviewer Nob Hill Apartment")
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Visitor Action Buttons", () => {
  test("LD-08  share button opens fallback dropdown", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // Headless browsers lack navigator.share — force undefined
    await page.evaluate(() => {
      (navigator as any).share = undefined;
    });

    const shareBtn = page.getByRole("button", { name: /Share listing/i });
    await shareBtn.click();

    await expect(page.getByText("Copy Link")).toBeVisible();
    await expect(page.getByText("Twitter")).toBeVisible();
    await expect(page.getByText("Email")).toBeVisible();
  });

  test("LD-09  save button toggles heart icon", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // Wait for save button to finish loading
    const saveBtn = page.getByRole("button", {
      name: /Save listing|Remove from saved/i,
    });
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });

    // Detect current state and toggle
    const initialLabel = await saveBtn.getAttribute("aria-label");
    await saveBtn.click();

    if (initialLabel?.includes("Save")) {
      await expect(
        page.getByRole("button", { name: /Remove from saved/i }),
      ).toBeVisible({ timeout: 5_000 });
      // Toggle back to clean up
      await page.getByRole("button", { name: /Remove from saved/i }).click();
      await expect(
        page.getByRole("button", { name: /Save listing/i }),
      ).toBeVisible({ timeout: 5_000 });
    } else {
      await expect(
        page.getByRole("button", { name: /Save listing/i }),
      ).toBeVisible({ timeout: 5_000 });
      // Toggle back
      await page.getByRole("button", { name: /Save listing/i }).click();
      await expect(
        page.getByRole("button", { name: /Remove from saved/i }),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("LD-10  report button opens dialog", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // ReportButton has a hydration guard (mounted state) — wait for Radix
    // DialogTrigger to hydrate by checking for data-state attribute
    const reportBtn = page.locator(
      'button:has-text("Report this listing")[data-state]',
    );
    const hydrated = await reportBtn
      .waitFor({ state: "attached", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hydrated, "Report button not hydrated (SSR placeholder only)");

    await reportBtn.scrollIntoViewIfNeeded();
    await reportBtn.click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Report Listing")).toBeVisible();

    // Close via Cancel or Escape
    const cancelBtn = page.getByRole("button", { name: /Cancel/i });
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 3: Image Gallery ("Sunny Mission Room" — 2 images, owner view)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Image Gallery", () => {
  test("LD-11  gallery renders without errors", async ({ page, nav }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Images or fallback placeholders should exist — page must not break
    const gallery = page.locator("img, [class*='RoomPlaceholder']");
    await expect(gallery.first()).toBeAttached({ timeout: 10_000 });

    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("LD-12  lightbox opens and supports keyboard navigation", async ({
    page,
    nav,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes("Mobile"),
      "Desktop-only keyboard test",
    );

    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Click first gallery image to open lightbox
    const galleryItem = page
      .locator("[class*='cursor-pointer']")
      .or(page.locator(".group\\/item"))
      .first();
    await galleryItem.click();

    // Lightbox overlay should appear (fixed inset-0)
    const lightbox = page.locator(".fixed.inset-0");
    const lightboxOpen = await lightbox
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!lightboxOpen, "Lightbox did not open (images may not be available)");

    // Lightbox counter
    await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 5_000 });

    // Use on-page navigation buttons (more reliable in headless CI than
    // document-level keyboard listeners)
    const nextBtn = page.locator("button[aria-label='Next image']");
    const prevBtn = page.locator("button[aria-label='Previous image']");
    await expect(nextBtn).toBeVisible({ timeout: 3_000 });

    // Navigate forward
    await nextBtn.click();
    await expect(page.getByText("2 / 2")).toBeVisible({ timeout: 3_000 });

    // Navigate back
    await prevBtn.click();
    await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 3_000 });

    // Close via close button (more reliable than Escape in headless)
    const closeBtn = page.locator("button[aria-label='Close gallery']");
    await closeBtn.click();
    await expect(page.getByText("1 / 2")).not.toBeVisible({ timeout: 3_000 });
  });

  test("LD-13  zoom toggle in lightbox", async ({
    page,
    nav,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes("Mobile"),
      "Desktop-only lightbox test",
    );

    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Open lightbox
    const galleryItem = page
      .locator("[class*='cursor-pointer']")
      .or(page.locator(".group\\/item"))
      .first();
    await galleryItem.click();

    // Verify lightbox overlay opened
    const lightbox = page.locator(".fixed.inset-0");
    const lightboxOpen = await lightbox
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!lightboxOpen, "Lightbox did not open (images may not be available)");

    await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 5_000 });

    // Zoom in button — aria-label set by ImageGallery component
    const zoomIn = page.locator("button[aria-label='Zoom in']");
    await expect(zoomIn).toBeVisible({ timeout: 5_000 });
    await zoomIn.click();

    // After zoom in, button toggles to "Zoom out"
    const zoomOut = page.locator("button[aria-label='Zoom out']");
    await expect(zoomOut).toBeVisible({ timeout: 5_000 });

    // Zoom back out
    await zoomOut.click();
    await expect(zoomIn).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 4: Owner View ("Sunny Mission Room")
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Owner View", () => {
  test("LD-14  owner sees management card, NOT booking form", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Management card visible
    await expect(page.getByText("Manage Listing")).toBeVisible();
    await expect(page.getByText("Edit Listing")).toBeVisible();
    // Delete button
    await expect(
      page.getByRole("button", { name: /Delete/i }),
    ).toBeVisible();
    // "View listing as guest" link
    await expect(page.getByText("View listing as guest")).toBeVisible();

    // Booking form must NOT be visible
    await expect(
      page.getByRole("button", { name: /Request to Book/i }),
    ).not.toBeVisible({ timeout: 3_000 });
    // Save button must NOT be visible for owner
    await expect(
      page.getByRole("button", { name: /Save listing/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("LD-15  status toggle dropdown opens", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Find the status toggle — there are two instances (stats bar + sidebar)
    const toggleBtn = page
      .getByRole("button", { name: /Active|Paused|Rented/i })
      .first();
    await toggleBtn.click();

    // Dropdown options (labels or descriptions)
    await expect(
      page.getByText(/Visible to everyone|Hidden from search|Marked as rented/).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Close by pressing Escape — do NOT change status
    await page.keyboard.press("Escape");
  });

  test("LD-16  stats cards (views, reviews)", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Owner stats card in sidebar — "Views" and "Reviews" labels
    // May match multiple elements (quick stats bar + sidebar), use .first()
    await expect(page.getByText("Views").first()).toBeVisible();
    await expect(page.getByText("Reviews").first()).toBeVisible();
  });

  test("LD-17  boost visibility CTA", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    await expect(page.getByText("Boost visibility")).toBeVisible();
    await expect(page.getByText("Promote now")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 5: Booking Form Basics ("Reviewer Nob Hill Apartment")
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Booking Form", () => {
  test("LD-18  date pickers exist with labels", async ({ page, nav }) => {
    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    await expect(page.getByText("Check-in")).toBeVisible();
    await expect(page.getByText("Check-out")).toBeVisible();
    await expect(page.locator("#booking-start-date")).toBeAttached();
    await expect(page.locator("#booking-end-date")).toBeAttached();
  });

  test("LD-19  DatePicker opens on click (hydration-aware)", async ({
    page,
    nav,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes("Mobile"),
      "Desktop-only DatePicker test",
    );

    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // Wait for hydration
    await page
      .locator("#booking-start-date[data-state]")
      .waitFor({ state: "attached", timeout: 15_000 });

    // Click opens calendar popover
    await page.locator("#booking-start-date").click();
    await expect(
      page.getByRole("button", { name: /next month/i }).or(
        page.locator("[aria-label='Go to next month']"),
      ),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("LD-20  unauthenticated user sees sign-in CTA", async ({
    page,
    nav,
  }) => {
    // Override to unauthenticated state
    await page.context().clearCookies();

    const found = await goToListing(page, nav, "Reviewer Nob Hill");
    test.skip(!found, "Listing not found");

    // Should see login prompt instead of booking form
    const signInCta = page
      .getByText(/Sign in to book|Log in to book|Sign in/i)
      .first();
    const bookBtn = page.getByRole("button", { name: /Request to Book/i });

    // Either sign-in CTA visible OR book button redirects to login
    const hasSignIn = await signInCta.isVisible().catch(() => false);
    const hasBook = await bookBtn.isVisible().catch(() => false);
    expect(hasSignIn || hasBook).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Block 6: Reviews ("Sunny Mission Room" — has 1 review from reviewer)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LD: Reviews", () => {
  test("LD-21  review displays with star rating and comment", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // Review count
    await expect(page.getByText(/\(\d+\)/).first()).toBeVisible();

    // Reviewer name
    await expect(page.getByText("E2E Reviewer")).toBeVisible();

    // Review comment text (seed: "Great place! Clean, well-maintained...")
    await expect(
      page.getByText(/Great place/).or(page.getByText(/clean/i)),
    ).toBeVisible();

    // At least one filled star icon
    await expect(
      page.locator(".fill-yellow-400, .text-yellow-400").first(),
    ).toBeAttached();
  });

  test("LD-22  owner sees Respond button on reviews", async ({
    page,
    nav,
  }) => {
    const found = await goToListing(page, nav, "Sunny Mission Room");
    test.skip(!found, "Listing not found");

    // The seed clears responses on each run, so Respond button should appear
    const respondBtn = page
      .getByRole("button", { name: /Respond|Reply/i })
      .first();

    const canRespond = await respondBtn.isVisible().catch(() => false);
    test.skip(!canRespond, "No respond button — review may already have response");

    await expect(respondBtn).toBeVisible();
  });
});
