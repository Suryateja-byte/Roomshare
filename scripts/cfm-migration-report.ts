/**
 * Report contact-first migration cohorts without mutating listings.
 * Run: pnpm exec ts-node scripts/cfm-migration-report.ts
 * Run: pnpm exec ts-node scripts/cfm-migration-report.ts --listing-id <id> --json
 */

import {
  MIGRATION_COHORTS,
  MIGRATION_REASON_CODES,
} from "../src/lib/migration/classifier";
import {
  generateHostManagedMigrationReport,
  type HostManagedMigrationReport,
} from "../src/lib/migration/backfill";

interface ReportCliArgs {
  batchSize: number;
  json: boolean;
  listingId: string | null;
}

function parseCliArgs(argv: string[]): ReportCliArgs {
  let batchSize = 200;
  let json = false;
  let listingId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      json = true;
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

  return {
    batchSize,
    json,
    listingId,
  };
}

function printHumanReport(report: HostManagedMigrationReport): void {
  console.log("CFM migration report");
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Listings scanned: ${report.summary.totalListings}`);
  console.log("");
  console.log("Cohorts:");

  for (const cohort of MIGRATION_COHORTS) {
    console.log(`  ${cohort}: ${report.summary.cohortCounts[cohort]}`);
  }

  const activeReasonCodes = MIGRATION_REASON_CODES.filter(
    (reason) => report.summary.reasonCounts[reason] > 0
  );

  console.log("");
  console.log("Reason counts:");

  if (activeReasonCodes.length === 0) {
    console.log("  none");
  } else {
    for (const reason of activeReasonCodes) {
      console.log(`  ${reason}: ${report.summary.reasonCounts[reason]}`);
    }
  }

  if (report.filter.listingId && report.rows[0]) {
    const row = report.rows[0];
    console.log("");
    console.log(`Listing: ${row.snapshot.id}`);
    console.log(`Cohort: ${row.classification.cohort}`);
    console.log(
      `Reasons: ${
        row.classification.reasons.length > 0
          ? row.classification.reasons.join(", ")
          : "none"
      }`
    );
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const report = await generateHostManagedMigrationReport({
    batchSize: args.batchSize,
    listingId: args.listingId,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "CFM migration report failed."
  );
  process.exitCode = 1;
});
