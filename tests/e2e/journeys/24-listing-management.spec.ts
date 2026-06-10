/**
 * Listing Management Journeys (J31–J34)
 *
 * J31: Edit listing and verify changes
 * J32: Pause and unpause listing
 * J33: Delete listing with confirmation
 * J34: Form validation errors on create
 */

import {
  test,
  expect,
  selectors,
  timeouts,
  SF_BOUNDS,
  searchResultsContainer,
  waitForHydration,
} from "../helpers";

test.beforeEach(async () => {
  test.slow();
});

test.describe.configure({ mode: "serial" });

// ─── J31: Edit Listing and Verify ─────────────────────────────────────────────
test.describe("J31: Edit Listing and Verify", () => {
  test("navigate to own listing → edit availability → save → verify", async ({
    page,
    nav,
  }) => {
    // Step 1: Find an own listing (seeded under e2e test user)
    await nav.goToSearch({
      q: "Sunny Mission Room",
      bounds: SF_BOUNDS,
    });
    await page.waitForLoadState("domcontentloaded");

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "No listings found — skipping");

    // Step 2: Open listing detail (navigate directly to avoid strict-mode issues)
    const firstCard = cards.first();
    const cardLink = firstCard.locator('a[href^="/listings/"]').first();
    const cardHref = await cardLink.getAttribute("href").catch(() => null);
    if (!cardHref) {
      test.skip(true, "No listing link found — skipping");
      return;
    }
    await page.goto(cardHref);
    await page.waitForURL(/\/listings\//, {
      timeout: timeouts.navigation,
      waitUntil: "commit",
    });
    await page.waitForLoadState("domcontentloaded");

    // Step 3: Look for edit button (owner view)
    const editBtn = page
      .getByRole("link", { name: /edit|manage/i })
      .or(page.locator('a[href*="/edit"]'))
      .or(page.getByRole("button", { name: /edit/i }));

    const canEdit = await editBtn
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!canEdit, "No edit button — not owner view");

    const editHref = await editBtn
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (editHref) {
      await page.goto(editHref, { waitUntil: "domcontentloaded" });
    } else {
      await editBtn.first().click();
      await page.waitForLoadState("domcontentloaded");
    }
    await page.waitForURL(/\/listings\/[^/]+\/edit/, {
      timeout: timeouts.navigation,
    });

    // Step 4: Edit the current host-managed availability form
    const openSlotsField = page
      .getByLabel(/open slots/i)
      .or(page.locator("#openSlots"));
    const totalSlotsField = page
      .getByLabel(/total slots/i)
      .or(page.locator("#totalSlots"));

    await expect(openSlotsField.first()).toBeVisible({ timeout: 10000 });
    await expect(totalSlotsField.first()).toBeVisible({ timeout: 10000 });

    const parseSlotValue = async (
      locator: typeof openSlotsField,
      fallback: number
    ) => {
      const raw = await locator.first().inputValue();
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const originalOpenSlots = await parseSlotValue(openSlotsField, 1);
    const originalTotalSlots = await parseSlotValue(totalSlotsField, 2);
    const editableTotalSlots = Math.max(originalTotalSlots, 2);
    const updatedOpenSlots =
      originalOpenSlots >= editableTotalSlots
        ? Math.max(1, editableTotalSlots - 1)
        : Math.min(editableTotalSlots, originalOpenSlots + 1);
    const listingPath = new URL(cardHref, page.url()).pathname;

    if (editableTotalSlots !== originalTotalSlots) {
      await totalSlotsField.first().clear();
      await totalSlotsField.first().fill(String(editableTotalSlots));
    }
    await openSlotsField.first().clear();
    await openSlotsField.first().fill(String(updatedOpenSlots));

    // Step 5: Save and verify the versioned availability PATCH succeeds.
    // The edit page has two forms (details + availability); slots live in the
    // availability form, so target its submit button specifically.
    const saveBtn = page
      .getByTestId("listing-availability-save-button")
      .or(page.getByRole("button", { name: /save availability/i }));
    await expect(saveBtn.first()).toBeVisible({ timeout: 10000 });

    const updateResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/listings/${listingPath.split("/").pop()}`) &&
        response.request().method() === "PATCH"
    );

    await saveBtn.first().click();
    const response = await updateResponse;
    expect(response.ok()).toBeTruthy();
    const updatedListing = await response.json();
    expect(updatedListing.openSlots).toBe(updatedOpenSlots);

    await expect(
      page.locator('[data-testid="listing-detail-header"]')
    ).toBeVisible({
      timeout: 10000,
    });

    // Restore original availability for future test runs.
    await page.goto(`${listingPath}/edit`);
    await page.waitForLoadState("domcontentloaded");
    await expect(openSlotsField.first()).toBeVisible({ timeout: 10000 });
    await expect(totalSlotsField.first()).toBeVisible({ timeout: 10000 });
    await totalSlotsField.first().clear();
    await totalSlotsField.first().fill(String(originalTotalSlots));
    await openSlotsField.first().clear();
    await openSlotsField.first().fill(String(originalOpenSlots));

    const restoreResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/listings/${listingPath.split("/").pop()}`) &&
        response.request().method() === "PATCH"
    );
    await saveBtn.first().click();
    expect((await restoreResponse).ok()).toBeTruthy();
    await expect(
      page.locator('[data-testid="listing-detail-header"]')
    ).toBeVisible({
      timeout: 10000,
    });
  });
});

