/**
 * Dry-run and guarded apply path for contact-first migration backfill.
 * Run: pnpm exec ts-node scripts/cfm-migration-backfill.ts
 * Run: pnpm exec ts-node scripts/cfm-migration-backfill.ts --apply --i-understand
 */

import { randomUUID } from "node:crypto";

import { MIGRATION_COHORTS } from "../src/lib/migration/classifier";
import {
  applyHostManagedMigrationBackfillForListing,
  applyNeedsReviewFlagForListing,
  generateHostManagedMigrationReport,
  isVersionConflictError,
  logBackfillDeferred,
  logBackfillProgress,
  type HostManagedMigrationReport,
} from "../src/lib/migration/backfill";

const PROGRESS_EVENT_INTERVAL = 200;
const MAX_RETRY_ATTEMPTS = 3;

interface BackfillCliArgs {
  apply: boolean;
  batchSize: number;
  listingId: string | null;
}

interface BackfillTarget {
  listingId: string;
  expectedVersion: number;
}

interface BackfillWriteSurface {
  toFlip: BackfillTarget[];
  toStamp: BackfillTarget[];
  toSkipCount: number;
}

interface BackfillRunResult {
  runId: string;
  report: HostManagedMigrationReport;
  writeSurface: BackfillWriteSurface;
  applied: number;
  stamped: number;
  skipped: number;
  missing: number;
  deferred: number;
}

function getErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

function buildWriteSurface(report: HostManagedMigrationReport): BackfillWriteSurface {
  const toFlip = report.rows
    .filter((row) => row.backfillPlan.shouldApply)
    .map((row) => ({
      listingId: row.snapshot.id,
      expectedVersion: row.snapshot.version,
    }));

  const toStamp = report.rows
    .filter(
      (row) =>
        row.snapshot.availabilitySource === "LEGACY_BOOKING" &&
        (row.classification.cohort === "blocked_legacy_state" ||
          row.classification.cohort === "manual_review") &&
        !row.snapshot.needsMigrationReview
    )
    .map((row) => ({
      listingId: row.snapshot.id,
      expectedVersion: row.snapshot.version,
    }));

  return {
    toFlip,
    toStamp,
    toSkipCount: report.summary.totalListings - toFlip.length - toStamp.length,
  };
}

export function parseCliArgs(argv: string[]): BackfillCliArgs {
  let apply = false;
  let dryRun = false;
  let iUnderstand = false;
  let batchSize = 200;
  let listingId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
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

  if (apply && dryRun) {
    throw new Error("Choose either --apply or --dry-run, not both.");
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

function printReportSummary(
  report: HostManagedMigrationReport,
  writeSurface: BackfillWriteSurface,
  runId: string,
  apply: boolean
): void {
  console.log("CFM migration backfill");
  console.log(`Run ID: ${runId}`);
  console.log(`Mode: ${apply ? "APPLY" : "DRY_RUN"}`);
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
  console.log("");
  console.log(`would_flip_to_host_managed: ${writeSurface.toFlip.length}`);
  console.log(
    `would_stamp_needs_migration_review: ${writeSurface.toStamp.length}`
  );
  console.log(`would_skip: ${writeSurface.toSkipCount}`);
}

async function runWithRetry<T>(
  operation: () => Promise<T>,
  listingId: string,
  runId: string
): Promise<{ deferred: false; result: T } | { deferred: true }> {
  let lastErrorCode: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await operation();

      return {
        deferred: false,
        result,
      };
    } catch (error) {
      lastErrorCode = getErrorCode(error);

      if (!isVersionConflictError(error)) {
        throw error;
      }

      if (attempt === MAX_RETRY_ATTEMPTS) {
        logBackfillDeferred(listingId, runId, attempt, lastErrorCode);

        return {
          deferred: true,
        };
      }
    }
  }

  logBackfillDeferred(listingId, runId, MAX_RETRY_ATTEMPTS, lastErrorCode);

  return {
    deferred: true,
  };
}

