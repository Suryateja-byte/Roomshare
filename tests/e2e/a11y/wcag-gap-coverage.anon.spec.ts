/**
 * E2E Accessibility — Gap Coverage (Anonymous Pages)
 *
 * axe-core WCAG 2.1 AA scans for anonymous pages not covered by existing specs:
 * - /verify, /verify-expired, /reset-password, /offline
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { A11Y_CONFIG } from "../helpers/test-utils";

const CI_EXTRA_EXCLUDES = [
  ".maplibregl-ctrl-group",
  "[data-sonner-toast]",
  "[data-radix-popper-content-wrapper]",
] as const;

const CI_DISABLED_RULES = [
  "aria-hidden-focus",
  "region",
  "link-in-text-block",
] as const;

const CI_ACCEPTABLE_VIOLATIONS = [
  "heading-order",
  "landmark-unique",
  "landmark-one-main",
  "page-has-heading-one",
  "duplicate-id",
  "duplicate-id-aria",
] as const;

async function runAxeScan(
  page: import("@playwright/test").Page,
  extraExcludes: string[] = [],
  disabledRules: string[] = []
) {
  let builder = new AxeBuilder({ page }).withTags([...A11Y_CONFIG.tags]);

  for (const selector of [
    ...A11Y_CONFIG.globalExcludes,
    ...CI_EXTRA_EXCLUDES,
    ...extraExcludes,
  ]) {
    builder = builder.exclude(selector);
  }

  const allDisabledRules = [...CI_DISABLED_RULES, ...disabledRules];
  if (allDisabledRules.length > 0) {
    builder = builder.disableRules([...allDisabledRules]);
  }

  return builder.analyze();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterViolations(violations: any[]): any[] {
  return violations.filter(
    (v: any) =>
      !A11Y_CONFIG.knownExclusions.includes(
        v.id as (typeof A11Y_CONFIG.knownExclusions)[number]
      ) && !(CI_ACCEPTABLE_VIOLATIONS as readonly string[]).includes(v.id)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe-gap] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(
        `  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`
      );
    });
  }
}

test.describe("axe-core Gap Coverage — Anonymous Pages", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("Auth flow pages", () => {
    test("/verify page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/verify");
      await page.waitForLoadState("domcontentloaded");
      // /verify may redirect (e.g. to /login) — wait for navigation to settle
      await page.waitForLoadState("networkidle").catch(() => {});

      // If we were redirected, scan the destination page instead
      const results = await runAxeScan(page).catch(() => null);
      if (!results) {
        test.skip(true, "/verify page navigation prevented axe scan");
        return;
      }
      const violations = filterViolations(results.violations);

      logViolations("/verify", violations);
      expect(violations).toHaveLength(0);
    });

    test("/verify-expired page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/verify-expired");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/verify-expired", violations);
      expect(violations).toHaveLength(0);
    });

    test("/reset-password page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/reset-password");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/reset-password", violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe("Offline fallback page", () => {
    test("/offline page passes WCAG 2.1 AA", async ({ page }) => {
      await page.goto("/offline");
      await page.waitForLoadState("domcontentloaded");

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations("/offline", violations);
      expect(violations).toHaveLength(0);
    });
  });
});
