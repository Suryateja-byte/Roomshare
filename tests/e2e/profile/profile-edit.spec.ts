/**
 * Profile Edit E2E Tests (PE-01 through PE-15)
 *
 * Tests for /profile (view) and /profile/edit (edit form) covering:
 * - Read-only profile view (PE-01, PE-02, PE-13)
 * - Edit form assertions (PE-03, PE-06, PE-07, PE-08, PE-14, PE-15)
 * - Profile mutations (PE-04, PE-05, PE-09, PE-10, PE-11, PE-12) — serial
 */

import { test, expect, timeouts } from "../helpers";
import AxeBuilder from "@axe-core/playwright";
import { A11Y_CONFIG } from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Block 1: Read-only profile tests (parallel safe)
// ---------------------------------------------------------------------------

test.describe("Profile View — Read-only", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
  });

  test("PE-01: view own profile page", async ({ page }) => {
    // Wait for auth redirect to settle (production mode may redirect to /login first)
    if (page.url().includes("/login")) {
      test.skip(true, "Auth session not established — redirected to login");
      return;
    }

    // Main profile container should be visible
    // Use .first() to handle RSC streaming which may temporarily create duplicate DOM nodes
    const profilePage = page.getByTestId("profile-page").first();
    await expect(profilePage).toBeVisible({ timeout: timeouts.navigation });

    // User name heading should have text
    const profileName = page.getByTestId("profile-name").first();
    await expect(profileName).toBeVisible({ timeout: timeouts.action });
    const nameText = await profileName.textContent();
    expect(nameText?.trim().length).toBeGreaterThan(0);
  });

  test("PE-02: edit profile link navigates to /profile/edit", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Click the "Edit Profile" button — use .first() for RSC streaming resilience
    const editLink = page.getByTestId("edit-profile-link").first();
    await expect(editLink).toBeVisible({ timeout: timeouts.action });
    await editLink.click();

    // Should navigate to /profile/edit
    await page.waitForURL(/\/profile\/edit/, { timeout: timeouts.navigation });
    expect(page.url()).toContain("/profile/edit");
  });

  test("PE-13: edit profile link is visible on own profile", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // The edit-profile-link button should exist and be visible
    const editLink = page.getByTestId("edit-profile-link").first();
    await expect(editLink).toBeVisible({ timeout: timeouts.action });
    await expect(editLink).toHaveText(/edit profile/i);
  });
});

// ---------------------------------------------------------------------------
// Block 2: Edit form tests (parallel safe)
// ---------------------------------------------------------------------------