function maybeEmitProgress(
  processedCount: number,
  batchCursor: string | null,
  counts: Pick<BackfillRunResult, "applied" | "stamped" | "skipped" | "deferred">,
  runId: string,
  force = false
): void {
  if (!force && processedCount % PROGRESS_EVENT_INTERVAL !== 0) {
    return;
  }

  logBackfillProgress(
    {
      appliedCount: counts.applied,
      stampedCount: counts.stamped,
      skippedCount: counts.skipped,
      deferredCount: counts.deferred,
      batchCursor,
    },
    runId
  );
}

export async function runBackfillCli(
  args: BackfillCliArgs,
  options: { now?: Date; runId?: string } = {}
): Promise<BackfillRunResult> {
  const now = options.now ?? new Date();
  const runId = options.runId ?? randomUUID();
  const report = await generateHostManagedMigrationReport({
    batchSize: args.batchSize,
    listingId: args.listingId,
    now,
  });
  const writeSurface = buildWriteSurface(report);

  printReportSummary(report, writeSurface, runId, args.apply);

  if (!args.apply) {
    console.log("");
    console.log("Dry-run only. No listings were mutated.");

    return {
      runId,
      report,
      writeSurface,
      applied: 0,
      stamped: 0,
      skipped: 0,
      missing: 0,
      deferred: 0,
    };
  }

  if (writeSurface.toFlip.length === 0 && writeSurface.toStamp.length === 0) {
    console.log("");
    console.log("No backfill writes are pending for this run.");

    return {
      runId,
      report,
      writeSurface,
      applied: 0,
      stamped: 0,
      skipped: 0,
      missing: 0,
      deferred: 0,
    };
  }

  let applied = 0;
  let stamped = 0;
  let skipped = 0;
  let missing = 0;
  let deferred = 0;
  let processedCount = 0;

  for (const target of writeSurface.toFlip) {
    const outcome = await runWithRetry(
      () => applyHostManagedMigrationBackfillForListing(target.listingId, now, runId),
      target.listingId,
      runId
    );

    if (outcome.deferred) {
      deferred += 1;
      processedCount += 1;
      maybeEmitProgress(
        processedCount,
        target.listingId,
        { applied, stamped, skipped, deferred },
        runId
      );
      continue;
    }

    if (outcome.result.outcome === "applied") {
      applied += 1;
    } else if (outcome.result.outcome === "not_found") {
      missing += 1;
    } else {
      skipped += 1;
    }

    processedCount += 1;
    maybeEmitProgress(
      processedCount,
      target.listingId,
      { applied, stamped, skipped, deferred },
      runId
    );
  }

  for (const target of writeSurface.toStamp) {
    const outcome = await runWithRetry(
      () =>
        applyNeedsReviewFlagForListing(
          target.listingId,
          now,
          runId,
          target.expectedVersion
        ),
      target.listingId,
      runId
    );

    if (outcome.deferred) {
      deferred += 1;
      processedCount += 1;
      maybeEmitProgress(
        processedCount,
        target.listingId,
        { applied, stamped, skipped, deferred },
        runId
      );
      continue;
    }

    if (outcome.result.outcome === "applied") {
      stamped += 1;
    } else if (outcome.result.outcome === "not_found") {
      missing += 1;
    } else {
      skipped += 1;
    }

    processedCount += 1;
    maybeEmitProgress(
      processedCount,
      target.listingId,
      { applied, stamped, skipped, deferred },
      runId
    );
  }

  if (processedCount > 0) {
    const lastCursor =
      writeSurface.toStamp[writeSurface.toStamp.length - 1]?.listingId ??
      writeSurface.toFlip[writeSurface.toFlip.length - 1]?.listingId ??
      null;

    maybeEmitProgress(
      processedCount,
      lastCursor,
      { applied, stamped, skipped, deferred },
      runId,
      true
    );
  }

  console.log("");
  console.log("Apply results:");
  console.log(`  applied: ${applied}`);
  console.log(`  stamped: ${stamped}`);
  console.log(`  skipped_after_recheck: ${skipped}`);
  console.log(`  deferred_after_retries: ${deferred}`);
  console.log(`  not_found: ${missing}`);

  return {
    runId,
    report,
    writeSurface,
    applied,
    stamped,
    skipped,
    missing,
    deferred,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  await runBackfillCli(args);
}

if (process.env.JEST_WORKER_ID === undefined) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "CFM migration backfill failed."
    );
    process.exitCode = 1;
  });
}
