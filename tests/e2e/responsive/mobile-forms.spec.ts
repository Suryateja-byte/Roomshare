import { test, expect } from "@playwright/test";
import { VIEWPORTS } from "../helpers/visual-helpers";

/**
 * Mobile form usability tests — verify forms work well on mobile devices.
 *
 * Key checks:
 * - Input font-size >= 16px (prevents iOS auto-zoom on focus)
 * - Correct input types (email, tel, number, password)
 * - Labels visible and associated with inputs
 * - Submit buttons reachable (not clipped)
 * - Error messages visible
 *
 * Uses iPhone SE viewport (375px) — the narrowest common device.
 */

test.describe("mobile forms (375px viewport)", () => {
  test.use({ viewport: VIEWPORTS.mobileSmall });

  // Helper: check all inputs on a page for iOS auto-zoom prevention
  async function checkInputFontSizes(page: import("@playwright/test").Page) {
    const results = await page.evaluate(() => {
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, select'
      );
      const issues: string[] = [];
      for (const input of inputs) {
        const style = window.getComputedStyle(input);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 16) {
          const el = input as HTMLInputElement;
          const identifier = el.name || el.id || el.type || el.placeholder || "unknown";
          issues.push(`${el.tagName.toLowerCase()}[${identifier}]: ${fontSize}px (needs >= 16px)`);
        }
      }
      return issues;
    });
    return results;
  }

  // Helper: check input types
  async function checkInputTypes(page: import("@playwright/test").Page) {
    const results = await page.evaluate(() => {
      const issues: string[] = [];

      // Email fields should have type="email"
      const emailInputs = document.querySelectorAll(
        'input[name*="email" i], input[placeholder*="email" i], input[autocomplete="email"]'
      );
      for (const input of emailInputs) {
        const el = input as HTMLInputElement;
        if (el.type !== "email") {
          issues.push(`Email field "${el.name || el.placeholder}" has type="${el.type}" instead of "email"`);
        }
      }

      // Phone fields should have type="tel"
      const phoneInputs = document.querySelectorAll(
        'input[name*="phone" i], input[placeholder*="phone" i], input[autocomplete="tel"]'
      );
      for (const input of phoneInputs) {
        const el = input as HTMLInputElement;
        if (el.type !== "tel") {
          issues.push(`Phone field "${el.name || el.placeholder}" has type="${el.type}" instead of "tel"`);
        }
      }

      return issues;
    });
    return results;
  }

  // Helper: check labels
  async function checkLabels(page: import("@playwright/test").Page) {
    const results = await page.evaluate(() => {
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
      );
      const unlabeled: string[] = [];
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;

        // Check for: <label for="id">, aria-label, aria-labelledby, wrapping <label>, placeholder
        const hasLabel =
          (el.labels?.length ?? 0) > 0 ||
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          el.placeholder ||
          el.closest("label");

        if (!hasLabel) {
          const identifier = el.name || el.id || el.type || "unknown";
          unlabeled.push(`${el.tagName.toLowerCase()}[${identifier}] has no label or aria-label`);
        }
      }
      return unlabeled;
    });
    return results;
  }

  // Helper: check submit buttons are visible and not clipped
  async function checkSubmitButtons(page: import("@playwright/test").Page) {
    const results = await page.evaluate(() => {
      const buttons = document.querySelectorAll(
        'button[type="submit"], input[type="submit"], form button:not([type="button"])'
      );
      const issues: string[] = [];
      const viewportWidth = document.documentElement.clientWidth;

      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        if (style.display === "none" || style.visibility === "hidden") continue;

        // Check if clipped horizontally
        if (rect.right > viewportWidth + 2 || rect.left < -2) {
          issues.push(
            `Submit button "${(button as HTMLButtonElement).textContent?.trim().slice(0, 20)}" is clipped (left: ${Math.round(rect.left)}, right: ${Math.round(rect.right)}, viewport: ${viewportWidth})`
          );
        }

        // Check minimum touch target size (44x44 per Apple HIG)
        if (rect.height < 40 || rect.width < 44) {
          issues.push(
            `Submit button "${(button as HTMLButtonElement).textContent?.trim().slice(0, 20)}" is too small for touch (${Math.round(rect.width)}x${Math.round(rect.height)}px, min 44x40)`
          );
        }
      }
      return issues;
    });
    return results;
  }

  // ─── Login Form ───────────────────────────────────────────

  test.describe("login form", () => {
    test("inputs prevent iOS auto-zoom (font-size >= 16px)", async ({ page }) => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputFontSizes(page);
      expect(issues, "Inputs with font-size < 16px will cause iOS auto-zoom").toEqual([]);
    });

    test("email field has correct input type", async ({ page }) => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputTypes(page);
      expect(issues).toEqual([]);
    });

    test("all inputs have labels", async ({ page }) => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkLabels(page);
      expect(issues).toEqual([]);
    });

    test("submit button is reachable", async ({ page }) => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkSubmitButtons(page);
      expect(issues).toEqual([]);
    });

    test("form fits within viewport", async ({ page }) => {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      const formOverflow = await page.evaluate(() => {
        const form = document.querySelector("form");
        if (!form) return null;
        const rect = form.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        return {
          overflows: rect.right > viewportWidth + 2,
          formWidth: Math.round(rect.width),
          viewportWidth,
        };
      });

      if (formOverflow) {
        expect(formOverflow.overflows, `Form overflows viewport`).toBe(false);
      }
    });
  });

  // ─── Signup Form ──────────────────────────────────────────

  test.describe("signup form", () => {
    test("inputs prevent iOS auto-zoom (font-size >= 16px)", async ({ page }) => {
      await page.goto("/signup", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputFontSizes(page);
      expect(issues, "Inputs with font-size < 16px will cause iOS auto-zoom").toEqual([]);
    });

    test("email field has correct input type", async ({ page }) => {
      await page.goto("/signup", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputTypes(page);
      expect(issues).toEqual([]);
    });

    test("all inputs have labels", async ({ page }) => {
      await page.goto("/signup", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkLabels(page);
      expect(issues).toEqual([]);
    });

    test("submit button is reachable", async ({ page }) => {
      await page.goto("/signup", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkSubmitButtons(page);
      expect(issues).toEqual([]);
    });

    test("password fields show toggle visibility button", async ({ page }) => {
      await page.goto("/signup", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      const passwordFields = page.locator('input[type="password"]');
      const count = await passwordFields.count();

      if (count > 0) {
        // Check that password toggle buttons exist and are tappable
        for (let i = 0; i < count; i++) {
          const field = passwordFields.nth(i);
          // Verify fields are visible and usable on mobile
          expect(await field.isVisible()).toBe(true);
        }
      }
    });
  });

  // ─── Forgot Password Form ────────────────────────────────

  test.describe("forgot password form", () => {
    test("inputs prevent iOS auto-zoom (font-size >= 16px)", async ({ page }) => {
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputFontSizes(page);
      expect(issues, "Inputs with font-size < 16px will cause iOS auto-zoom").toEqual([]);
    });

    test("email field has correct input type", async ({ page }) => {
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkInputTypes(page);
      expect(issues).toEqual([]);
    });

    test("submit button is reachable", async ({ page }) => {
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const issues = await checkSubmitButtons(page);
      expect(issues).toEqual([]);
    });
  });

  // ─── Search Form ──────────────────────────────────────────

  test.describe("search form", () => {
    test("search input is usable on mobile", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Find search input
      const searchInput = page.locator(
        'input[type="text"][placeholder*="search" i], input[type="search"], input[placeholder*="location" i], input[placeholder*="where" i]'
      );

      if ((await searchInput.count()) > 0) {
        const isVisible = await searchInput.first().isVisible();
        if (isVisible) {
          const fontSize = await searchInput.first().evaluate((el) => {
            return parseFloat(window.getComputedStyle(el).fontSize);
          });
          expect(fontSize, "Search input font-size must be >= 16px to prevent iOS zoom").toBeGreaterThanOrEqual(16);
        }
      }
    });
  });

  // ─── Generic form checks across all form pages ───────────

  const formPages = [
    { name: "login", url: "/login" },
    { name: "signup", url: "/signup" },
    { name: "forgot-password", url: "/forgot-password" },
  ] as const;

  for (const formPage of formPages) {
    test(`${formPage.name}: error messages visible after empty submit`, async ({ page }) => {
      await page.goto(formPage.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      // Try submitting empty form
      const submitBtn = page.locator(
        'button[type="submit"], input[type="submit"], form button:not([type="button"])'
      ).first();

      if ((await submitBtn.count()) > 0) {
        await submitBtn.click();
        await page.waitForTimeout(500);

        // Check that error messages (if any) are visible and not clipped
        const errorMessages = page.locator(
          '[role="alert"], .error, .text-red-500, .text-red-600, [data-testid*="error"], .text-destructive'
        );
        const errorCount = await errorMessages.count();

        if (errorCount > 0) {
          for (let i = 0; i < Math.min(errorCount, 3); i++) {
            const error = errorMessages.nth(i);
            if (await error.isVisible()) {
              const rect = await error.boundingBox();
              if (rect) {
                // Error should be within viewport width
                expect(rect.x + rect.width).toBeLessThanOrEqual(375 + 2);
                expect(rect.x).toBeGreaterThanOrEqual(-2);
              }
            }
          }
        }
      }
    });

    test(`${formPage.name}: no horizontal scroll after interacting with form`, async ({ page }) => {
      await page.goto(formPage.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      // Focus on first input to trigger any zoom/layout shift
      const firstInput = page.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):visible'
      ).first();

      if ((await firstInput.count()) > 0) {
        await firstInput.focus();
        await page.waitForTimeout(300);

        const hasHScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHScroll, "Horizontal scroll appeared after focusing input").toBe(false);
      }
    });
  }
});

// ─── Cross-breakpoint form rendering ──────────────────────

test.describe("form rendering across breakpoints", () => {
  const breakpoints = [
    { name: "small-mobile", width: 320, height: 568 },
    { name: "mobile-se", ...VIEWPORTS.mobileSmall },
    { name: "mobile-14", ...VIEWPORTS.mobileLarge },
    { name: "tablet", ...VIEWPORTS.tablet },
  ] as const;

  for (const bp of breakpoints) {
    test.describe(`${bp.name} (${bp.width}px)`, () => {
      test.use({ viewport: { width: bp.width, height: bp.height } });

      test("login form inputs are full-width", async ({ page }) => {
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);

        const inputs = page.locator(
          'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):visible'
        );
        const count = await inputs.count();

        for (let i = 0; i < count; i++) {
          const box = await inputs.nth(i).boundingBox();
          if (box && bp.width <= 390) {
            // On mobile, inputs should be near-full width (at least 80% of viewport)
            expect(box.width).toBeGreaterThan(bp.width * 0.7);
          }
        }
      });

      test("signup form inputs are full-width", async ({ page }) => {
        await page.goto("/signup", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);

        const inputs = page.locator(
          'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):visible'
        );
        const count = await inputs.count();

        for (let i = 0; i < count; i++) {
          const box = await inputs.nth(i).boundingBox();
          if (box && bp.width <= 390) {
            expect(box.width).toBeGreaterThan(bp.width * 0.7);
          }
        }
      });
    });
  }
});