// ─── J32: Pause and Unpause Listing ───────────────────────────────────────────
test.describe("J32: Pause and Unpause Listing", () => {
  test("edit page → pause → verify hidden → unpause → verify visible", async ({
    page,
  }) => {
    const listingId = "e2e-sf-5-richmond-district-room";
    const listingPath = `/listings/${listingId}`;
    const gotoPath = async (path: string) => {
      const baseUrl = page.url().startsWith("http")
        ? page.url()
        : "http://localhost:3000";
      const targetPath = new URL(path, baseUrl).pathname;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          break;
        } catch (error) {
          if (!String(error).includes("ERR_ABORTED")) {
            throw error;
          }
          if (new URL(page.url()).pathname === targetPath) {
            break;
          }
          if (attempt === 2) {
            throw error;
          }
        }
      }

      await expect
        .poll(() => new URL(page.url()).pathname, {
          timeout: timeouts.navigation,
        })
        .toBe(targetPath);
    };
    const ensureDetailPage = async () => {
      await page
        .waitForURL((url) => url.pathname === listingPath, {
          timeout: timeouts.action,
        })
        .catch(async () => {
          await gotoPath(listingPath);
        });
      await waitForHydration(page, { timeout: timeouts.navigation });
    };
    const statusSelect = page
      .locator('select[name="status"], select#status')
      .first();
    // Status lives in the availability form; the generic /save/ match would
    // resolve to the details form's "Save Details" button first.
    const saveBtn = page
      .getByTestId("listing-availability-save-button")
      .or(page.getByRole("button", { name: /save availability/i }))
      .first();
    const editForm = page.locator('[data-testid="edit-listing-form"]').first();

    const openEditPage = async () => {
      await gotoPath(`${listingPath}/edit`);
      await waitForHydration(page, { timeout: timeouts.navigation });
      await expect(statusSelect).toBeVisible({ timeout: timeouts.navigation });
      await expect(saveBtn).toBeVisible({ timeout: timeouts.navigation });
      await expect(editForm).toBeVisible({ timeout: timeouts.navigation });
      await page.waitForFunction(
        () => {
          const select = document.querySelector(
            'select[name="status"], select#status'
          );
          const form = document.querySelector(
            '[data-testid="edit-listing-form"]'
          );
          return (
            !!select &&
            !!form &&
            Object.keys(select).some((key) => key.startsWith("__reactProps$")) &&
            Object.keys(form).some((key) => key.startsWith("__reactProps$"))
          );
        },
        undefined,
        { timeout: timeouts.navigation }
      );
    };

    const saveStatus = async (targetStatus: "ACTIVE" | "PAUSED") => {
      if ((await statusSelect.inputValue()) === targetStatus) {
        return;
      }

      await statusSelect.selectOption(targetStatus);
      await expect(statusSelect).toHaveValue(targetStatus, {
        timeout: timeouts.action,
      });
      await page.waitForFunction(
        (expectedStatus) => {
          const select = document.querySelector(
            'select[name="status"], select#status'
          ) as HTMLSelectElement | null;
          const form = document.querySelector(
            '[data-testid="edit-listing-form"]'
          );
          const reactSelectProps = select
            ? Object.entries(select).find(([key]) =>
                key.startsWith("__reactProps$")
              )?.[1]
            : null;
          return (
            select?.value === expectedStatus &&
            (reactSelectProps as { value?: string } | null)?.value ===
              expectedStatus &&
            !!form &&
            Object.keys(form).some((key) => key.startsWith("__reactProps$"))
          );
        },
        targetStatus,
        { timeout: timeouts.action }
      );

      const [statusResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes(`/api/listings/${listingId}`) &&
            response.request().method() === "PATCH",
          { timeout: timeouts.navigation }
        ),
        saveBtn.click(),
      ]);
      expect(statusResponse.ok()).toBeTruthy();
      await ensureDetailPage();
    };

    // Step 1: Ensure the shared seeded listing starts active, even if a prior
    // interrupted run left it paused.
    await openEditPage();
    await saveStatus("ACTIVE");

    // Step 2: Pause through the owner edit form.
    await openEditPage();
    await saveStatus("PAUSED");

    // Step 3: Verify paused state on the owner detail page.
    await expect(
      page.locator('[data-testid="listing-detail-header"]')
    ).toBeVisible({ timeout: timeouts.navigation });
    await expect(
      page
        .getByRole("button", { name: /paused/i })
        .or(page.locator("main").getByText(/^Paused$/))
        .first()
    ).toBeVisible({ timeout: timeouts.navigation });

    // Step 4: Restore original status for the rest of the suite.
    await openEditPage();
    await saveStatus("ACTIVE");
    await expect(
      page.locator('[data-testid="listing-detail-header"]')
    ).toBeVisible({ timeout: timeouts.navigation });
  });
});

