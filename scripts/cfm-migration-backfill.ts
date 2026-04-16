/**
 * Dry-run and guarded apply path for contact-first migration backfill.
 * Run: pnpm exec ts-node scripts/cfm-migration-backfill.ts
 * Run: pnpm exec ts-node scripts/cfm-migration-backfill.ts --apply --i-understand
 */

import { MIGRATION_COHORTS } from "../src/lib/migration/classifier";
import {
  applyHostManagedMigrationBackfillForListing,
  generateHostManagedMigrationReport,
  type HostManagedMigrationReport,
} from "../src/lib/migration/backfill";

interface BackfillCliArgs {
  apply: boolean;
  batchSize: number;
  listingId: string | null;
}

function parseCliArgs(argv: string[]): BackfillCliArgs {
  let apply = false;
  let iUnderstand = false;
  let batchSize = 200;
  let listingId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--i-understand") {
      iUnderstand = true;
      continue;
    }

    if (arg === "--listing-id") {
      listingId = argv[index + 1] ?? null;
      if (!listingId) {
        throw new Error("--listing-id requires a value.");
      }
      index += 1;
      continue;
    }

    if (arg === "--batch-size") {
      const rawValue = argv[index + 1] ?? "";
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--batch-size must be a positive integer.");
      }
      batchSize = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply !== iUnderstand) {
    throw new Error("Apply mode requires both --apply and --i-understand.");
  }

  return {
    apply,
    batchSize,
    listingId,
  };
}

function printReportSummary(report: HostManagedMigrationReport): void {
  console.log("CFM migration backfill");
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Listings scanned: ${report.summary.totalListings}`);
  console.log("");
  console.log("Cohorts:");

  for (const cohort of MIGRATION_COHORTS) {
    console.log(`  ${cohort}: ${report.summary.cohortCounts[cohort]}`);
  }

  console.log("");
  console.log(
    `Convertible clean candidates: ${report.summary.cohortCounts.clean_auto_convert}`
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const report = await generateHostManagedMigrationReport({
    batchSize: args.batchSize,
    listingId: args.listingId,
  });

  printReportSummary(report);

  const candidateIds = report.rows
    .filter((row) => row.backfillPlan.shouldApply)
    .map((row) => row.snapshot.id);

  if (!args.apply) {
    console.log("");
    console.log("Dry-run only. No listings were mutated.");
    return;
  }

  if (candidateIds.length === 0) {
    console.log("");
    console.log("No clean auto-convert candidates were found.");
    return;
  }

  let applied = 0;
  let skipped = 0;
  let missing = 0;

  for (const listingId of candidateIds) {
    const result = await applyHostManagedMigrationBackfillForListing(listingId);

    if (result.outcome === "applied") {
      applied += 1;
      continue;
    }

    if (result.outcome === "not_found") {
      missing += 1;
      continue;
    }

    skipped += 1;
  }

  console.log("");
  console.log("Apply results:");
  console.log(`  applied: ${applied}`);
  console.log(`  skipped_after_recheck: ${skipped}`);
  console.log(`  not_found: ${missing}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "CFM migration backfill failed."
  );
  process.exitCode = 1;
});