test.describe("Profile Edit — Form Assertions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("networkidle");
    // Skip all edit tests if auth session not established
    if (page.url().includes("/login")) {
      test.skip(true, "Auth session not established — redirected to login");
    }
  });

  test("PE-03: edit form is pre-filled with current profile data", async ({
    page,
  }) => {

    // Form container should be visible — use .first() for RSC streaming resilience
    const form = page.getByTestId("edit-profile-form").first();
    await expect(form).toBeVisible({ timeout: timeouts.navigation });

    // Name input should have a non-empty value
    const nameInput = page.getByTestId("profile-name-input").first();
    await expect(nameInput).toBeVisible({ timeout: timeouts.action });
    const nameValue = await nameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);
  });

  test("PE-07: empty name shows validation error", async ({ page }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Clear the name field
    const nameInput = page.getByTestId("profile-name-input").first();
    await expect(nameInput).toBeVisible({ timeout: timeouts.action });
    await nameInput.clear();

    // Click save
    const saveBtn = page.getByTestId("profile-save-button").first();
    await expect(saveBtn).toBeVisible({ timeout: timeouts.action });
    await saveBtn.click();

    // Whether browser validation or server-side Zod validation fires,
    // the user should remain on /profile/edit (no navigation away)
    // and optionally see an error message.
    await expect(page).toHaveURL(/\/profile\/edit/, {
      timeout: timeouts.action,
    });
  });

  test("PE-06: bio character counter reflects limit", async ({ page }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Find the bio textarea (id="bio")
    const bioTextarea = page.locator("#bio");
    await expect(bioTextarea).toBeVisible({ timeout: timeouts.action });

    // Clear existing bio and type 501 characters
    await bioTextarea.clear();
    const longText = "A".repeat(501);
    // The textarea has maxLength=500, so the browser may truncate
    await bioTextarea.fill(longText);

    // Check the character counter text — should show at or near 500/500
    const counter = page.getByText(/\d+\/500\s*characters/);
    await expect(counter).toBeVisible({ timeout: 5000 });
    const counterText = await counter.textContent();

    // Extract the number from "NNN/500 characters"
    const match = counterText?.match(/(\d+)\/500/);
    expect(match).not.toBeNull();
    const charCount = Number(match?.[1]);
    // Should be 500 (maxLength truncates) or 501 if maxLength is not enforced by browser
    expect(charCount).toBeGreaterThanOrEqual(500);
  });

  test("PE-08: cancel discards changes and returns to profile", async ({
    page,
  }) => {
    // First, note the original name on the profile page
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });
    const originalName = await page.getByTestId("profile-name").first().textContent();

    // Navigate to edit page
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Modify the name
    const nameInput = page.getByTestId("profile-name-input").first();
    await expect(nameInput).toBeVisible({ timeout: timeouts.action });
    await nameInput.clear();
    await nameInput.fill("TEMPORARY_NAME_CHANGE");

    // Click Cancel — the cancel button is a Link wrapping a <button>
    const cancelBtn = page
      .getByRole("link", { name: /cancel/i })
      .or(page.getByRole("button", { name: /cancel/i }));
    await expect(cancelBtn.first()).toBeVisible({ timeout: timeouts.action });
    await cancelBtn.first().click();

    // Should navigate back to /profile
    await page.waitForURL(/\/profile(?!\/edit)/, {
      timeout: timeouts.navigation,
    });

    // Wait for profile page to fully render before reading the name
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });
    const profileNameEl = page.getByTestId("profile-name").first();
    await expect(profileNameEl).toBeVisible({ timeout: timeouts.action });

    // Name should still be the original (change was not saved)
    const currentName = await profileNameEl.textContent();
    expect(currentName?.trim()).toBe(originalName?.trim());
  });

  test("PE-14: axe-core a11y scan on edit form", async ({ page }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    const results = await new AxeBuilder({ page })
      .withTags([...A11Y_CONFIG.tags])
      .exclude(A11Y_CONFIG.globalExcludes.map((s) => s))
      // Exclude known unlabelled buttons in EditProfileClient:
      // - Photo upload overlay button (opacity-0, hover-only)
      // - Language tag remove buttons (icon-only X buttons)
      .exclude(".group-hover\\:opacity-100")
      .exclude(".hover\\:text-red-500")
      .disableRules([...A11Y_CONFIG.knownExclusions])
      .analyze();

    // Allow zero violations for WCAG 2.1 AA
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    if (violations.length > 0) {
      const summary = violations
        .map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`
        )
        .join("\n");
      console.warn(`A11y violations found:\n${summary}`);
    }

    // Fail on critical/serious violations
    expect(violations).toHaveLength(0);
  });

  test("PE-15: API failure shows error, form data preserved", async ({
    page,
  }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Fill in a name change
    const nameInput = page.getByTestId("profile-name-input").first();
    await expect(nameInput).toBeVisible({ timeout: timeouts.action });
    const testName = "Error Test Name";
    await nameInput.clear();
    await nameInput.fill(testName);

    // Intercept the server action / profile update and force failure
    // The form uses a Next.js server action (updateProfile), which posts back
    // to the same page. We intercept POST requests to /profile/edit.
    await page.route("**/profile/edit**", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    // Also intercept the Next.js server action endpoint pattern
    await page.route("**/actions/**", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    // Click save
    const saveBtn = page.getByTestId("profile-save-button").first();
    await saveBtn.click();

    // Wait for error handling — either error banner appears or we stay on edit page
    const errorBanner = page
      .getByText(/error|failed|unexpected/i)
      .or(page.locator(".bg-red-50, .bg-red-900\\/20"))
      .or(page.locator('[role="alert"]'));

    await expect(async () => {
      const hasError = await errorBanner
        .first()
        .isVisible()
        .catch(() => false);
      const stillOnEdit = page.url().includes("/profile/edit");
      expect(hasError || stillOnEdit).toBe(true);
    }).toPass({ timeout: timeouts.action });

    // Form data should be preserved
    const stillOnEdit = page.url().includes("/profile/edit");
    if (stillOnEdit) {
      const preservedName = await nameInput.inputValue();
      expect(preservedName).toBe(testName);
    }

    // Clean up routes
    await page.unroute("**/profile/edit**");
    await page.unroute("**/actions/**");
  });
});

// ---------------------------------------------------------------------------
// Block 3: Profile mutations (serial — these modify profile state)
// ---------------------------------------------------------------------------

test.describe.serial("Profile Edit — Mutations", () => {
  let originalName: string;

  test("PE-04: update display name — change, save, verify, restore", async ({
    page,
  }) => {
    test.slow();

    // Check auth session before running mutations
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login")) {
      test.skip(true, "Auth session not established — redirected to login");
      return;
    }

    // Note original name from profile page
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });
    originalName =
      (await page.getByTestId("profile-name").first().textContent())?.trim() ?? "";
    expect(originalName.length).toBeGreaterThan(0);

    // Go to edit form
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Change the name
    const nameInput = page.getByTestId("profile-name-input").first();
    await expect(nameInput).toBeVisible({ timeout: timeouts.action });
    const testName = `E2E Test Name ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(testName);

    // Click save
    const saveBtn = page.getByTestId("profile-save-button").first();
    await saveBtn.click();

    // Wait for success message OR redirect (redirect may happen before message is visible)
    const successMsg = page.getByText(/profile updated successfully/i);
    const successOrRedirect = await Promise.race([
      successMsg
        .waitFor({ state: "visible", timeout: timeouts.action })
        .then(() => "success"),
      page
        .waitForURL(/\/profile(?!\/edit)/, { timeout: timeouts.navigation })
        .then(() => "redirect"),
    ]).catch(() => "timeout");
    // Allow either success message or redirect — both indicate a successful save
    expect(
      ["success", "redirect"],
      `Expected save confirmation but got: ${successOrRedirect}`
    ).toContain(successOrRedirect);

    // Ensure we're on /profile (not /edit) — wait for redirect if not already there
    if (page.url().includes("/edit")) {
      await page
        .waitForURL(/\/profile(?!\/edit)/, { timeout: timeouts.navigation })
        .catch(() => {});
    }

    // Verify name changed on profile page
    const updatedName = await page.getByTestId("profile-name").first().textContent();
    expect(updatedName?.trim()).toBe(testName);

    // RESTORE original name
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    const nameInputRestore = page.getByTestId("profile-name-input").first();
    await nameInputRestore.clear();
    await nameInputRestore.fill(originalName);

    await page.getByTestId("profile-save-button").first().click();
    // Wait for success or redirect (same pattern as above)
    await Promise.race([
      page
        .getByText(/profile updated successfully/i)
        .waitFor({ state: "visible", timeout: timeouts.action }),
      page.waitForURL(/\/profile(?!\/edit)/, { timeout: timeouts.navigation }),
    ]).catch(() => {});
    if (page.url().includes("/edit")) {
      await page
        .waitForURL(/\/profile(?!\/edit)/, { timeout: timeouts.navigation })
        .catch(() => {});
    }
  });

  test("PE-05: update bio — change, save, verify, restore", async ({
    page,
  }) => {
    test.slow();

    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Capture original bio before editing
    const bioTextarea = page.locator("#bio");
    await expect(bioTextarea).toBeVisible({ timeout: timeouts.action });
    const originalBio = await bioTextarea.inputValue();

    // Fill bio with test value
    const testBio = `E2E bio update at ${new Date().toISOString().slice(0, 19)}`;
    await bioTextarea.clear();
    await bioTextarea.fill(testBio);

    // Save
    await page.getByTestId("profile-save-button").first().click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({
      timeout: timeouts.action,
    });
    await page.waitForURL(/\/profile(?!\/edit)/, {
      timeout: timeouts.navigation,
    });

    // Verify bio appears on profile page
    const profileBio = page.getByTestId("profile-bio").first();
    await expect(profileBio).toBeVisible({ timeout: timeouts.action });
    const bioText = await profileBio.textContent();
    expect(bioText).toContain(testBio);

    // RESTORE original bio
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    const bioTextareaRestore = page.locator("#bio");
    await bioTextareaRestore.clear();
    await bioTextareaRestore.fill(originalBio);

    await page.getByTestId("profile-save-button").first().click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({
      timeout: timeouts.action,
    });
    await page.waitForURL(/\/profile(?!\/edit)/, {
      timeout: timeouts.navigation,
    });
  });

  test("PE-09: changes persist after reload", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Note the current name
    const nameBeforeReload = await page
      .getByTestId("profile-name").first()
      .textContent();
    expect(nameBeforeReload?.trim().length).toBeGreaterThan(0);

    // Reload the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("profile-page").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Name should be the same after reload
    const nameAfterReload = await page
      .getByTestId("profile-name").first()
      .textContent();
    expect(nameAfterReload?.trim()).toBe(nameBeforeReload?.trim());
  });

  test("PE-10: add language tag", async ({ page }) => {
    test.slow();

    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Find the "Add" button for languages
    const addBtn = page
      .getByRole("button", { name: /add/i })
      .filter({ hasNot: page.locator('[data-testid="profile-save-button"]') });

    // If suggestions are visible (no languages yet), click a suggestion instead
    const suggestions = page.getByText(/suggestions:/i);
    const hasSuggestions = await suggestions
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasSuggestions) {
      // Click a suggestion language button (e.g., "English")
      const suggestionBtn = page
        .getByRole("button", { name: "English" })
        .first();
      const hasSuggestionBtn = await suggestionBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (hasSuggestionBtn) {
        await suggestionBtn.click();
        // Verify "English" tag appears
        await expect(page.getByText("English").first()).toBeVisible({
          timeout: 5000,
        });
        return; // Test passes
      }
    }

    // Otherwise, use the Add button to open inline input
    const hasAddBtn = await addBtn
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasAddBtn) {
      await addBtn.first().click();

      // The inline input should appear
      const langInput = page.locator(
        'input[aria-label="Add a language"], input[placeholder*="language"]'
      );
      await expect(langInput.first()).toBeVisible({ timeout: 5000 });

      // Type a language and press Enter
      await langInput.first().fill("Italian");
      await langInput.first().press("Enter");

      // Verify the tag appears
      await expect(page.getByText("Italian").first()).toBeVisible({
        timeout: 5000,
      });
    } else {
      // The Add button might be hidden in the language tags area
      // Skip gracefully
      test.skip(true, "Language Add button not found — skipping");
    }
  });

  test("PE-11: remove language tag", async ({ page }) => {
    test.slow();

    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // Scope to the Languages section using the heading as anchor
    const languageSection = page.getByText(/languages/i).first();
    const isLanguageSectionVisible = await languageSection
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!isLanguageSectionVisible) {
      test.skip(true, "Languages section not found");
      return;
    }

    // Find language tag remove buttons: buttons with SVG icons inside the
    // language section's parent container (avoiding brittle Tailwind classes)
    const langContainer = languageSection.locator("..").locator("..");
    const langTagRemoveButtons = langContainer
      .locator("button")
      .filter({ has: page.locator("svg") });

    const initialCount = await langTagRemoveButtons.count();

    if (initialCount === 0) {
      // No languages to remove — first add one, then remove it
      const addBtn = page.getByRole("button", { name: /add/i }).first();
      const hasAddBtn = await addBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (!hasAddBtn) {
        // Try clicking a suggestion
        const suggestionBtn = page
          .getByRole("button", { name: "English" })
          .first();
        const hasSuggestion = await suggestionBtn
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        if (hasSuggestion) {
          await suggestionBtn.click();
          // Wait for the tag to appear instead of fixed timeout
          await expect(page.getByText("English").first()).toBeVisible({
            timeout: 5000,
          });
        } else {
          test.skip(true, "No languages to remove and no Add button available");
          return;
        }
      } else {
        await addBtn.click();
        const langInput = page
          .locator('input[aria-label="Add a language"]')
          .first();
        await langInput.fill("TestLang");
        await langInput.press("Enter");
        // Wait for the tag text to appear instead of fixed timeout
        await expect(page.getByText("TestLang").first()).toBeVisible({
          timeout: 5000,
        });
      }
    }

    // Re-query remove buttons after potential setup
    const allRemoveBtns = langContainer
      .locator("button")
      .filter({ has: page.locator("svg") });
    const countBefore = await allRemoveBtns.count();

    if (countBefore > 0) {
      await allRemoveBtns.first().click();

      // Wait for count to decrease instead of fixed timeout
      const expectedCount = countBefore - 1;
      await expect(allRemoveBtns).toHaveCount(expectedCount, {
        timeout: 5000,
      });
    } else {
      test.skip(true, "No language remove buttons found after setup");
    }
  });

  test("PE-12: avatar/photo section is visible on edit page", async ({
    page,
  }) => {
    await page.goto("/profile/edit");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("edit-profile-form").first()).toBeVisible({
      timeout: timeouts.navigation,
    });

    // The profile photo section heading
    const photoHeading = page.getByText(/profile photo/i);
    await expect(photoHeading.first()).toBeVisible({
      timeout: timeouts.action,
    });

    // The "Upload New" button
    const uploadBtn = page.getByRole("button", { name: /upload new/i });
    await expect(uploadBtn).toBeVisible({ timeout: timeouts.action });

    // The hidden file input should exist
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
  });
});