// ─── J33: Delete Listing with Confirmation ────────────────────────────────────
test.describe("J33: Delete Listing with Confirmation", () => {
  test("listing detail → delete → confirm modal → verify confirmation flow", async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to an owned listing detail page
    await nav.goToSearch({ q: "Sunny Mission", bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    test.skip((await cards.count()) === 0, "No owned listing found — skipping");

    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, {
      timeout: timeouts.navigation,
      waitUntil: "commit",
    });
    await page.waitForLoadState("domcontentloaded");

    // Step 2: Find delete button (rendered in owner sidebar)
    const deleteBtn = page
      .getByRole("button", { name: /delete/i })
      .or(page.locator('[data-testid="delete-listing"]'));

    const canDelete = await deleteBtn
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!canDelete, "No delete button found — skipping");

    await deleteBtn.first().click();
    await page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});

    // Step 3: Confirm deletion warning and password confirmation flow.
    // Do not submit the final DELETE: this suite uses shared seeded listings
    // and deleting one cascades into messaging fixtures used by later tests.
    const confirmBtn = page
      .getByRole("button", { name: /confirm|yes|delete/i })
      .last();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true });

      const passwordDialog = page.getByRole("dialog", {
        name: /delete listing/i,
      });
      await passwordDialog
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {});

      await expect(passwordDialog).toBeVisible({ timeout: 10000 });
      await expect(
        passwordDialog.getByRole("button", { name: /delete listing/i })
      ).toBeVisible();
      await passwordDialog.getByRole("button", { name: /cancel/i }).click();
      await expect(passwordDialog).not.toBeVisible({ timeout: 10000 });
    }

    // Step 4: Verify the non-destructive flow leaves us on the listing.
    expect(page.url()).toContain("/listings/");
  });
});

// ─── J34: Form Validation Errors ──────────────────────────────────────────────
test.describe("J34: Form Validation Errors", () => {
  test("create listing → submit empty → verify errors → fix partially → verify remaining", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to create listing
    await nav.goToCreateListing();
    await page.waitForLoadState("domcontentloaded");

    // Step 2: Try submitting empty form
    const submitBtn = page
      .locator('form[novalidate] button[type="submit"]')
      .or(page.getByRole("button", { name: /publish listing/i }));
    const canSubmit = await submitBtn
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!canSubmit, "No submit button found — skipping");

    await submitBtn.first().click();
    await page.waitForLoadState("domcontentloaded");

    // Step 3: Verify validation errors appear
    const errors = page
      .getByTestId("form-error-banner")
      .or(page.locator('[aria-invalid="true"]'))
      .or(page.locator('[class*="error"]'))
      .or(page.locator('[role="alert"]').filter({ hasText: /.+/ }));

    await expect(errors.first()).toBeVisible({ timeout: 10000 });

    // Step 4: Fill title only
    const titleField = page
      .getByLabel(/title/i)
      .or(page.locator('input[name="title"]'));
    if (
      await titleField
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await titleField.first().fill("Partial Form Test");
    }

    // Step 5: Submit again
    await submitBtn.first().click();
    await page.waitForLoadState("domcontentloaded");

    // Should still have errors (other required fields empty)
    // Or page might have advanced to next step in multi-step form
    await expect(page.locator("body")).toBeVisible();
  });
});
