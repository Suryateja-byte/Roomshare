/**
 * Shared axe-core accessibility test helpers.
 *
 * Centralises `runAxeScan`, `filterViolations`, `logViolations` and the
 * CI-specific exclusion / disabled-rule / acceptable-violation lists that
 * were previously duplicated across 7+ a11y spec files.
 */

import { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { A11Y_CONFIG } from "./test-utils";

/** Return type of `AxeBuilder.analyze()` */
type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
/** A single axe violation entry */
type AxeViolation = AxeResults["violations"][number];

// ---------------------------------------------------------------------------
// CI-environment constants (union of all per-file lists)
// ---------------------------------------------------------------------------

/** Extra selectors to exclude from axe scans in CI (third-party widgets, map controls). */
export const CI_EXTRA_EXCLUDES: string[] = [
  ".maplibregl-ctrl-group",
  "[data-sonner-toast]",
  "[data-radix-popper-content-wrapper]",
];

/**
 * Rules disabled globally to reduce CI false positives from
 * framework / third-party markup.
 */
export const CI_DISABLED_RULES: string[] = [
  "aria-hidden-focus",
  "region",
  "link-in-text-block",
];

/**
 * Additional rule IDs that are acceptable in CI headless environments.
 * These typically fire on framework/third-party markup or headless
 * rendering artifacts.
 */
export const CI_ACCEPTABLE_VIOLATIONS: string[] = [
  "heading-order",
  "landmark-unique",
  "landmark-one-main",
  "page-has-heading-one",
  "duplicate-id",
  "duplicate-id-aria",
  // Map/bottom-sheet patterns that fire in headless CI due to
  // overlay stacking, framer-motion animations, and maplibre canvas
  "region",
  "nested-interactive",
  // Maplibre and Radix UI inject ARIA attributes that don't match their roles
  // (e.g., maplibre canvas elements, radix scroll areas, sheet handles)
  "aria-allowed-attr",
];

// ---------------------------------------------------------------------------
// Scan helper
// ---------------------------------------------------------------------------

export interface RunAxeScanOptions {
  /** Additional CSS selectors to exclude from the scan. */
  extraExcludes?: string[];
  /** Additional axe rule IDs to disable. */
  disabledRules?: string[];
  /**
   * Whether to include the shared CI_EXTRA_EXCLUDES and CI_DISABLED_RULES.
   * Defaults to `true`. Set to `false` for specs that only need
   * `A11Y_CONFIG.globalExcludes` (e.g. auth pages, listing-detail).
   */
  includeCIDefaults?: boolean;
}

/**
 * Run an axe-core WCAG 2.1 AA scan with shared configuration.
 *
 * By default the scan excludes `A11Y_CONFIG.globalExcludes` **and**
 * `CI_EXTRA_EXCLUDES`, and disables `CI_DISABLED_RULES`.
 * Pass `includeCIDefaults: false` to skip the CI lists.
 */
export async function runAxeScan(
  page: Page,
  options: RunAxeScanOptions = {},
): Promise<AxeResults> {
  const {
    extraExcludes = [],
    disabledRules = [],
    includeCIDefaults = true,
  } = options;

  let builder = new AxeBuilder({ page }).withTags([...A11Y_CONFIG.tags]);

  const excludes = [
    ...A11Y_CONFIG.globalExcludes,
    ...(includeCIDefaults ? CI_EXTRA_EXCLUDES : []),
    ...extraExcludes,
  ];
  for (const selector of excludes) {
    builder = builder.exclude(selector);
  }

  const allDisabledRules = [
    ...(includeCIDefaults ? CI_DISABLED_RULES : []),
    ...disabledRules,
  ];
  if (allDisabledRules.length > 0) {
    builder = builder.disableRules([...allDisabledRules]);
  }

  return builder.analyze();
}

// ---------------------------------------------------------------------------
// Violation helpers
// ---------------------------------------------------------------------------

/**
 * Filter out known exclusions (`A11Y_CONFIG.knownExclusions`) **and**
 * CI-acceptable violations.
 *
 * Pass a custom `acceptableIds` array to override the default
 * `CI_ACCEPTABLE_VIOLATIONS` list (e.g. for files that don't use it).
 */
export function filterViolations(
  violations: AxeViolation[],
  acceptableIds: string[] = CI_ACCEPTABLE_VIOLATIONS,
): AxeViolation[] {
  return violations.filter(
    (v) =>
      !A11Y_CONFIG.knownExclusions.includes(
        v.id as (typeof A11Y_CONFIG.knownExclusions)[number],
      ) && !acceptableIds.includes(v.id),
  );
}

/** Log violations to console for CI debugging. */
export function logViolations(label: string, violations: AxeViolation[]): void {
  if (violations.length > 0) {
    console.log(`[axe] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(
        `  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`,
      );
    });
  }
}
