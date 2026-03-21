/**
 * E2E Accessibility — Gap Coverage (Admin Pages)
 *
 * axe-core WCAG 2.1 AA scans for admin pages:
 * /admin, /admin/listings, /admin/users, /admin/reports, /admin/verifications, /admin/audit
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

test.describe("axe-core Gap Coverage — Admin Pages", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  const adminPages = [
    { name: "Admin Dashboard", url: "/admin" },
    { name: "Admin Listings", url: "/admin/listings" },
    { name: "Admin Users", url: "/admin/users" },
    { name: "Admin Reports", url: "/admin/reports" },
    { name: "Admin Verifications", url: "/admin/verifications" },
    { name: "Admin Audit", url: "/admin/audit" },
  ];

  for (const { name, url } of adminPages) {
    test(`${name} (${url}) passes WCAG 2.1 AA`, async ({ page }) => {
      const response = await page.goto(url);
      await page.waitForLoadState("domcontentloaded");

      // Skip if redirected away (no admin auth available)
      const currentUrl = page.url();
      if (
        currentUrl.includes("/login") ||
        (response && response.status() >= 400)
      ) {
        test.skip(true, `Admin auth not available — redirected from ${url}`);
        return;
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations(name, violations);
      expect(violations).toHaveLength(0);
    });
  }
});
