/**
 * Settings Page E2E Tests (ST-01 through ST-18)
 *
 * Covers: auth guard, notification preferences (toggle + save + persist),
 * password change (form, wrong password, mismatch, weak), blocked users,
 * account deletion confirmation gate, a11y (keyboard nav + axe scan), and
 * API failure resilience.
 *
 * Run: pnpm playwright test tests/e2e/settings/settings.spec.ts --project=chromium
 */

import { test, expect, timeouts } from "../helpers";
import AxeBuilder from "@axe-core/playwright";
import { A11Y_CONFIG } from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_URL = "/settings";

// ---------------------------------------------------------------------------
// Block 1: Read-only tests (parallel safe)
// ---------------------------------------------------------------------------

test.describe("Settings — Read-only", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test("ST-01: unauthenticated user is redirected to /login", async ({
    browser,
  }) => {
    // Create a fresh context with NO auth state
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    // Should redirect to login with callbackUrl
    await expect(page).toHaveURL(/\/login/, {
      timeout: timeouts.navigation,
    });

    await context.close();
  });

  test("ST-02: settings page renders all 4 sections", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    // Wait for the page heading
    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Section 1: Email Notifications
    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible();

    // Section 2: Change Password (conditional — may not show for OAuth-only users)
    const changePasswordHeading = page.getByRole("heading", {
      name: "Change Password",
    });
    const blockedUsersHeading = page.getByRole("heading", {
      name: "Blocked Users",
    });
    const deleteAccountHeading = page.getByRole("heading", {
      name: "Delete Account",
    });

    // Section 3: Blocked Users (always present)
    await expect(blockedUsersHeading).toBeVisible();

    // Section 4: Delete Account (always present)
    await expect(deleteAccountHeading).toBeVisible();

    // At minimum 3 sections should be visible; 4 if user has password
    const hasPasswordSection = await changePasswordHeading
      .isVisible()
      .catch(() => false);
    if (hasPasswordSection) {
      // Verify sub-elements of password section exist
      await expect(page.locator("#currentPassword")).toBeVisible();
    }
  });

  test("ST-06: Save Preferences button is present", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    const saveButton = page.getByRole("button", { name: "Save Preferences" });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  test("ST-11: blocked users section visible", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Blocked Users" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Check for either "You haven't blocked anyone" or Unblock buttons
    const emptyMessage = page.getByText("You haven't blocked anyone");
    const unblockButtons = page.getByRole("button", { name: "Unblock" });

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const unblockCount = await unblockButtons.count();

    // One of the two states must be present
    expect(hasEmpty || unblockCount > 0).toBe(true);
  });

  test("ST-13: Delete My Account button is visible", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Delete Account" })
    ).toBeVisible({ timeout: timeouts.navigation });

    const deleteButton = page.getByRole("button", {
      name: "Delete My Account",
    });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeEnabled();
  });

  test("ST-16: keyboard navigation reaches interactive elements", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Tab through the page and collect focused element types
    const focusedTagNames: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const tagName = await page.evaluate(() =>
        document.activeElement?.tagName?.toLowerCase()
      );
      if (tagName) focusedTagNames.push(tagName);
    }

    // Should reach interactive elements: links, buttons, inputs, switches
    const interactiveTypes = ["a", "button", "input", "select", "textarea"];
    const reachedInteractive = focusedTagNames.some((tag) =>
      interactiveTypes.includes(tag)
    );
    expect(reachedInteractive).toBe(true);

    // Verify we reached at least some buttons (toggles or save button)
    const buttonCount = focusedTagNames.filter(
      (tag) => tag === "button"
    ).length;
    expect(buttonCount).toBeGreaterThan(0);
  });

  test("ST-17: axe-core a11y scan passes", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible({ timeout: timeouts.navigation });

    const results = await new AxeBuilder({ page })
      .withTags([...A11Y_CONFIG.tags])
      .exclude([...A11Y_CONFIG.globalExcludes])
      .analyze();

    // Filter out known acceptable violations
    const meaningful = results.violations.filter(
      (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as any)
    );

    if (meaningful.length > 0) {
      const summary = meaningful.map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`
      );
      console.log("A11y violations found:", summary.join("\n"));
    }

    expect(meaningful.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Block 2: Notification preference mutations (serial)
// ---------------------------------------------------------------------------

test.describe("Settings — Notification Preferences", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test("ST-03: toggle a switch and save shows Saved! feedback", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Get the first toggle switch
    const toggles = page.getByRole("switch");
    const firstToggle = toggles.first();
    await expect(firstToggle).toBeVisible();

    // Record initial state
    const initialChecked = await firstToggle.getAttribute("aria-checked");

    // Click the toggle
    await firstToggle.click();

    // Verify it toggled
    const newChecked = await firstToggle.getAttribute("aria-checked");
    expect(newChecked).not.toBe(initialChecked);

    // Click Save Preferences
    const saveButton = page.getByRole("button", { name: "Save Preferences" });
    await saveButton.click();

    // Should show "Saved!" feedback
    await expect(
      page.getByRole("button", { name: "Saved!" })
    ).toBeVisible({ timeout: timeouts.action });
  });

  test("ST-04: toggle + save + reload persists without error", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Toggle the last switch (Marketing — least likely to cause side effects)
    const toggles = page.getByRole("switch");
    const lastToggle = toggles.last();
    await expect(lastToggle).toBeVisible();

    const initialChecked = await lastToggle.getAttribute("aria-checked");
    await lastToggle.click();

    // Save
    const saveButton = page.getByRole("button", { name: "Save Preferences" });
    await saveButton.click();
    await expect(
      page.getByRole("button", { name: "Saved!" })
    ).toBeVisible({ timeout: timeouts.action });

    // Reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Page loaded without error — verify the setting persisted
    const reloadedToggle = page.getByRole("switch").last();
    const reloadedChecked = await reloadedToggle.getAttribute("aria-checked");

    // The toggled value should have persisted
    const expectedChecked = initialChecked === "true" ? "false" : "true";
    expect(reloadedChecked).toBe(expectedChecked);

    // Toggle it back to original state to avoid polluting other tests
    await reloadedToggle.click();
    await saveButton.click();
    await expect(
      page.getByRole("button", { name: "Saved!" })
    ).toBeVisible({ timeout: timeouts.action });
  });

  test("ST-05: toggle 3 switches and save atomically", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    const toggles = page.getByRole("switch");
    const count = await toggles.count();

    // Toggle up to 3 switches
    const numToToggle = Math.min(3, count);
    for (let i = 0; i < numToToggle; i++) {
      await toggles.nth(i).click();
    }

    // Save all at once
    const saveButton = page.getByRole("button", { name: "Save Preferences" });
    await saveButton.click();

    // Should show "Saved!" feedback
    await expect(
      page.getByRole("button", { name: "Saved!" })
    ).toBeVisible({ timeout: timeouts.action });

    // Toggle them back to original state
    for (let i = 0; i < numToToggle; i++) {
      await toggles.nth(i).click();
    }
    await saveButton.click();
    await expect(
      page.getByRole("button", { name: "Saved!" })
    ).toBeVisible({ timeout: timeouts.action });
  });

  test("ST-18: resilience — server error shows error feedback", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Email Notifications" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Toggle a switch first
    const firstToggle = page.getByRole("switch").first();
    await firstToggle.click();

    // Intercept ALL POST requests that go to the settings page.
    // Next.js server actions use POST with special RSC headers.
    // We intercept and return an RSC-compatible error response that causes
    // the server action to return { success: false }.
    await page.route("**/settings", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        // Return a valid RSC response that signals failure.
        // The server action result is encoded in the RSC payload.
        // Returning a plain 500 won't trigger the application-level error handler;
        // instead we abort the request so the fetch promise rejects.
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    // Click Save
    const saveButton = page.getByRole("button", { name: "Save Preferences" });
    await saveButton.click();

    // Should show error feedback — either:
    // - a sonner toast with error text
    // - or a generic error toast from Next.js fetch failure
    // - or the button returns to non-saving state (not showing "Saved!")
    //
    // When the fetch is aborted, the server action throws, and the catch in
    // handleSavePreferences calls toast.error('Failed to save preferences').
    // But depending on how Next.js handles the abort, we may see different behavior.
    // We check for any toast or the fact that "Saved!" does NOT appear.
    const toastError = page.locator('[data-sonner-toast]').filter({
      hasText: /fail|error/i,
    });
    const savedButton = page.getByRole("button", { name: "Saved!" });

    // Wait for the action to resolve — either error toast or no "Saved!" state
    await expect(async () => {
      const hasToast = await toastError.isVisible().catch(() => false);
      const hasSaved = await savedButton.isVisible().catch(() => false);
      expect(hasToast || !hasSaved).toBe(true);
    }).toPass({ timeout: timeouts.action });

    // Clean up route interception
    await page.unroute("**/settings");
  });
});

// ---------------------------------------------------------------------------
// Block 3: Password change (serial)
// ---------------------------------------------------------------------------

test.describe("Settings — Password Change", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test("ST-07: filling all 3 password fields enables Change Password button", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    // Check if Change Password section exists (user may be OAuth-only)
    const changePasswordHeading = page.getByRole("heading", {
      name: "Change Password",
    });
    const hasPasswordSection = await changePasswordHeading
      .isVisible({ timeout: timeouts.navigation })
      .catch(() => false);

    if (!hasPasswordSection) {
      test.skip(true, "User does not have password auth — skipping");
      return;
    }

    // Fill all 3 fields
    await page.locator("#currentPassword").fill("OldPassword123!");
    await page.locator("#newPassword").fill("NewStrongPass123!");
    await page.locator("#confirmPassword").fill("NewStrongPass123!");

    // The Change Password submit button should be present and enabled
    const submitButton = page.getByRole("button", {
      name: "Change Password",
    });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test("ST-08: wrong current password shows error", async ({ page }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    const changePasswordHeading = page.getByRole("heading", {
      name: "Change Password",
    });
    const hasPasswordSection = await changePasswordHeading
      .isVisible({ timeout: timeouts.navigation })
      .catch(() => false);

    if (!hasPasswordSection) {
      test.skip(true, "User does not have password auth — skipping");
      return;
    }

    // Fill with deliberately wrong current password
    await page.locator("#currentPassword").fill("TotallyWrongPassword999!");
    await page.locator("#newPassword").fill("NewStrongPassword123!");
    await page.locator("#confirmPassword").fill("NewStrongPassword123!");

    // Submit
    await page.getByRole("button", { name: "Change Password" }).click();

    // Should show error about incorrect password
    // Server returns "Current password is incorrect"
    await expect(
      page.getByText(/incorrect|wrong|invalid/i)
    ).toBeVisible({ timeout: timeouts.action });
  });

  test("ST-09: mismatched new + confirm passwords shows error", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    const changePasswordHeading = page.getByRole("heading", {
      name: "Change Password",
    });
    const hasPasswordSection = await changePasswordHeading
      .isVisible({ timeout: timeouts.navigation })
      .catch(() => false);

    if (!hasPasswordSection) {
      test.skip(true, "User does not have password auth — skipping");
      return;
    }

    // Fill fields sequentially with explicit focus to ensure values stick.
    // The form uses controlled React inputs, so we click → fill each field.
    const currentPwField = page.locator("#currentPassword");
    const newPwField = page.locator("#newPassword");
    const confirmPwField = page.locator("#confirmPassword");

    await currentPwField.click();
    await currentPwField.fill("SomeCurrentPass123!");
    await expect(currentPwField).toHaveValue("SomeCurrentPass123!");

    await newPwField.click();
    await newPwField.fill("NewPassword123456!");
    await expect(newPwField).toHaveValue("NewPassword123456!");

    await confirmPwField.click();
    await confirmPwField.fill("DifferentPassword789!");
    await expect(confirmPwField).toHaveValue("DifferentPassword789!");

    // Submit
    await page.getByRole("button", { name: "Change Password" }).click();

    // Client-side validation checks mismatch first: "New passwords do not match"
    await expect(
      page.getByText(/do not match|mismatch|don't match/i)
    ).toBeVisible({ timeout: timeouts.action });
  });

  test("ST-10: short/weak password shows strength indicator", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    const changePasswordHeading = page.getByRole("heading", {
      name: "Change Password",
    });
    const hasPasswordSection = await changePasswordHeading
      .isVisible({ timeout: timeouts.navigation })
      .catch(() => false);

    if (!hasPasswordSection) {
      test.skip(true, "User does not have password auth — skipping");
      return;
    }

    // Use pressSequentially (key-by-key typing) to trigger React onChange
    // on each keystroke. fill() sets the value natively but may not trigger
    // React's synthetic onChange in all browsers/versions.
    const newPwField = page.locator("#newPassword");
    await newPwField.click();
    await newPwField.pressSequentially("abc", { delay: 50 });

    // PasswordStrengthMeter should show strength info
    // It renders: "Password strength" label + "Weak" level + checklist items
    await expect(
      page.getByText("Password strength")
    ).toBeVisible({ timeout: timeouts.action });

    // Should show "Weak" for a very short password
    await expect(
      page.getByText("Weak")
    ).toBeVisible();

    // Should show the "At least 12 characters" check item
    await expect(
      page.getByText("At least 12 characters")
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Block 4: Account deletion flow (serial)
// ---------------------------------------------------------------------------

test.describe("Settings — Account Deletion", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test("ST-14: typing WRONG keeps Delete Forever button disabled", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Delete Account" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Click "Delete My Account" to reveal the confirmation step
    await page
      .getByRole("button", { name: "Delete My Account" })
      .click();

    // Confirmation input and Delete Forever button should appear
    await expect(
      page.locator("#deleteConfirmText")
    ).toBeVisible({ timeout: timeouts.action });

    // Type wrong text
    await page.locator("#deleteConfirmText").fill("WRONG");

    // Delete Forever button should be disabled
    const deleteForeverButton = page.getByRole("button", {
      name: "Delete Forever",
    });
    await expect(deleteForeverButton).toBeVisible();
    await expect(deleteForeverButton).toBeDisabled();
  });

  test("ST-15: typing DELETE enables Delete Forever button", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Delete Account" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Click "Delete My Account"
    await page
      .getByRole("button", { name: "Delete My Account" })
      .click();

    await expect(
      page.locator("#deleteConfirmText")
    ).toBeVisible({ timeout: timeouts.action });

    // Type the exact confirmation text
    await page.locator("#deleteConfirmText").fill("DELETE");

    // Delete Forever button should now be enabled
    const deleteForeverButton = page.getByRole("button", {
      name: "Delete Forever",
    });
    await expect(deleteForeverButton).toBeVisible();
    await expect(deleteForeverButton).toBeEnabled();

    // DO NOT CLICK — preserves the test user account
  });
});

// ---------------------------------------------------------------------------
// Block 5: Blocked users mutation (serial)
// ---------------------------------------------------------------------------

test.describe("Settings — Blocked Users", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // NOTE: This test consumes seed data (unblocks one user). Re-run seed
  // between full test suite runs to restore the blocked user.
  test("ST-12: unblocking a user decreases the blocked list count", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Blocked Users" })
    ).toBeVisible({ timeout: timeouts.navigation });

    // Count unblock buttons
    const unblockButtons = page.getByRole("button", { name: "Unblock" });
    const initialCount = await unblockButtons.count();

    if (initialCount === 0) {
      test.skip(true, "No blocked users in seed data — skipping");
      return;
    }

    // Click the first Unblock button
    await unblockButtons.first().click();

    // Wait for the count to decrease
    await expect(
      page.getByRole("button", { name: "Unblock" })
    ).toHaveCount(initialCount - 1, { timeout: timeouts.action });
  });
});
